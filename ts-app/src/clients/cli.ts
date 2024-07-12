import path from 'path';
import * as dotenv from 'dotenv';
import {v4 as uuidv4} from 'uuid';
import {input, number, select, confirm} from '@inquirer/prompts';
import {Connection, Client} from '@temporalio/client';
import {DEV_TEMPORAL_ADDRESS, TASK_QUEUE} from '../constants';
import {exploreFrames, renderFrame, renderSequence} from '../workflows';
import {doesDirectoryExist, getDirectoryDateString, isValidURL, makeHashStringUsingPRNG} from '../helpers';
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
                    description: 'Generate random seeds to render',
                },
                {
                    name: 'render',
                    value: 'render',
                    description: 'Render a specific configuration',
                },
            ],
        });

        if (goal === 'render') {
            type = await select({
                message: 'What type of render?',
                choices: [
                    {
                        name: 'frame',
                        value: 'Frame',
                        description: 'Render a single frame',
                    },
                    {
                        name: 'sequence',
                        value: 'Sequence',
                        description: 'Render a sequence of frames',
                    },
                ],
            });
            return `render${type}`;
        }

        if (goal === 'explore') {
            return 'exploreFrames';
        }

        return;
    };

    const workflow = await determineWorkflow();
    if (!workflow) return;

    const uuid = uuidv4();
    const workflowId = `${workflow}-${uuid}`;

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

    if (goal === 'render') {
        params['seed'] = await input({
            message: 'Seed:',
            required: true,
            default: makeHashStringUsingPRNG(seedrandom(uuid.toString())),
        });
    }

    params['timeout'] = await number({
        message: 'Timeout (min):',
        required: true,
        default: 1,
        min: 1,
        max: 6 * 60 - 1, // 6 hours less 1 minute: force exit before "startToCloseTimeout" occurs
    });

    // convert minutes to milliseconds
    params['timeout'] = params['timeout'] * 1000 * 60;

    params['dirpath'] = await input({
        message: 'Output directory path:',
        default: isProduction ? path.dirname(__dirname) : `${path.join(path.dirname(__dirname), '..', '..', 'out')}`,
        validate: path => doesDirectoryExist(path),
    });

    if (goal === 'render') {
        const makeSubDirectory = await confirm({
            message: 'Collate into "seed" sub-directory?',
            default: true,
        });
        params['makeSubDir'] = makeSubDirectory;
    }

    if (goal === 'explore') {
        const useSubDirectory = await confirm({
            message: 'Put outputs into a dated sub-directory?',
            default: true,
        });

        if (useSubDirectory) {
            let subDirName = getDirectoryDateString();

            const label = await input({
                message: 'Label for sub-directory (optional):',
                default: '',
                required: false,
                validate: label => label === '' || /^[a-zA-Z0-9-]+$/.test(label),
            });

            if (label !== '') {
                subDirName += `__${label}`;
            }

            subDirName += `__${uuid}`;

            params['subDirName'] = subDirName;
        }

        params['count'] = await number({
            message: 'How many do you want? (1...N):',
            required: true,
            default: 1,
            min: 1,
        });
    }

    if (workflow === 'renderSequence') {
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

    const ok = await confirm({
        message: 'Confirm to submit:',
    });

    if (!ok) return;

    switch (workflow) {
        case 'renderFrame':
            await client.workflow.start(renderFrame, {
                args: [
                    {
                        url: params.url,
                        seed: params.seed,
                        width: params.width,
                        height: params.height,
                        timeout: params.timeout,
                        dirpath: params.dirpath,
                        makeSubDir: params.makeSubDir,
                    },
                ],
                taskQueue: TASK_QUEUE,
                workflowId,
            });
            break;
        case 'renderSequence':
            await client.workflow.start(renderSequence, {
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
                        makeSubDir: params.makeSubDir,
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
                        subdirname: params.subDirName,
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

    console.log(`\nWorkflow Submitted - ${workflowId}\n`);
    return;
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
