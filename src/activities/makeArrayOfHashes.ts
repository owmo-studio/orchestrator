import * as activity from '@temporalio/activity';
import seedrandom from 'seedrandom';
import {makeHashStringUsingPRNG} from '../helpers';
import {logActivity} from '../logging';

interface Params {
    uuid: string;
    count: number;
}

interface Output {
    hashes: Array<string>;
}

export async function makeArrayOfHashes(params: Params): Promise<Output> {
    const context = activity.Context.current();

    logActivity({
        context,
        type: 'info',
        label: 'makeArrayOfHashes',
        status: 'INVOKED',
        data: params,
    });

    const prng = seedrandom(params.uuid);
    const output: Output = {hashes: []};
    for (let i = 0; i < params.count; i++) {
        output.hashes.push(makeHashStringUsingPRNG(prng));
    }

    logActivity({
        context,
        type: 'info',
        label: 'makeArrayOfHashes',
        status: 'COMPLETED',
        data: output,
    });

    return output;
}
