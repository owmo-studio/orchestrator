import * as activity from '@temporalio/activity';
import {logActivity} from '../logging';
import fs from 'fs';

interface Params {
    rootPath: string;
    dirName: string;
}

interface Output {
    dirpath: string;
}

export async function createFsDirectory(params: Params): Promise<Output> {
    const context = activity.Context.current();
    logActivity({
        context,
        type: 'info',
        label: 'createFsDirectory',
        status: 'INVOKED',
        data: params,
    });

    if (!fs.existsSync(params.rootPath)) {
        throw new Error(`createFsDirectory ERROR - root directory does not exist: "${params.rootPath}"`);
    }

    const dirpath = `${params.rootPath}/${params.dirName}`;

    const output = {dirpath};

    if (!fs.existsSync(dirpath)) {
        fs.mkdirSync(dirpath);
        logActivity({
            context,
            type: 'info',
            label: 'createFsDirectory',
            status: 'COMPLETED',
            data: output,
        });
    } else {
        logActivity({
            context,
            type: 'warn',
            label: 'createFsDirectory',
            status: 'WARNING',
            message: 'directory already exists, skipping...',
            data: output,
        });
    }

    return output;
}
