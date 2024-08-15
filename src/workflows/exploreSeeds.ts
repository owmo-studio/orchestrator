import {proxyActivities} from '@temporalio/workflow';
import * as activities from '../activities';
import {EventExecScripts} from './eventExecScripts';
import {ScriptConfig} from '../interfaces';

interface Params {
    uuid: string;
    url: string;
    width: number;
    height: number;
    outDir: string;
    timeout: number;
    count: number;
    mkDir?: string;
    scriptConfig?: ScriptConfig;
}

const {getArrayOfHashes, makeFsDirectory} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

const {snapshotCanvasArchiveDownloads} = proxyActivities<typeof activities>({
    startToCloseTimeout: '24 hours',
});

export async function exploreSeeds(params: Params): Promise<void> {
    const {scriptConfig} = params;

    await EventExecScripts.Workflow.Pre({scriptConfig, execPath: params.outDir});

    const {hashes} = await getArrayOfHashes({
        uuid: params.uuid,
        count: params.count,
    });

    let outputDirectory = params.outDir;
    if (params.mkDir) {
        const {outDir} = await makeFsDirectory({
            rootPath: params.outDir,
            dirName: params.mkDir,
        });
        outputDirectory = outDir;
    }

    await Promise.all(
        hashes.map(hash => {
            return snapshotCanvasArchiveDownloads({
                uuid: params.uuid,
                seed: hash,
                url: params.url,
                width: params.width,
                height: params.height,
                outDir: outputDirectory,
                timeout: params.timeout,
                frame: {
                    fps: 1,
                    index: 0,
                    padding: 0,
                    isPadded: false,
                },
            });
        }),
    );

    await EventExecScripts.Workflow.Post({scriptConfig, execPath: params.outDir});
}
