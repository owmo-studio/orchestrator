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
