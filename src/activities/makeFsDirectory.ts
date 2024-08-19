import * as activity from '@temporalio/activity';
import {logActivity} from '../common/logging';
import fs from 'fs';

interface Params {
    rootPath: string;
    dirName: string;
}

interface Output {
    outDir: string;
}

export async function makeFsDirectory(params: Params): Promise<Output> {
    const context = activity.Context.current();
    logActivity({
        context,
        type: 'info',
        label: 'makeFsDirectory',
        status: 'INVOKED',
        data: params,
    });

    if (!fs.existsSync(params.rootPath)) {
        throw new Error(`makeFsDirectory ERROR - root directory does not exist: "${params.rootPath}"`);
    }

    const outDir = `${params.rootPath}/${params.dirName}`;

    const output = {outDir};

    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir);
        logActivity({
            context,
            type: 'info',
            label: 'makeFsDirectory',
            status: 'COMPLETED',
            data: output,
        });
    } else {
        logActivity({
            context,
            type: 'warn',
            label: 'makeFsDirectory',
            status: 'WARNING',
            message: 'directory already exists, skipping...',
            data: output,
        });
    }

    return output;
}
