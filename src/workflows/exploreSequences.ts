import {executeChild} from '@temporalio/workflow';
import {ScriptConfig, Sequence} from '../interfaces';

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

export async function exploreSequences(params: Params): Promise<void> {
    await executeChild('renderSequences', {
        args: [
            {
                ...params,
                seedCount: params.count,
                seedOffset: 0,
            },
        ],
        workflowId: `${params.uuid}_renderSequences`,
    });
}
