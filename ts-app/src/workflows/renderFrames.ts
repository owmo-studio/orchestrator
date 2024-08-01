import {proxyActivities} from '@temporalio/workflow';
import * as activities from '../activities';
import {Frame} from '../interfaces';

interface Params {
    url: string;
    seeds: Array<string>;
    width: number;
    height: number;
    dirpath: string;
    timeout: number;
    makeSubDir?: string;
    frame?: Frame;
    uuid: string;
}

interface Output {}

const {createFsDirectory} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

const {screenshotCanvasArchiveDownloads} = proxyActivities<typeof activities>({
    startToCloseTimeout: '24 hours',
});

export async function renderFrames(params: Params): Promise<Output> {
    let outputDirectory = params.dirpath;

    if (params.makeSubDir) {
        const {dirpath} = await createFsDirectory({
            rootPath: params.dirpath,
            dirName: params.makeSubDir,
        });
        outputDirectory = dirpath;
    }

    await Promise.all(
        params.seeds.map(seed => {
            return screenshotCanvasArchiveDownloads({
                seed,
                url: params.url,
                width: params.width,
                height: params.height,
                dirpath: outputDirectory,
                timeout: params.timeout,
                frame: params.frame,
            });
        }),
    );

    return {};
}
