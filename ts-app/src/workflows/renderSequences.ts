import {proxyActivities} from '@temporalio/workflow';
import {executeChild} from '@temporalio/workflow';
import * as activities from '../activities';
import {Sequence, Segment, Render} from '../interfaces';
import {MAX_CHILD_FRAMES} from '../constants';

interface Params extends Render {
    seeds: Array<string>;
    sequence: Sequence;
    mkDir?: string;
}

interface Output {}

const {createFsDirectory} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

export async function renderSequences(params: Params): Promise<Output> {
    let outputDirectory = params.outDir;

    if (params.mkDir) {
        const {outDir} = await createFsDirectory({
            rootPath: params.outDir,
            dirName: params.mkDir,
        });
        outputDirectory = outDir;
    }

    const totalFrames = params.sequence.end - params.sequence.start + 1;
    const framePadding = String(params.sequence.end - params.sequence.start).length;

    const segmentsToRender: Array<Segment> = [];
    for (let i = 0; i < totalFrames; i += MAX_CHILD_FRAMES) {
        const startFrame = i;
        const endFrame = Math.min(i + (MAX_CHILD_FRAMES - 1), params.sequence.end);

        segmentsToRender.push({
            fps: params.sequence.fps,
            start: startFrame,
            end: endFrame,
            chunk: Math.floor(endFrame / MAX_CHILD_FRAMES),
            padding: framePadding,
        });
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

    return {};
}
