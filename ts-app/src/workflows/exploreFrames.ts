import {proxyActivities} from '@temporalio/workflow';
import {executeChild} from '@temporalio/workflow';
import * as activities from '../activities';

interface Params {
    url: string;
    width: number;
    height: number;
    dirpath: string;
    subdirname: string | undefined;
    timeout: number;
    count: number;
    workflowId: string;
    uuid: string;
}

interface Output {
    frames: Array<{
        image: string;
        outputs: string;
    }>;
}

const {createFsDirectory, makeArrayOfHashes} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

export async function exploreFrames(params: Params): Promise<Output> {
    let outputDirectory = params.dirpath;

    if (params.subdirname) {
        const {dirpath} = await createFsDirectory({
            rootPath: params.dirpath,
            dirName: params.subdirname,
        });
        outputDirectory = dirpath;
    }

    const {hashes} = await makeArrayOfHashes({
        uuid: params.uuid,
        count: params.count,
    });

    const frames: Array<{
        image: string;
        outputs: string;
    }> = [];

    const responses = await Promise.all(
        hashes.map((hash, i) => {
            return executeChild('renderFrame', {
                args: [
                    {
                        url: params.url,
                        seed: hash,
                        width: params.width,
                        height: params.height,
                        dirpath: outputDirectory,
                        timeout: params.timeout,
                    },
                ],
                workflowId: `${params.workflowId}-${i}`,
            });
        }),
    );

    for (const response of responses) {
        frames.push({
            image: response.image,
            outputs: response.outputs,
        });
    }

    return {frames};
}
