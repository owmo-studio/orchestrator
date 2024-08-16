import {proxyActivities} from '@temporalio/workflow';
import * as activities from '../activities';
import {TASK_QUEUE_SCRIPT} from '../constants';
import {ScriptConfig} from '../interfaces';

const {executeScript} = proxyActivities<typeof activities>({
    startToCloseTimeout: '24 hours',
    taskQueue: TASK_QUEUE_SCRIPT,
});

interface EventExecScriptParams {
    execPath: string;
    scriptConfig?: ScriptConfig;
    args?: Array<string>;
}

interface RunParams extends EventExecScriptParams {
    event: 'workflow' | 'activity';
    when: 'pre' | 'post';
}

async function run({scriptConfig, execPath, args, event, when}: RunParams) {
    if (!scriptConfig) return;

    const script = scriptConfig?.[event]?.[when];
    if (!script) return;

    const ARGS: Array<string> = [...(script.args ?? []), ...(args ?? [])];

    await executeScript({
        label: `${event}-${when}`,
        script,
        execPath,
        args: ARGS,
    });
}

export const EventScript = {
    Workflow: {
        Pre: async (params: EventExecScriptParams) => {
            await run({...params, event: 'workflow', when: 'pre'});
        },
        Post: async (params: EventExecScriptParams) => {
            await run({...params, event: 'workflow', when: 'post'});
        },
    },
    Activity: {
        Pre: async (params: EventExecScriptParams) => {
            await run({...params, event: 'activity', when: 'pre'});
        },
        Post: async (params: EventExecScriptParams) => {
            await run({...params, event: 'activity', when: 'post'});
        },
    },
};
