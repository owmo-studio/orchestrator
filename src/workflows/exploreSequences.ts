import {executeChild, proxyActivities} from '@temporalio/workflow';
import * as activities from '../activities';
import {MAX_CHILD_FRAMES} from '../constants';
import {EventScript} from '../event-scripts/run-pre-posts';
import {ScriptConfig, Segment, Sequence} from '../interfaces';

interface Params {
    uuid: string;
    url: string;
    width: number;
    height: number;
    devicePixelRatio: number;
    outDir: string;
    timeout: number;
    count: number;
    sequence: Sequence;
    mkDir?: string;
    scriptConfig?: ScriptConfig;
}

const {getArrayOfHashes, makeFsDirectory} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

export async function exploreSequences(params: Params): Promise<void> {
    const {hashes} = await getArrayOfHashes({
        uuid: params.uuid,
        count: params.count,
    });

    let outputDirectory = params.outDir;

    if (params.mkDir) {
        const {outDir} = await makeFsDirectory({
            rootPath: params.outDir,
            dirName: params.mkDir,
        });
        outputDirectory = outDir;
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

    const scriptParams = {scriptConfig: params.scriptConfig, execPath: outputDirectory};

    await EventScript.Work.Pre(scriptParams);

    await Promise.all(
        hashes.map(async (seed, seedIndex) => {
            const args = [`${seed}`, `${params.width}`, `${params.height}`, `${params.sequence.padding}`, `${params.sequence.fps}`];
            await EventScript.Sequence.Pre({...scriptParams, args});
            await Promise.all(
                segmentsToRender.map(segment => {
                    return executeChild('renderSegment', {
                        args: [
                            {
                                uuid: params.uuid,
                                url: params.url,
                                seed,
                                width: params.width,
                                height: params.height,
                                devicePixelRatio: params.devicePixelRatio,
                                outDir: outputDirectory,
                                timeout: params.timeout,
                                segment,
                                scriptConfig: params.scriptConfig,
                            },
                        ],
                        workflowId: `${params.uuid}_s[${seedIndex}]_c[${segment.chunk}]`,
                    });
                }),
            );
            await EventScript.Sequence.Post({...scriptParams, args});
        }),
    );

    await EventScript.Work.Post(scriptParams);
}
