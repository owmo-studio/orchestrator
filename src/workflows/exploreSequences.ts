import {proxyActivities} from '@temporalio/workflow';
import * as activities from '../activities';
import {MAX_CONTINUATION_CHUNK_SIZE} from '../constants';
import {ScriptConfig, Sequence} from '../interfaces';
import {renderSequences} from './renderSequences';

interface Params {
    uuid: string;
    url: string;
    width: number;
    height: number;
    devicePixelRatio: number;
    outputRootPath: string;
    timeout: number;
    count: number;
    sequence: Sequence;
    subDirectory?: string;
    perSeedDirectory: boolean;
    scriptConfig?: ScriptConfig;
}

const {getArrayOfHashes} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

export async function exploreSequences(params: Params): Promise<void> {
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

    await renderSequences({
        ...params,
        seeds: hashes,
    });
}
