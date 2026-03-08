import {executeChild, proxyActivities} from '@temporalio/workflow';
import * as activities from '../activities';
import {MAX_CONTINUATION_CHUNK_SIZE} from '../constants';
import {ScriptConfig} from '../interfaces';

interface Params {
    uuid: string;
    url: string;
    width: number;
    height: number;
    devicePixelRatio: number;
    outputRootPath: string;
    timeout: number;
    count: number;
    subDirectory?: string;
    scriptConfig?: ScriptConfig;
}

const {getArrayOfHashes} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

export async function exploreFrames(params: Params): Promise<void> {
    const hashes: Array<string> = [];

    for (let offset = 0; offset < params.count; offset += MAX_CONTINUATION_CHUNK_SIZE) {
        const count = Math.min(MAX_CONTINUATION_CHUNK_SIZE, params.count - offset);
        const {hashes: chunk} = await getArrayOfHashes({
            uuid: params.uuid,
            count,
            offset,
        });
        hashes.push(...chunk);
    }

    await executeChild('renderFrames', {
        args: [
            {
                ...params,
                seeds: hashes,
            },
        ],
        workflowId: `${params.uuid}_renderFrames`,
    });
}
