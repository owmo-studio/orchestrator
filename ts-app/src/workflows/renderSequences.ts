import {proxyActivities} from '@temporalio/workflow';
import {executeChild} from '@temporalio/workflow';
import * as activities from '../activities';
import {Sequence, Segment} from '../interfaces';
import {MAX_CHILD_FRAMES} from '../constants';

interface Params {
    url: string;
    seeds: Array<string>;
    width: number;
    height: number;
    dirpath: string;
    timeout: number;
    sequence: Sequence;
    makeSubDir?: string;
    uuid: string;
}

interface Output {
    frames: Array<{
        image: string;
        outputs: string;
    }>;
}

const {createFsDirectory} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

export async function renderSequences(params: Params): Promise<Output> {
    let outputDirectory = params.dirpath;

    if (params.makeSubDir) {
        const {dirpath} = await createFsDirectory({
            rootPath: params.dirpath,
            dirName: params.makeSubDir,
        });
        outputDirectory = dirpath;
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

    const responses = await Promise.all(
        params.seeds.map(async (seed, seedIndex) => {
            return Promise.all(
                segmentsToRender.map(segment => {
                    return executeChild('renderSegment', {
                        args: [
                            {
                                url: params.url,
                                seed,
                                width: params.width,
                                height: params.height,
                                dirpath: outputDirectory,
                                timeout: params.timeout,
                                segment,
                                index: seedIndex,
                                uuid: params.uuid,
                            },
                        ],
                        workflowId: `${params.uuid}__s${seedIndex}__c${segment.chunk}`,
                    });
                }),
            );

            // return Promise.all(
            //     framesToRender.map(frame => {
            //         return executeChild('renderFrames', {
            //             args: [
            //                 {
            //                     url: params.url,
            //                     seeds: [seed],
            //                     width: params.width,
            //                     height: params.height,
            //                     dirpath: outputDirectory,
            //                     timeout: params.timeout,
            //                     frame: {
            //                         ...params.sequence,
            //                         frame,
            //                         padding: framePadding,
            //                     },
            //                     uuid: params.uuid,
            //                 },
            //             ],
            //             workflowId: `${params.uuid}__${seedIndex}-${frame}`,
            //         });
            //     }),
            // );
        }),
    );

    const frames: Array<{
        image: string;
        outputs: string;
    }> = [];

    for (const seedResponses of responses) {
        for (const segmentResponses of seedResponses) {
            for (const frame of segmentResponses.frames) {
                frames.push({...frame});
            }
        }
    }

    return {frames};
}
