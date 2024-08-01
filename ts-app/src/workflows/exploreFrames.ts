import {proxyActivities} from '@temporalio/workflow';
import {executeChild} from '@temporalio/workflow';
import * as activities from '../activities';

interface Params {
    url: string;
    width: number;
    height: number;
    dirpath: string;
    makeSubDir?: string;
    timeout: number;
    count: number;
    uuid: string;
}

interface Output {}

const {makeArrayOfHashes} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

export async function exploreFrames(params: Params): Promise<Output> {
    const {hashes} = await makeArrayOfHashes({
        uuid: params.uuid,
        count: params.count,
    });

    await executeChild('renderFrames', {
        args: [
            {
                url: params.url,
                seeds: hashes,
                width: params.width,
                height: params.height,
                dirpath: params.dirpath,
                makeSubDir: params.makeSubDir,
                timeout: params.timeout,
            },
        ],
        workflowId: `${params.uuid}__0`,
    });

    return {};
}
