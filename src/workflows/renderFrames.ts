import {continueAsNew, proxyActivities} from '@temporalio/workflow';
import * as activities from '../activities';
import {MAX_CONTINUATION_CHUNK_SIZE, MAX_WORKFLOW_COMMAND_BATCH} from '../constants';
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
    skipWorkPre?: boolean;
    outputDirectory?: string;
}

const {makeFsDirectory} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

const {snapshotCanvasArchiveDownloads} = proxyActivities<typeof activities>({
    startToCloseTimeout: '24 hours',
    heartbeatTimeout: '5 minutes',
});

export async function renderFrames(params: Params): Promise<void> {
    let outputDirectory = params.outputDirectory ?? params.outputRootPath;

    if (!params.outputDirectory && params.subDirectory) {
        const {dirPath} = await makeFsDirectory({
            rootPath: params.outputRootPath,
            dirName: params.subDirectory,
        });
        outputDirectory = dirPath;
    }

    const scriptParams = {scriptConfig: params.scriptConfig, execPath: outputDirectory};

    if (!params.skipWorkPre) {
        await EventScript.Work.Pre(scriptParams);
    }

    const seedsForThisRun = params.seeds.slice(0, MAX_CONTINUATION_CHUNK_SIZE);
    const remainingSeeds = params.seeds.slice(MAX_CONTINUATION_CHUNK_SIZE);

    for (let i = 0; i < seedsForThisRun.length; i += MAX_WORKFLOW_COMMAND_BATCH) {
        const batch = seedsForThisRun.slice(i, i + MAX_WORKFLOW_COMMAND_BATCH);

        await Promise.all(
            batch.map(async seed => {
                const args = [`${seed}`, `${params.width}`, `${params.height}`, '', '', '', ''];

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
    }

    if (remainingSeeds.length > 0) {
        await continueAsNew<typeof renderFrames>({
            ...params,
            seeds: remainingSeeds,
            skipWorkPre: true,
            outputDirectory,
        });
    }

    await EventScript.Work.Post(scriptParams);
}
