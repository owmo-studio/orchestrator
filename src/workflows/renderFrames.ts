import {continueAsNew, proxyActivities} from '@temporalio/workflow';
import * as activities from '../activities';
import {MAX_CONTINUATION_CHUNK_SIZE, MAX_WORKFLOW_COMMAND_BATCH} from '../constants';
import {EventScript} from '../event-scripts/run-pre-posts';
import {ScriptConfig} from '../interfaces';

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
    subDirectory?: string;
    scriptConfig?: ScriptConfig;
    skipWorkPre?: boolean;
    outputDirectory?: string;
}

const {makeFsDirectory} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

const {getArrayOfHashes} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

const {snapshotCanvasArchiveDownloads} = proxyActivities<typeof activities>({
    startToCloseTimeout: '24 hours',
    heartbeatTimeout: '30 seconds',
});

export async function renderFrames(params: Params): Promise<void> {
    let outputDirectory = params.outputDirectory ?? params.outputRootPath;

    if (!params.outputDirectory && params.subDirectory) {
        const {dirPath} = await makeFsDirectory({
            rootPath: params.outputRootPath,
            dirName: params.subDirectory,
        });
        outputDirectory = dirPath;
    }

    const scriptParams = {scriptConfig: params.scriptConfig, execPath: outputDirectory};

    if (!params.skipWorkPre) {
        await EventScript.Work.Pre(scriptParams);
    }

    const isExploration = typeof params.seedCount === 'number';
    const seedOffset = params.seedOffset ?? 0;

    let seedsForThisRun: Array<string>;
    let remainingSeeds: Array<string> | undefined;
    let remainingSeedCount = 0;

    if (isExploration) {
        const count = Math.min(MAX_CONTINUATION_CHUNK_SIZE, params.seedCount ?? 0);
        const {hashes} = await getArrayOfHashes({
            uuid: params.uuid,
            count,
            offset: seedOffset,
        });
        seedsForThisRun = hashes;
        remainingSeedCount = Math.max(0, (params.seedCount ?? 0) - count);
    } else {
        const allSeeds = params.seeds ?? [];
        seedsForThisRun = allSeeds.slice(0, MAX_CONTINUATION_CHUNK_SIZE);
        remainingSeeds = allSeeds.slice(MAX_CONTINUATION_CHUNK_SIZE);
    }

    for (let i = 0; i < seedsForThisRun.length; i += MAX_WORKFLOW_COMMAND_BATCH) {
        const batch = seedsForThisRun.slice(i, i + MAX_WORKFLOW_COMMAND_BATCH);

        await Promise.all(
            batch.map(async seed => {
                const args = [`${seed}`, `${params.width}`, `${params.height}`, '', '', '', ''];

                await EventScript.Frame.Pre({...scriptParams, args});

                await snapshotCanvasArchiveDownloads({
                    uuid: params.uuid,
                    seed,
                    url: params.url,
                    width: params.width,
                    height: params.height,
                    devicePixelRatio: params.devicePixelRatio,
                    outputRootPath: outputDirectory,
                    timeout: params.timeout,
                    frame: {
                        fps: 1,
                        index: 0,
                        padding: 0,
                        isPadded: false,
                    },
                });

                await EventScript.Frame.Post({...scriptParams, args});
            }),
        );
    }

    if (isExploration && remainingSeedCount > 0) {
        await continueAsNew<typeof renderFrames>({
            ...params,
            seeds: undefined,
            seedCount: remainingSeedCount,
            seedOffset: seedOffset + seedsForThisRun.length,
            skipWorkPre: true,
            outputDirectory,
        });
    } else if (!isExploration && (remainingSeeds?.length ?? 0) > 0) {
        await continueAsNew<typeof renderFrames>({
            ...params,
            seeds: remainingSeeds,
            skipWorkPre: true,
            outputDirectory,
        });
    }

    await EventScript.Work.Post(scriptParams);
}
