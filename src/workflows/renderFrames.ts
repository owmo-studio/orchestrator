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
    outputRootPath: string;
    timeout: number;
    seeds: Array<string>;
    subDirectory?: string;
    scriptConfig?: ScriptConfig;
}

const {makeFsDirectory} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

const {snapshotCanvasArchiveDownloads} = proxyActivities<typeof activities>({
    startToCloseTimeout: '24 hours',
    heartbeatTimeout: '5 minutes',
});

export async function renderFrames(params: Params): Promise<void> {
    let outputDirectory = params.outputRootPath;

    if (params.subDirectory) {
        const {dirPath} = await makeFsDirectory({
            rootPath: params.outputRootPath,
            dirName: params.subDirectory,
        });
        outputDirectory = dirPath;
    }

    const scriptParams = {scriptConfig: params.scriptConfig, execPath: outputDirectory};

    await EventScript.Work.Pre(scriptParams);

    await Promise.all(
        params.seeds.map(async seed => {
            const args = [`${seed}`, `${params.width}`, `${params.height}`];
            await EventScript.Frame.Pre({...scriptParams, args});
            await snapshotCanvasArchiveDownloads({
                uuid: params.uuid,
                seed,
                url: params.url,
                width: params.width,
                height: params.height,
                devicePixelRatio: params.devicePixelRatio,
                outputRootPath: outputDirectory,
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
