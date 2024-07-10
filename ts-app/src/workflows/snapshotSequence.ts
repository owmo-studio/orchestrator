import {executeChild} from '@temporalio/workflow';

interface Params {
    url: string;
    seed: string;
    width: number;
    height: number;
    dirpath: string;
    timeout: number;
    framerate: number;
    startFrame: number;
    endFrame: number;
    workflowId: string;
}

interface Output {
    snapshots: Array<string>;
}

export async function snapshotSequence(params: Params): Promise<Output> {
    const totalFrames = params.endFrame - params.startFrame + 1;
    const maxDigits = String(totalFrames - 1).length;

    const frames: Array<number> = Array.from(new Array(totalFrames), (_, i) => params.startFrame + i);

    const snapshots: Array<string> = [];

    const responses = await Promise.all(
        frames.map((frame: number) => {
            const paddedFrame = String(frame).padStart(maxDigits, '0');
            return executeChild('snapshotFrame', {
                args: [
                    {
                        url: params.url,
                        seed: params.seed,
                        width: params.width,
                        height: params.height,
                        filepath: `${params.dirpath}/${params.seed}.${paddedFrame}.png`,
                        framerate: params.framerate,
                        frame,
                    },
                ],
                workflowId: `${params.workflowId}-${paddedFrame}`,
            });
        }),
    );

    for (const response of responses) {
        snapshots.push(response.snapshot);
    }

    return {snapshots};
}
