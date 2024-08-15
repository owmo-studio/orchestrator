import * as activity from '@temporalio/activity';
import {logActivity} from '../common/logging';
import {spawn} from 'child_process';
import {ScriptExec} from '../interfaces';

export async function executeScript(params: ScriptExec): Promise<void> {
    const context = activity.Context.current();

    logActivity({
        context,
        type: 'info',
        label: 'executeScript',
        status: 'INVOKED',
        data: params,
    });

    try {
        await new Promise<void>((resolve, reject) => {
            const process = spawn(params.type, [params.scriptPath], {stdio: 'inherit'});
            process.on('close', code => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Script exited with code ${code}`));
                }
            });
        });
    } catch (err) {
        console.log(err);
        throw err;
    }
}
