import {proxyActivities} from '@temporalio/workflow';
import * as activities from '../activities';
import {ScriptConfig} from '../interfaces';
import {TASK_QUEUE_SCRIPT} from '../constants';

const {executeScript} = proxyActivities<typeof activities>({
    startToCloseTimeout: '24 hours',
    heartbeatTimeout: '60 seconds',
    taskQueue: TASK_QUEUE_SCRIPT,
});

interface EventExecScriptParams {
    execPath: string;
    scriptConfig?: ScriptConfig;
    args?: Array<string>;
}

interface RunParams extends EventExecScriptParams {
    event: 'work' | 'sequence' | 'frame';
    when: 'pre' | 'post';
}

async function run({scriptConfig, execPath, args, event, when}: RunParams) {
    if (!scriptConfig) return;

    const scripts = scriptConfig?.[event]?.[when];
    if (!scripts) return;
    if (!Array.isArray(scripts)) return;

    for (let i = 0; i < scripts.length; i++) {
        await executeScript({
            label: `EventScript::${event}-${when}`,
            script: scripts[i],
            execPath,
            args: [...(args ?? []), ...(scripts[i].args ?? [])],
        });
    }
}

export const EventScript = {
    Work: {
        Pre: async (params: EventExecScriptParams) => {
            await run({...params, event: 'work', when: 'pre'});
        },
        Post: async (params: EventExecScriptParams) => {
            await run({...params, event: 'work', when: 'post'});
        },
    },
    Sequence: {
        Pre: async (params: EventExecScriptParams) => {
            await run({...params, event: 'sequence', when: 'pre'});
        },
        Post: async (params: EventExecScriptParams) => {
            await run({...params, event: 'sequence', when: 'post'});
        },
    },
    Frame: {
        Pre: async (params: EventExecScriptParams) => {
            await run({...params, event: 'frame', when: 'pre'});
        },
        Post: async (params: EventExecScriptParams) => {
            await run({...params, event: 'frame', when: 'post'});
        },
    },
};
