import path from 'path';
import * as dotenv from 'dotenv';
import {v4 as uuidv4} from 'uuid';
import {input, number, select, confirm} from '@inquirer/prompts';
import {Connection, Client} from '@temporalio/client';
import {DEV_TEMPORAL_ADDRESS, TASK_QUEUE} from '../constants';
import {snapshotFrame, snapshotSequence} from '../workflows';
import {doesDirectoryExist, isValidURL, makeHashStringUsingPRNG} from '../helpers';
import seedrandom from 'seedrandom';

dotenv.config();

async function run() {
    const isProduction = process.env.NODE_ENV === 'production';
    const defaultOutDir = isProduction ? path.dirname(__dirname) : `${path.join(path.dirname(__dirname), '..', 'out')}`;

    const connection = await Connection.connect({
        address: isProduction ? process.env.TEMPORAL_ADDRESS : DEV_TEMPORAL_ADDRESS,
    });

    const client = new Client({connection});

    let goal!: string;
    let type!: string;

    const determineWorkflow = async () => {
        goal = await select({
            message: 'What do you want to do?',
            choices: [
                {
                    name: 'explore',
                    value: 'explore',
                    description: 'Generate random outputs',
                },
                {
                    name: 'snapshot',
                    value: 'snapshot',
                    description: 'Capture a specific output',
                },
            ],
            default: 'explore',
        });

        if (goal === 'explore') {
            return 'snapshotFrame'; // !!! replace
        } else if (goal === 'snapshot') {
            type = await select({
                message: 'What type of snapshot?',
                choices: [
                    {
                        name: 'frame',
                        value: 'frame',
                        description: 'Snapshot a single frame',
                    },
                    {
                        name: 'sequence',
                        value: 'sequence',
                        description: 'Snapshot a sequence of frames',
                    },
                ],
            });
            if (type === 'frame') return 'snapshotFrame';
            else if (type === 'sequence') return 'snapshotSequence';
        }
    };

    const workflow = await determineWorkflow();

    const workflowId = `${workflow}-${uuidv4()}`;

    const params: {[key: string]: any} = {};

    if (goal === 'snapshot') {
        params['url'] = await input({
            message: 'URL:',
            required: true,
            validate: url => isValidURL(url),
        });

        params['width'] = await number({
            message: 'Width (px):',
            required: true,
            default: 1000,
            min: 1,
        });

        params['height'] = await number({
            message: 'Height (px):',
            required: true,
            default: 1000,
            min: 1,
        });

        params['seed'] = await input({
            message: 'Seed:',
            required: true,
            default: makeHashStringUsingPRNG(seedrandom(workflowId)),
        });

        params['timeout'] = await number({
            message: 'Timeout (min):',
            required: true,
            default: 10,
            min: 1,
            max: 6 * 60 - 1, // 6 hours less 1 minute: exit before startToCloseTimeout triggers
        });

        if (type === 'frame') {
            params['filepath'] = await input({
                required: true,
                message: 'Ouput file (full path):',
                default: path.join(defaultOutDir, `${params.seed}.png`),
                validate: path => doesDirectoryExist(path),
            });
        }

        if (type === 'sequence') {
            params['dirpath'] = await input({
                message: 'Output directory (full path):',
                default: defaultOutDir,
                validate: path => doesDirectoryExist(path),
            });

            params['startFrame'] = await number({
                message: 'Start frame (0...N)',
                required: true,
                default: 0,
                min: 0,
            });

            params['endFrame'] = await number({
                message: 'End frame (Start Frame + 1...N):',
                required: true,
                default: params['startFrame'] + 1,
                min: params['startFrame'] + 1,
            });

            params['framerate'] = await number({
                message: 'Framerate (FPS):',
                required: true,
                default: 30,
                min: 1,
            });
        }

        const ok = await confirm({
            message: 'Confirm (Y) to submit:',
        });

        if (!ok) return;

        if (workflow === 'snapshotFrame') {
            await client.workflow.start(snapshotFrame, {
                args: [
                    {
                        url: params.url,
                        seed: params.seed,
                        width: params.width,
                        height: params.height,
                        timeout: params.timeout * 1000 * 60,
                        filepath: params.filepath,
                    },
                ],
                taskQueue: TASK_QUEUE,
                workflowId,
            });
        } else if (workflow === 'snapshotSequence') {
            await client.workflow.start(snapshotSequence, {
                args: [
                    {
                        url: params.url,
                        seed: params.seed,
                        width: params.width,
                        height: params.height,
                        timeout: params.timeout * 1000 * 60,
                        dirpath: params.dirpath,
                        startFrame: params.startFrame,
                        endFrame: params.endFrame,
                        framerate: params.framerate,
                        workflowId,
                    },
                ],
                taskQueue: TASK_QUEUE,
                workflowId,
            });
        }

        console.log(`\n${workflowId} has been submitted!\n`);
        return;
    }
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
