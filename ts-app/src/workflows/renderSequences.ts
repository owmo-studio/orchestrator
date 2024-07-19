import {proxyActivities} from '@temporalio/workflow';
import {executeChild} from '@temporalio/workflow';
import * as activities from '../activities';
import {Sequence} from '../interfaces';

interface Params {
    url: string;
    seeds: Array<string>;
    width: number;
    height: number;
    dirpath: string;
    timeout: number;
    sequence: Sequence;
    makeSubDir?: string;
    uuid: string;
}

interface Output {
    frames: Array<{
        image: string;
        outputs: string;
    }>;
}

const {createFsDirectory} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

export async function renderSequences(params: Params): Promise<Output> {
    let outputDirectory = params.dirpath;

    if (params.makeSubDir) {
        const {dirpath} = await createFsDirectory({
            rootPath: params.dirpath,
            dirName: params.makeSubDir,
        });
        outputDirectory = dirpath;
    }

    const totalFrames = params.sequence.end - params.sequence.start + 1;
    const framesToRender: Array<number> = Array.from(new Array(totalFrames), (_, i) => params.sequence.start + i);

    const responses = await Promise.all(
        params.seeds.map(async (seed, i) => {
            return Promise.all(
                framesToRender.map(frame => {
                    return executeChild('renderFrames', {
                        args: [
                            {
                                url: params.url,
                                seeds: [seed],
                                width: params.width,
                                height: params.height,
                                dirpath: outputDirectory,
                                timeout: params.timeout,
                                frame: {
                                    ...params.sequence,
                                    frame,
                                },
                                uuid: params.uuid,
                            },
                        ],
                        workflowId: `${params.uuid}__${i}-${frame}`,
                    });
                }),
            );
        }),
    );

    const frames: Array<{
        image: string;
        outputs: string;
    }> = [];

    for (const response of responses) {
        for (const resp of response) {
            for (const frame of resp.frames) {
                frames.push({...frame});
            }
        }
    }

    return {frames};
}
