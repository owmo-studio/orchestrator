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
    snapshots: Array<string>;
}

export async function snapshotSequence(params: Params): Promise<Output> {
    const totalFrames = params.sequence.end - params.sequence.start + 1;
    const frames: Array<number> = Array.from(new Array(totalFrames), (_, i) => params.sequence.start + i);

    const snapshots: Array<string> = [];

    const responses = await Promise.all(
        frames.map(frame => {
            return executeChild('snapshotFrame', {
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
        snapshots.push(response.snapshot);
    }

    return {snapshots};
}
