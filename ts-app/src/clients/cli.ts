import path from 'path';
import * as dotenv from 'dotenv';
import {v4 as uuidv4} from 'uuid';
import {input, number, select, confirm} from '@inquirer/prompts';
import {Connection, Client} from '@temporalio/client';
import {DEV_TEMPORAL_ADDRESS, TASK_QUEUE} from '../constants';
import {exploreFrames, snapshotFrame, snapshotSequence} from '../workflows';
import {doesDirectoryExist, isValidURL, makeHashStringUsingPRNG} from '../helpers';
import seedrandom from 'seedrandom';

dotenv.config();

async function run() {
    const isProduction = process.env.NODE_ENV === 'production';

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

        if (goal === 'snapshot') {
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

        if (goal === 'explore') {
            return 'exploreFrames'; // !!! replace
        }

        return;
    };

    const workflow = await determineWorkflow();
    if (!workflow) return;

    const workflowId = `${workflow}-${uuidv4()}`;

    const params: {[key: string]: any} = {};

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

    if (goal === 'snapshot') {
        params['seed'] = await input({
            message: 'Seed:',
            required: true,
            default: makeHashStringUsingPRNG(seedrandom(workflowId)),
        });
    }

    params['timeout'] = await number({
        message: 'Timeout (min):',
        required: true,
        default: 10,
        min: 1,
        max: 6 * 60 - 1, // 6 hours less 1 minute: force exit before "startToCloseTimeout" occurs
    });

    // convert input minutes to required milliseconds
    params['timeout'] = params['timeout'] * 1000 * 60;

    params['dirpath'] = await input({
        message: 'Root output directory (full path):',
        default: isProduction ? path.dirname(__dirname) : `${path.join(path.dirname(__dirname), '..', '..', 'out')}`,
        validate: path => doesDirectoryExist(path),
    });

    if (type === 'sequence') {
        params['startFrame'] = await number({
            message: 'Start frame (0...N)',
            required: true,
            default: 0,
            min: 0,
        });

        params['endFrame'] = await number({
            message: 'End frame (Start Frame + 0...N):',
            required: true,
            default: params['startFrame'] + 1,
            min: params['startFrame'],
        });

        params['framerate'] = await number({
            message: 'Framerate (FPS):',
            required: true,
            default: 30,
            min: 1,
        });
    }

    if (goal === 'explore') {
        params['count'] = await number({
            message: 'How many to generate? (1...N):',
            required: true,
            default: 1,
            min: 1,
        });
    }

    const ok = await confirm({
        message: 'Confirm (Y) to submit:',
    });

    if (!ok) return;

    switch (workflow) {
        case 'snapshotFrame':
            await client.workflow.start(snapshotFrame, {
                args: [
                    {
                        url: params.url,
                        seed: params.seed,
                        width: params.width,
                        height: params.height,
                        timeout: params.timeout,
                        dirpath: params.dirpath,
                    },
                ],
                taskQueue: TASK_QUEUE,
                workflowId,
            });
            break;
        case 'snapshotSequence':
            await client.workflow.start(snapshotSequence, {
                args: [
                    {
                        url: params.url,
                        seed: params.seed,
                        width: params.width,
                        height: params.height,
                        timeout: params.timeout,
                        dirpath: params.dirpath,
                        sequence: {
                            fps: params.framerate,
                            start: params.startFrame,
                            end: params.endFrame,
                        },
                        workflowId,
                    },
                ],
                taskQueue: TASK_QUEUE,
                workflowId,
            });
            break;
        case 'exploreFrames':
            await client.workflow.start(exploreFrames, {
                args: [
                    {
                        url: params.url,
                        width: params.width,
                        height: params.height,
                        dirpath: params.dirpath,
                        timeout: params.timeout,
                        count: params.count,
                        workflowId,
                    },
                ],
                taskQueue: TASK_QUEUE,
                workflowId,
            });
            break;
    }

    console.log(`\n${workflowId} has been submitted!\n`);
    return;
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
