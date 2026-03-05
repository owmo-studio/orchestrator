import {continueAsNew, proxyActivities} from '@temporalio/workflow';
import * as activities from '../activities';
import {MAX_CONTINUATION_CHUNK_SIZE, MAX_WORKFLOW_COMMAND_BATCH} from '../constants';
import {EventScript} from '../event-scripts/run-pre-posts';
import {ScriptConfig, Segment} from '../interfaces';

interface Params {
    uuid: string;
    url: string;
    width: number;
    height: number;
    devicePixelRatio: number;
    outputDirectory: string;
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
    const scriptParams = {scriptConfig: params.scriptConfig, execPath: params.outputDirectory};

    const framesForThisRun = params.segment.frames.slice(0, MAX_CONTINUATION_CHUNK_SIZE);
    const remainingFrames = params.segment.frames.slice(MAX_CONTINUATION_CHUNK_SIZE);

    for (let i = 0; i < framesForThisRun.length; i += MAX_WORKFLOW_COMMAND_BATCH) {
        const batch = framesForThisRun.slice(i, i + MAX_WORKFLOW_COMMAND_BATCH);

        await Promise.all(
            batch.map(async frame => {
                const args = [`${params.seed}`, `${params.width}`, `${params.height}`, `${params.segment.padding}`, `${params.segment.fps}`, '', `${frame}`];

                await EventScript.Frame.Pre({...scriptParams, args});

                await snapshotCanvasArchiveDownloads({
                    uuid: params.uuid,
                    seed: params.seed,
                    url: params.url,
                    width: params.width,
                    height: params.height,
                    devicePixelRatio: params.devicePixelRatio,
                    outputRootPath: params.outputDirectory,
                    timeout: params.timeout,
                    frame: {
                        index: frame,
                        fps: params.segment.fps,
                        padding: params.segment.padding,
                        isPadded: true,
                    },
                });

                await EventScript.Frame.Post({...scriptParams, args});
            }),
        );
    }

    if (remainingFrames.length > 0) {
        await continueAsNew<typeof renderSegment>({
            ...params,
            segment: {
                ...params.segment,
                frames: remainingFrames,
            },
        });
    }
}
