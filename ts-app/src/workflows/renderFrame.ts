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
    makeSubDir?: boolean;
    frame?: Frame;
}

interface Output {
    image: string;
    outputs: string;
}

const {createFsDirectory} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

const {screenshotCanvasArchiveDownloads} = proxyActivities<typeof activities>({
    startToCloseTimeout: '6 hours',
});

export async function renderFrame(params: Params): Promise<Output> {
    let outputDirectory = params.dirpath;
    if (params.makeSubDir) {
        const {dirpath} = await createFsDirectory({
            rootPath: params.dirpath,
            dirName: `${params.seed}`,
        });
        outputDirectory = dirpath;
    }

    const response = await screenshotCanvasArchiveDownloads({...params, dirpath: outputDirectory});
    return {
        image: response.screenshot,
        outputs: response.archive,
    };
}
