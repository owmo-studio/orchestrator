import {proxyActivities} from '@temporalio/workflow';
import * as activities from '../activities';
import {Frame} from '../interfaces';

interface Params {
    url: string;
    seed: string;
    width: number;
    height: number;
    dirpath: string;
    timeout: number;
    frame?: Frame;
}

interface Output {
    snapshot: string;
}

const {screenshotCanvasToFile} = proxyActivities<typeof activities>({
    startToCloseTimeout: '6 hours',
});

export async function snapshotFrame(params: Params): Promise<Output> {
    return await screenshotCanvasToFile(params);
}
