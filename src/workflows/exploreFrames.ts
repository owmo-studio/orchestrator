import {proxyActivities} from '@temporalio/workflow';
import * as activities from '../activities';
import {EventScript} from '../event-scripts/run-pre-posts';
import {ScriptConfig} from '../interfaces';

interface Params {
    uuid: string;
    url: string;
    width: number;
    height: number;
    devicePixelRatio: number;
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
    heartbeatTimeout: '5 minutes',
});

export async function exploreFrames(params: Params): Promise<void> {
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

    const scriptParams = {scriptConfig: params.scriptConfig, execPath: outputDirectory};

    await EventScript.Work.Pre(scriptParams);

    await Promise.all(
        hashes.map(async seed => {
            const args = [`${seed}`, `${params.width}`, `${params.height}`];
            await EventScript.Frame.Pre({...scriptParams, args});
            await snapshotCanvasArchiveDownloads({
                uuid: params.uuid,
                seed,
                url: params.url,
                width: params.width,
                height: params.height,
                devicePixelRatio: params.devicePixelRatio,
                outDir: outputDirectory,
                timeout: params.timeout,
                frame: {
                    fps: 1,
                    index: 0,
                    padding: 0,
                    isPadded: false,
                },
            });
            await EventScript.Frame.Post({...scriptParams, args});
        }),
    );

    await EventScript.Work.Post(scriptParams);
}
