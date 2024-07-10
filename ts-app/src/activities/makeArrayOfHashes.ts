import * as activity from '@temporalio/activity';
import seedrandom from 'seedrandom';
import {makeHashStringUsingPRNG} from '../helpers';

interface Params {
    uuid: string;
    count: number;
}

interface Output {
    hashes: Array<string>;
}

export async function makeArrayOfHashes(params: Params): Promise<Output> {
    const context = activity.Context.current();
    context.log.info('makeArrayOfHashes INVOKED');

    const prng = seedrandom(params.uuid);
    const output: Output = {hashes: []};
    for (let i = 0; i < params.count; i++) {
        output.hashes.push(makeHashStringUsingPRNG(prng));
    }

    context.log.info(`makeArrayOfHashes > hashes array: ${output.hashes}`);

    return output;
}
