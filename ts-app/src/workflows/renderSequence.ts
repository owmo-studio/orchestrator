import {executeChild} from '@temporalio/workflow';
import {Sequence} from '../interfaces';

interface Params {
    url: string;
    seed: string;
    width: number;
    height: number;
    dirpath: string;
    timeout: number;
    sequence: Sequence;
    workflowId: string;
}

interface Output {
    frames: Array<{
        image: string;
        outputs: string;
    }>;
}

export async function renderSequence(params: Params): Promise<Output> {
    const totalFrames = params.sequence.end - params.sequence.start + 1;
    const framesToRender: Array<number> = Array.from(new Array(totalFrames), (_, i) => params.sequence.start + i);

    const frames: Array<{
        image: string;
        outputs: string;
    }> = [];

    const responses = await Promise.all(
        framesToRender.map(frame => {
            return executeChild('renderFrame', {
                args: [
                    {
                        url: params.url,
                        seed: params.seed,
                        width: params.width,
                        height: params.height,
                        dirpath: params.dirpath,
                        timeout: params.timeout,
                        frame: {
                            ...params.sequence,
                            frame,
                        },
                    },
                ],
                workflowId: `${params.workflowId}-${frame}`,
            });
        }),
    );

    for (const response of responses) {
        frames.push({image: response.image, outputs: response.outputs});
    }

    return {frames};
}
