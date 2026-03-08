import {continueAsNew, executeChild, proxyActivities} from '@temporalio/workflow';
import * as activities from '../activities';
import {MAX_CHILD_FRAMES, MAX_SEQUENCE_SEEDS_PER_RUN, MAX_WORKFLOW_COMMAND_BATCH} from '../constants';
import {EventScript} from '../event-scripts/run-pre-posts';
import {ScriptConfig, Segment, Sequence} from '../interfaces';

interface Params {
    uuid: string;
    url: string;
    width: number;
    height: number;
    devicePixelRatio: number;
    outputRootPath: string;
    timeout: number;
    seeds?: Array<string>;
    seedCount?: number;
    seedOffset?: number;
    sequence: Sequence;
    subDirectory?: string;
    perSeedDirectory: boolean;
    scriptConfig?: ScriptConfig;
    skipWorkPre?: boolean;
    outputDirectory?: string;
    seedStartIndex?: number;
}

const {makeFsDirectory} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

const {getArrayOfHashes} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

export async function renderSequences(params: Params): Promise<void> {
    let outputDirectory = params.outputDirectory ?? params.outputRootPath;

    if (!params.outputDirectory && params.subDirectory) {
        const {dirPath} = await makeFsDirectory({
            rootPath: params.outputRootPath,
            dirName: params.subDirectory,
        });
        outputDirectory = dirPath;
    }

    const uniqueFrames: Set<number> = new Set();
    for (const frameRange of params.sequence.ranges) {
        for (let f = frameRange.start; f <= frameRange.end; f++) {
            uniqueFrames.add(f);
        }
    }

    const framesToRender = Array.from(uniqueFrames);
    const segmentsToRender: Array<Segment> = [];

    let chunk: number = 0;
    for (let i = 0; i < framesToRender.length; i += MAX_CHILD_FRAMES) {
        segmentsToRender.push({
            chunk,
            frames: framesToRender.slice(i, i + MAX_CHILD_FRAMES),
            padding: params.sequence.padding,
            fps: params.sequence.fps,
        });
        chunk++;
    }

    const workParams = {scriptConfig: params.scriptConfig, execPath: outputDirectory};

    if (!params.skipWorkPre) {
        await EventScript.Work.Pre(workParams);
    }

    const isExploration = typeof params.seedCount === 'number';
    const seedOffset = params.seedOffset ?? 0;
    const seedStartIndex = params.seedStartIndex ?? seedOffset;

    let seedsForThisRun: Array<string>;
    let remainingSeeds: Array<string> | undefined;
    let remainingSeedCount = 0;

    if (isExploration) {
        const count = Math.min(MAX_SEQUENCE_SEEDS_PER_RUN, params.seedCount ?? 0);
        const {hashes} = await getArrayOfHashes({
            uuid: params.uuid,
            count,
            offset: seedOffset,
        });
        seedsForThisRun = hashes;
        remainingSeedCount = Math.max(0, (params.seedCount ?? 0) - count);
    } else {
        const allSeeds = params.seeds ?? [];
        seedsForThisRun = allSeeds.slice(0, MAX_SEQUENCE_SEEDS_PER_RUN);
        remainingSeeds = allSeeds.slice(MAX_SEQUENCE_SEEDS_PER_RUN);
    }

    for (let seedIndex = 0; seedIndex < seedsForThisRun.length; seedIndex++) {
        const seed = seedsForThisRun[seedIndex];
        const globalSeedIndex = seedStartIndex + seedIndex;
        const args = [`${seed}`, `${params.width}`, `${params.height}`, `${params.sequence.padding}`, `${params.sequence.fps}`, `${uniqueFrames.size}`, ''];

        let seedOutputDirectory = outputDirectory;

        if (params.perSeedDirectory) {
            const {dirPath} = await makeFsDirectory({
                rootPath: outputDirectory,
                dirName: `${seed}`,
            });
            seedOutputDirectory = dirPath;
        }

        await EventScript.Sequence.Pre({scriptConfig: params.scriptConfig, execPath: seedOutputDirectory, args});

        for (let i = 0; i < segmentsToRender.length; i += MAX_WORKFLOW_COMMAND_BATCH) {
            const segmentBatch = segmentsToRender.slice(i, i + MAX_WORKFLOW_COMMAND_BATCH);
            await Promise.all(
                segmentBatch.map(segment => {
                    return executeChild('renderSegment', {
                        args: [
                            {
                                uuid: params.uuid,
                                url: params.url,
                                seed,
                                width: params.width,
                                height: params.height,
                                devicePixelRatio: params.devicePixelRatio,
                                outputDirectory: seedOutputDirectory,
                                timeout: params.timeout,
                                segment,
                                scriptConfig: params.scriptConfig,
                            },
                        ],
                        workflowId: `${params.uuid}_s[${globalSeedIndex}]_c[${segment.chunk}]`,
                    });
                }),
            );
        }

        await EventScript.Sequence.Post({scriptConfig: params.scriptConfig, execPath: seedOutputDirectory, args});
    }

    if (isExploration && remainingSeedCount > 0) {
        await continueAsNew<typeof renderSequences>({
            ...params,
            seeds: undefined,
            seedCount: remainingSeedCount,
            seedOffset: seedOffset + seedsForThisRun.length,
            skipWorkPre: true,
            outputDirectory,
            seedStartIndex: seedStartIndex + seedsForThisRun.length,
        });
    } else if (!isExploration && (remainingSeeds?.length ?? 0) > 0) {
        await continueAsNew<typeof renderSequences>({
            ...params,
            seeds: remainingSeeds,
            skipWorkPre: true,
            outputDirectory,
            seedStartIndex: seedStartIndex + seedsForThisRun.length,
        });
    }

    await EventScript.Work.Post(workParams);
}
