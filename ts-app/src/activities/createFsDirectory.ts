import * as activity from '@temporalio/activity';
import fs from 'fs';

interface Params {
    rootpath: string;
    name: string;
}

interface Output {
    dirpath: string;
}

export async function createFsDirectory(params: Params): Promise<Output> {
    const context = activity.Context.current();
    context.log.info('createFsDirectory INVOKED');

    if (!fs.existsSync(params.rootpath)) {
        throw new Error(`createFsDirectory :: root path "${params.rootpath}" does not exist`);
    }

    const dirpath = `${params.rootpath}/${params.name}`;

    if (!fs.existsSync(dirpath)) {
        fs.mkdirSync(dirpath);
    } else {
        context.log.warn(`createFsDirectory :: directory "${dirpath}" already exists`);
    }

    context.log.info(`createFsDirectory > ${dirpath} has been created`);

    return {
        dirpath,
    };
}
