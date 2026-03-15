import fs from 'fs';
import path from 'path';
import {Context} from '@temporalio/activity';

interface Params {
    context: Context;
    type: 'info' | 'warn' | 'error';
    label: string;
    status: string;
    message?: string;
    data?: object;
}

export function logActivity(params: Params): void {
    const {context, type, label, status, message, data} = params;

    let log = `${label}::${status} ${message ?? ''}`;
    if (data) log += `\n\n${JSON.stringify(data, null, 4)}\n\n`;

    if (type === 'info') {
        context.log.info(log);
    } else if (type === 'warn') {
        context.log.warn(log);
    } else if (type === 'error') {
        context.log.error(log);
    }
}

interface ProcessLogParams {
    event: string;
    data?: object;
}

export function logProcessEvent(params: ProcessLogParams): void {
    const logDir = path.resolve(process.cwd(), 'logs');
    const logPath = path.join(logDir, 'process-events.jsonl');
    const entry = JSON.stringify({
        ts: new Date().toISOString(),
        pid: process.pid,
        event: params.event,
        data: params.data ?? {},
    });

    try {
        fs.mkdirSync(logDir, {recursive: true});
        fs.appendFileSync(logPath, `${entry}\n`);
    } catch (err) {
        console.error('Failed to write process event log:', err);
    }
}

export function createTerminalAutoClear(params: {workerLabel: string; intervalMs?: number}): (() => void) | null {
    if (!process.stdout.isTTY) return null;

    const intervalMs = params.intervalMs ?? 15 * 60 * 1000;
    const intervalId = setInterval(() => {
        process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${params.workerLabel} terminal auto-cleared`);
        logProcessEvent({
            event: 'terminal.auto_cleared',
            data: {workerLabel: params.workerLabel, intervalMs},
        });
    }, intervalMs);

    return () => clearInterval(intervalId);
}
