import {proxyActivities} from '@temporalio/workflow';
import * as activities from '../activities';
import {ScriptConfig, Segment} from '../interfaces';
import {EventScript} from '../events/run-scripts';

interface Params {
    uuid: string;
    url: string;
    width: number;
    height: number;
    devicePixelRatio: number;
    outDir: string;
    timeout: number;
    seed: string;
    segment: Segment;
    scriptConfig?: ScriptConfig;
}

const {snapshotCanvasArchiveDownloads} = proxyActivities<typeof activities>({
    startToCloseTimeout: '24 hours',
    heartbeatTimeout: '5 minutes',
});

export async function renderSegment(params: Params): Promise<void> {
    const scriptParams = {scriptConfig: params.scriptConfig, execPath: params.outDir};

    await Promise.all(
        params.segment.frames.map(async frame => {
            await EventScript.Frame.Pre({...scriptParams, args: [`${params.seed}`, `${frame}`, `${params.segment.padding}`]});
            await snapshotCanvasArchiveDownloads({
                uuid: params.uuid,
                seed: params.seed,
                url: params.url,
                width: params.width,
                height: params.height,
                devicePixelRatio: params.devicePixelRatio,
                outDir: params.outDir,
                timeout: params.timeout,
                frame: {
                    index: frame,
                    fps: params.segment.fps,
                    padding: params.segment.padding,
                    isPadded: true,
                },
            });
            await EventScript.Frame.Post({...scriptParams, args: [`${params.seed}`, `${frame}`, `${params.segment.padding}`]});
        }),
    );
}
