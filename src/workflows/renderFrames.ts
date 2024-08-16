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
    seeds: Array<string>;
    mkDir?: string;
    scriptConfig?: ScriptConfig;
}

const {makeFsDirectory} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

const {snapshotCanvasArchiveDownloads} = proxyActivities<typeof activities>({
    startToCloseTimeout: '24 hours',
});

export async function renderFrames(params: Params): Promise<void> {
    let outputDirectory = params.outDir;

    if (params.mkDir) {
        const {outDir} = await makeFsDirectory({
            rootPath: params.outDir,
            dirName: params.mkDir,
        });
        outputDirectory = outDir;
    }

    const scriptParams = {scriptConfig: params.scriptConfig, execPath: outputDirectory};

    await EventScript.Workflow.Pre(scriptParams);

    await Promise.all(
        params.seeds.map(seed => {
            return Promise.all([
                //Pre
                EventScript.Activity.Pre({...scriptParams, args: [`${seed}`]}),

                // Snapshot
                snapshotCanvasArchiveDownloads({
                    uuid: params.uuid,
                    seed,
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
                EventScript.Activity.Post({...scriptParams, args: [`${seed}`]}),
            ]);
        }),
    );

    await EventScript.Workflow.Post(scriptParams);
}
