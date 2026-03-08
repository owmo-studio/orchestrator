import {executeChild} from '@temporalio/workflow';
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

export async function exploreFrames(params: Params): Promise<void> {
    await executeChild('renderFrames', {
        args: [
            {
                ...params,
                seedCount: params.count,
                seedOffset: 0,
            },
        ],
        workflowId: `${params.uuid}_renderFrames`,
    });
}
