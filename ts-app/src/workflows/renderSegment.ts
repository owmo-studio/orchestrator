import {proxyActivities} from '@temporalio/workflow';
import * as activities from '../activities';
import {Segment} from '../interfaces';

interface Params {
    uuid: string;
    url: string;
    width: number;
    height: number;
    outDir: string;
    timeout: number;
    seed: string;
    segment: Segment;
}

const {snapshotCanvasArchiveDownloads} = proxyActivities<typeof activities>({
    startToCloseTimeout: '24 hours',
});

export async function renderSegment(params: Params): Promise<void> {
    await Promise.all(
        params.segment.frames.map(frame => {
            return snapshotCanvasArchiveDownloads({
                uuid: params.uuid,
                seed: params.seed,
                url: params.url,
                width: params.width,
                height: params.height,
                outDir: params.outDir,
                timeout: params.timeout,
                frame: {
                    index: frame,
                    fps: params.segment.fps,
                    padding: params.segment.padding,
                    isPadded: true,
                },
            });
        }),
    );
}
