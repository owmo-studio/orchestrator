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
    workflowId: string;
}

interface Output {
    snapshots: Array<string>;
}

const {makeArrayOfHashes} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

export async function exploreFrames(params: Params): Promise<Output> {
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
                        dirpath: params.dirpath,
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
