import fs from 'fs';
import * as path from 'path';
import * as activity from '@temporalio/activity';
import {assertDirectoryWritable} from '../common/helpers';
import {logActivity} from '../common/logging';
import {ScriptExec} from '../interfaces';
import {spawn} from 'child_process';

export async function executeScript(params: ScriptExec): Promise<void> {
    const context = activity.Context.current();
    let cancellationRequested = false;
    let childProcess: ReturnType<typeof spawn> | null = null;

    const terminateChild = (signal: NodeJS.Signals) => {
        if (!childProcess || childProcess.exitCode !== null || childProcess.killed) return;
        try {
            childProcess.kill(signal);
        } catch {}
    };

    const cancellationGuard = context.cancelled.catch(async err => {
        cancellationRequested = true;
        logActivity({
            context,
            type: 'warn',
            label: 'executeScript',
            status: 'TERMINATION_DETECTED',
            message: 'Temporal cancelled script activity. Stopping child process.',
            data: {
                workflowId: context.info.workflowExecution.workflowId,
                runId: context.info.workflowExecution.runId,
                activityId: context.info.activityId,
                label: params.label,
            },
        });
        terminateChild('SIGTERM');
        setTimeout(() => terminateChild('SIGKILL'), 5000);
        throw err;
    });
    const withCancellation = <T>(promise: Promise<T>) => Promise.race([promise, cancellationGuard]) as Promise<T>;

    logActivity({
        context,
        type: 'info',
        label: 'executeScript',
        status: 'INVOKED',
        message: params.label,
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

    assertDirectoryWritable(params.execPath);

    try {
        await withCancellation(
            new Promise<void>((resolve, reject) => {
                childProcess = spawn('bash', [params.script.path, params.execPath, ...(params.args ?? [])], {stdio: ['inherit', 'pipe', 'pipe']});

                const checkProcessStatus = () => {
                    if (childProcess?.exitCode === null) {
                        activity.heartbeat();
                    }
                };

                const intervalId = setInterval(checkProcessStatus, 5000);

                childProcess.stdout?.on('data', data => {
                    logActivity({
                        context,
                        type: 'info',
                        label: 'executeScript',
                        status: 'CONSOLE',
                        message: data.toString(),
                    });
                });

                let errorOutput: string = '';
                childProcess.stderr?.on('data', data => {
                    errorOutput += data.toString();
                });

                childProcess.on('close', code => {
                    clearInterval(intervalId);
                    if (cancellationRequested) {
                        reject(new Error('Script terminated due to activity cancellation'));
                    } else if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`Script exited with code ${code}. Error output: ${errorOutput}`));
                    }
                });
            }),
        );
    } catch (err) {
        throw err;
    } finally {
        terminateChild('SIGTERM');
    }

    logActivity({
        context,
        type: 'info',
        label: 'executeScript',
        status: 'COMPLETED',
    });
}
