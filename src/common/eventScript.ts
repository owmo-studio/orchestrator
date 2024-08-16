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
    event: 'work' | 'sequence' | 'frame';
    when: 'pre' | 'post';
}

async function run({scriptConfig, execPath, args, event, when}: RunParams) {
    if (!scriptConfig) return;

    const script = scriptConfig?.[event]?.[when];
    if (!script) return;

    const ARGS: Array<string> = [...(script.args ?? []), ...(args ?? [])];

    await executeScript({
        label: `EventScript::${event}-${when}`,
        script,
        execPath,
        args: ARGS,
    });
}

export function isValidScriptConfig(config: {[key: string]: any}) {
    if (typeof config !== 'object') return false;
    for (const event of ['work', 'sequence', 'frame']) {
        const c = config[event];
        if (c) {
            for (const when of ['pre', 'post']) {
                if (!(when in c)) return false;
                if (!c[when].path) return false;
                if (typeof c[when].path !== 'string') return false;
                if (c[when].args) {
                    if (!Array.isArray(c[when].args)) return false;
                    for (const arg of c[when].args) {
                        if (typeof arg !== 'string') return false;
                    }
                }
            }
        }
    }
    return true;
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
