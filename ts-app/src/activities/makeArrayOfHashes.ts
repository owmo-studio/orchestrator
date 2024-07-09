import * as activity from '@temporalio/activity';
import seedrandom from 'seedrandom';

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
    const chars = '0123456789abcdef';
    const output: Output = {hashes: []};
    for (let i = 0; i < params.count; i++) {
        let hash: string = '0x';
        for (let i = 64; i > 0; --i) hash += chars[Math.floor(prng() * chars.length)];
        output.hashes.push(hash);
    }

    context.log.info(`makeArrayOfHashes > hashes array: ${output.hashes}`);

    return output;
}
