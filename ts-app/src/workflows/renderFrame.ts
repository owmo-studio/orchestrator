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
    image: string;
    outputs: string;
}

const {screenshotCanvasArchiveDownloads} = proxyActivities<typeof activities>({
    startToCloseTimeout: '6 hours',
});

export async function renderFrame(params: Params): Promise<Output> {
    const response = await screenshotCanvasArchiveDownloads(params);
    return {
        image: response.screenshot,
        outputs: response.archive,
    };
}
