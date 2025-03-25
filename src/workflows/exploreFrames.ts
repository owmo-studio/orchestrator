import {proxyActivities} from '@temporalio/workflow';
import * as activities from '../activities';
import {ScriptConfig} from '../interfaces';
import {renderFrames} from './renderFrames';

interface Params {
    uuid: string;
    url: string;
    width: number;
    height: number;
    devicePixelRatio: number;
    outDir: string;
    timeout: number;
    count: number;
    mkDir?: string;
    scriptConfig?: ScriptConfig;
}

const {getArrayOfHashes} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
});

export async function exploreFrames(params: Params): Promise<void> {
    const {hashes} = await getArrayOfHashes({
        uuid: params.uuid,
        count: params.count,
    });

    await renderFrames({
        ...params,
        seeds: hashes,
    });
}
