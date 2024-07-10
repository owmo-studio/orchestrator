import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';
import {v4 as uuidv4} from 'uuid';
import {input, number, select, confirm} from '@inquirer/prompts';
import {Connection, Client} from '@temporalio/client';
import {DEV_TEMPORAL_ADDRESS, TASK_QUEUE} from './constants';
import {snapshotFrame} from './workflows';
import {isValidURL, makeHashStringUsingPRNG} from './helpers';
import seedrandom from 'seedrandom';

dotenv.config();

async function run() {
    const isProduction = process.env.NODE_ENV === 'production';
    const defaultOutDir = isProduction ? path.dirname(__dirname) : `${path.join(path.dirname(__dirname), 'out')}`;

    const connection = await Connection.connect({
        address: isProduction ? process.env.TEMPORAL_ADDRESS : DEV_TEMPORAL_ADDRESS,
    });

    const client = new Client({connection});

    const workflow = await select({
        message: 'Choose a workflow:',
        choices: [
            {
                name: 'snapshotFrame',
                value: 'snapshotFrame',
                description: 'Snapshots a single frame',
            },
        ],
    });

    const workflowId = `${workflow}-${uuidv4()}`;

    if (workflow === 'snapshotFrame') {
        const url: string = await input({
            message: 'URL:',
            required: true,
            validate: url => isValidURL(url),
        });

        const seed: string = await input({
            message: 'Seed:',
            default: makeHashStringUsingPRNG(seedrandom(workflowId)),
        });

        const width: number =
            (await number({
                message: 'Width (px):',
                required: true,
                default: 1024,
                min: 1,
            })) ?? 1;

        const height: number =
            (await number({
                message: 'Height (px):',
                required: true,
                default: 1024,
                min: 1,
            })) ?? 1;

        const timeout: number =
            (await number({
                message: 'Timeout (ms):',
                default: 1000 * 10,
                required: false,
                min: 1000,
            })) ?? 1000;

        const filepath: string = await input({
            message: 'Full output file path',
            default: path.join(defaultOutDir, `${seed}.png`),
        });

        const ok = await confirm({
            message: 'Confirm (Y) to submit:',
        });

        if (!ok) return;

        if (filepath === path.join(defaultOutDir, `${seed}.png`)) {
            if (!fs.existsSync(defaultOutDir)) {
                fs.mkdirSync(defaultOutDir);
            }
        }

        await client.workflow.start(snapshotFrame, {
            args: [{url, seed, width, height, timeout, filepath}],
            taskQueue: TASK_QUEUE,
            workflowId,
        });

        console.log(`\n${workflowId} has been submitted!\n`);
        return;
    }
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
