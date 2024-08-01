import {executeChild} from '@temporalio/workflow';
import {Segment} from '../interfaces';

interface Params {
    url: string;
    seed: string;
    width: number;
    height: number;
    dirpath: string;
    timeout: number;
    segment: Segment;
    index: number;
    uuid: string;
}

interface Output {}

export async function renderSegment(params: Params): Promise<Output> {
    const totalFrames = params.segment.end - params.segment.start + 1;
    const framesToRender: Array<number> = Array.from(new Array(totalFrames), (_, i) => params.segment.start + i);

    await Promise.all(
        framesToRender.map(frame => {
            return executeChild('renderFrames', {
                args: [
                    {
                        url: params.url,
                        seeds: [params.seed],
                        width: params.width,
                        height: params.height,
                        dirpath: params.dirpath,
                        timeout: params.timeout,
                        frame: {
                            ...params.segment,
                            frame,
                        },
                        uuid: params.uuid,
                    },
                ],
                workflowId: `${params.uuid}__s${params.index}__c${params.segment.chunk}__f${frame}`,
            });
        }),
    );

    return {};
}
