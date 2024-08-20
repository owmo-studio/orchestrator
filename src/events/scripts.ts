import {proxyActivities} from '@temporalio/workflow';
import * as activities from '../activities';
import {ScriptConfig} from '../interfaces';
import {TASK_QUEUE_SCRIPT} from '../constants';

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

    const ARGS: Array<string> = [...(args ?? []), ...(script.args ?? [])];

    await executeScript({
        label: `EventScript::${event}-${when}`,
        script,
        execPath,
        args: ARGS,
    });
}

export function isValidScriptConfig(config: {[key: string]: any}) {
    if (typeof config !== 'object') {
        console.error('Config is not an Object');
        return false;
    }
    for (const event of ['work', 'sequence', 'frame']) {
        const c = config[event];
        if (c) {
            for (const when of ['pre', 'post']) {
                const p = c[when];
                if (p) {
                    if (!p.path) {
                        console.error(`${when} does not contain a 'path'`);
                        return false;
                    }
                    if (typeof p.path !== 'string') {
                        console.error(`${when} path is not a String`);
                        return false;
                    }
                    if (p.args) {
                        if (!Array.isArray(p.args)) {
                            console.error(`${when} 'args' is not an Array`);
                            return false;
                        }
                        for (const arg of p.args) {
                            if (typeof arg !== 'string') {
                                console.error(`${when} argument ${arg} is not a String`);
                                return false;
                            }
                        }
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
