import * as activity from '@temporalio/activity';
import fs from 'fs';

interface Params {
    rootdir: string;
    dir: string;
}

interface Output {
    dirpath: string;
}

export async function createFsDirectory(params: Params): Promise<Output> {
    const context = activity.Context.current();
    context.log.info('createFsDirectory INVOKED');

    if (!fs.existsSync(params.rootdir)) {
        throw new Error(`createFsDirectory :: root directory "${params.rootdir}" does not exist`);
    }

    const dirpath = `${params.rootdir}/${params.dir}`;

    if (!fs.existsSync(dirpath)) {
        fs.mkdirSync(dirpath);
        context.log.info(`createFsDirectory > "${dirpath}" has been created`);
    } else {
        context.log.warn(`createFsDirectory > "${dirpath}" already exists, skipping...`);
    }

    return {
        dirpath,
    };
}
