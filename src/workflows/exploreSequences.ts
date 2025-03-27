import {proxyActivities} from '@temporalio/workflow';
import * as activities from '../activities';
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
    const {hashes} = await getArrayOfHashes({
        uuid: params.uuid,
        count: params.count,
    });

    await renderSequences({
        ...params,
        seeds: hashes,
    });
}
