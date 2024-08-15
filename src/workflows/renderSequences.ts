import {proxyActivities} from '@temporalio/workflow';
import {executeChild} from '@temporalio/workflow';
import * as activities from '../activities';
import {Sequence, Segment} from '../interfaces';
import {MAX_CHILD_FRAMES} from '../constants';

interface Params {
    uuid: string;
    url: string;
    width: number;
    height: number;
    outDir: string;
    timeout: number;
    seeds: Array<string>;
    sequence: Sequence;
    mkDir?: string;
}

const {makeFsDirectory} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

export async function renderSequences(params: Params): Promise<void> {
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

    await Promise.all(
        params.seeds.map(async (seed, seedIndex) => {
            return Promise.all(
                segmentsToRender.map(segment => {
                    return executeChild('renderSegment', {
                        args: [
                            {
                                uuid: params.uuid,
                                url: params.url,
                                seed,
                                width: params.width,
                                height: params.height,
                                outDir: outputDirectory,
                                timeout: params.timeout,
                                segment,
                            },
                        ],
                        workflowId: `${params.uuid}_s[${seedIndex}]_c[${segment.chunk}]`,
                    });
                }),
            );
        }),
    );
}
