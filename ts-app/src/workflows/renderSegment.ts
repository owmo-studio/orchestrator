import {proxyActivities} from '@temporalio/workflow';
import * as activities from '../activities';
import {Render, Segment} from '../interfaces';

interface Params extends Render {
    seed: string;
    segment: Segment;
}

interface Output {}

const {screenshotCanvasArchiveDownloads} = proxyActivities<typeof activities>({
    startToCloseTimeout: '24 hours',
});

export async function renderSegment(params: Params): Promise<Output> {
    const totalFrames = params.segment.end - params.segment.start + 1;
    const framesToRender: Array<number> = Array.from(new Array(totalFrames), (_, i) => params.segment.start + i);

    await Promise.all(
        framesToRender.map(frame => {
            return screenshotCanvasArchiveDownloads({
                uuid: params.uuid,
                seed: params.seed,
                url: params.url,
                width: params.width,
                height: params.height,
                outDir: params.outDir,
                timeout: params.timeout,
                frame: {
                    ...params.segment,
                    frame,
                },
            });
        }),
    );

    return {};
}
