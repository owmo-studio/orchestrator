import fs from 'fs';
import * as path from 'path';
import * as activity from '@temporalio/activity';
import {logActivity} from '../common/logging';
import {ScriptExec} from '../interfaces';
import {spawn} from 'child_process';

export async function executeScript(params: ScriptExec): Promise<void> {
    const context = activity.Context.current();

    logActivity({
        context,
        type: 'info',
        label: 'executeScript',
        status: 'INVOKED',
        data: params,
    });

    // Validate Script
    if (!fs.existsSync(params.script.path)) {
        throw new Error(`Script path does not exist: ${params.script.path}`);
    } else if (!fs.statSync(params.script.path).isFile()) {
        throw new Error(`Script path is not a file: ${params.script.path}`);
    } else if (!path.isAbsolute(params.script.path)) {
        throw new Error(`Script path is not absolute: ${params.script.path}`);
    } else if (path.extname(params.script.path) !== '.sh') {
        throw new Error(`Script path extension is not ".sh": ${params.script.path}`);
    }

    // Validate Execution Path
    if (!fs.existsSync(params.execPath)) {
        throw new Error(`ExecPath does not exist: ${params.execPath}`);
    } else if (!fs.statSync(params.execPath).isDirectory()) {
        throw new Error(`ExecPath is not a directory: ${params.execPath}`);
    } else if (!path.isAbsolute(params.execPath)) {
        throw new Error(`ExecPath is not absolute: ${params.execPath}`);
    }

    try {
        await new Promise<void>((resolve, reject) => {
            const process = spawn('bash', [params.script.path, params.execPath, ...(params.args ?? [])], {stdio: ['inherit', 'inherit', 'pipe']});

            let errorOutput: string = '';
            process.stderr.on('data', data => {
                errorOutput += data.toString();
            });

            process.on('close', code => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Script exited with code ${code}. Error output: ${errorOutput}`));
                }
            });
        });
    } catch (err) {
        console.log(err);
        throw err;
    }
}
