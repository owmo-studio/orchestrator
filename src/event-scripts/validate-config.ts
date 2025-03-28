export function isValidScriptConfig(config?: {[key: string]: any}) {
    if (!config) return true;

    if (typeof config !== 'object') {
        console.error('Config is not an Object');
        return false;
    }

    if (config['error'] !== undefined) return false;

    for (const event of ['work', 'sequence', 'frame']) {
        const c = config[event];
        if (c) {
            for (const when of ['pre', 'post']) {
                const scripts = c[when];
                if (scripts) {
                    if (!Array.isArray(scripts)) {
                        console.error(`${scripts} is not an array`);
                        return false;
                    } else {
                        for (const p of scripts) {
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
        }
    }
    return true;
}
