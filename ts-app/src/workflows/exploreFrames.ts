import {proxyActivities} from '@temporalio/workflow';
import * as activities from '../activities';
import {Render} from '../interfaces';

interface Params extends Render {
    count: number;
    mkDir?: string;
}

interface Output {}

const {makeArrayOfHashes, createFsDirectory} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

const {screenshotCanvasArchiveDownloads} = proxyActivities<typeof activities>({
    startToCloseTimeout: '24 hours',
});

export async function exploreFrames(params: Params): Promise<Output> {
    const {hashes} = await makeArrayOfHashes({
        uuid: params.uuid,
        count: params.count,
    });

    let outputDirectory = params.outDir;
    if (params.mkDir) {
        const {outDir} = await createFsDirectory({
            rootPath: params.outDir,
            dirName: params.mkDir,
        });
        outputDirectory = outDir;
    }

    await Promise.all(
        hashes.map(hash => {
            return screenshotCanvasArchiveDownloads({
                uuid: params.uuid,
                seed: hash,
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
