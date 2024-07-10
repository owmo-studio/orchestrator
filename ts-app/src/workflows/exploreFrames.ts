import {proxyActivities} from '@temporalio/workflow';
import {executeChild} from '@temporalio/workflow';
import * as activities from '../activities';

interface Params {
    url: string;
    width: number;
    height: number;
    dirpath: string;
    timeout: number;
    count: number;
    subDirectory: string | undefined;
    workflowId: string;
}

interface Output {
    snapshots: Array<string>;
}

const {createFsDirectory, makeArrayOfHashes} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

export async function exploreFrames(params: Params): Promise<Output> {
    let outputDirectory = params.dirpath;

    if (params.subDirectory) {
        const {dirpath} = await createFsDirectory({
            rootdir: params.dirpath,
            dir: params.subDirectory,
        });
        outputDirectory = dirpath;
    }

    const {hashes} = await makeArrayOfHashes({
        uuid: params.workflowId,
        count: params.count,
    });

    const snapshots: Array<string> = [];

    const responses = await Promise.all(
        hashes.map((hash, i) => {
            return executeChild('snapshotFrame', {
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
        snapshots.push(response.snapshot);
    }

    return {snapshots};
}
