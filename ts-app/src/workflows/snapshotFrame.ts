import {proxyActivities} from '@temporalio/workflow';
import * as activities from '../activities/screenshotCanvasToFile';

interface Params {
    url: string;
    seed: string;
    width: number;
    height: number;
    filepath: string;
    timeout: number;
    frame?: number;
    framerate?: number;
}

interface Output {
    snapshot: string;
}

const {screenshotCanvasToFile} = proxyActivities<typeof activities>({
    startToCloseTimeout: '12 hours',
});

export async function snapshotFrame(params: Params): Promise<Output> {
    return await screenshotCanvasToFile(params);
}
