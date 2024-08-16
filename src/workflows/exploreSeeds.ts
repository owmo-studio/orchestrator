import {proxyActivities} from '@temporalio/workflow';
import * as activities from '../activities';
import {EventScript} from '../common/eventScript';
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

    const scriptsParams = {scriptConfig: params.scriptConfig, execPath: outputDirectory};

    await EventScript.Workflow.Pre(scriptsParams);

    await Promise.all(
        hashes.map(hash => {
            return Promise.all([
                // Pre
                EventScript.Activity.Pre(scriptsParams),

                // Snapshot
                snapshotCanvasArchiveDownloads({
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
                }),

                // Post
                EventScript.Activity.Post({...scriptsParams, args: [`${hash}`]}),
            ]);
        }),
    );

    await EventScript.Workflow.Post(scriptsParams);
}
