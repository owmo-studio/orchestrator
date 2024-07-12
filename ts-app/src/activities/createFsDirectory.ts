import * as activity from '@temporalio/activity';
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
    context.log.info('createFsDirectory INVOKED');

    if (!fs.existsSync(params.rootPath)) {
        throw new Error(`createFsDirectory ERROR - root directory does not exist: "${params.rootPath}"`);
    }

    const dirpath = `${params.rootPath}/${params.dirName}`;

    if (!fs.existsSync(dirpath)) {
        fs.mkdirSync(dirpath);
        context.log.info(`createFsDirectory COMPLETED`);
    } else {
        context.log.warn(`createFsDirectory WARN - directory already exists, skipping...`);
    }

    return {
        dirpath,
    };
}
