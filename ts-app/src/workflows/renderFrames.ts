import {proxyActivities} from '@temporalio/workflow';
import * as activities from '../activities';
import {Render} from '../interfaces';

interface Params extends Render {
    seeds: Array<string>;
    mkDir?: string;
}

interface Output {}

const {createFsDirectory} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

const {screenshotCanvasArchiveDownloads} = proxyActivities<typeof activities>({
    startToCloseTimeout: '24 hours',
});

export async function renderFrames(params: Params): Promise<Output> {
    let outputDirectory = params.outDir;

    if (params.mkDir) {
        const {outDir} = await createFsDirectory({
            rootPath: params.outDir,
            dirName: params.mkDir,
        });
        outputDirectory = outDir;
    }

    await Promise.all(
        params.seeds.map(seed => {
            return screenshotCanvasArchiveDownloads({
                uuid: params.uuid,
                seed,
                url: params.url,
                width: params.width,
                height: params.height,
                outDir: outputDirectory,
                timeout: params.timeout,
            });
        }),
    );

    return {};
}
