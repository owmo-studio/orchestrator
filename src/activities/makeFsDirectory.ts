import * as activity from '@temporalio/activity';
import fs from 'fs';
import {logActivity} from '../common/logging';

interface Params {
    rootPath: string;
    dirName: string;
}

interface Output {
    dirPath: string;
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

    const dirPath = `${params.rootPath}/${params.dirName}`;

    const output = {dirPath};

    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath);
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
