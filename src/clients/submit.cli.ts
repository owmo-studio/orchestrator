import {confirm, input, number, select} from '@inquirer/prompts';
import {Client, Connection} from '@temporalio/client';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import seedrandom from 'seedrandom';
import {v4 as uuidv4} from 'uuid';
import {doesDirectoryExist, getDirectoryDateString, isValidURL, makeHashStringUsingPRNG} from '../common/helpers';
import {DEV_TEMPORAL_ADDRESS} from '../constants';
import {isValidScriptConfig} from '../event-scripts/validate-config';
import {ScriptConfig} from '../interfaces';
import {QueueManager} from '../managers/queue.manager';
import {exploreFrames, exploreSequences, renderFrames, renderSequences} from '../workflows';

dotenv.config({quiet: true});

async function run() {
    try {
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
                            name: 'frame(s)',
                            value: 'Frames',
                            description: 'Render single seeded frame(s)',
                        },
                        {
                            name: 'sequence(s)',
                            value: 'Sequences',
                            description: 'Render sequence(s) of seeded frame(s)',
                        },
                    ],
                });
                return `render${type}`;
            }

            if (goal === 'explore') {
                type = await select({
                    message: 'What type of exploration?',
                    choices: [
                        {
                            name: 'frame(s)',
                            value: 'Frames',
                            description: 'Render single seeded frame(s)',
                        },
                        {
                            name: 'sequence(s)',
                            value: 'Sequences',
                            description: 'Render sequence(s) of seeded frame(s)',
                        },
                    ],
                });
                return `explore${type}`;
            }

            return;
        };

        const workflow = await determineWorkflow();

        if (!workflow) {
            console.error('no matching workflow, exiting...');
            return;
        }

        const uuid = uuidv4();

        const params: {[key: string]: any} = {};

        params['url'] = await input({
            message: 'URL:',
            required: true,
            validate: url => isValidURL(url),
        });

        const envOutputRootPath = process.env.OUTPUT_ROOT_PATH;

        params['outputRootPath'] = await input({
            message: 'Output root directory path:',
            default: isProduction ? (envOutputRootPath ?? path.dirname(__dirname)) : `${path.join(path.dirname(__dirname), '..', 'out')}`,
            validate: path => doesDirectoryExist(path),
        });

        const useSubDirectory = await confirm({
            message: 'Render to dated sub-directory?',
            default: true,
        });

        if (useSubDirectory) {
            let subDirectory = getDirectoryDateString();

            const label = await input({
                message: 'Label for sub-directory (optional):',
                default: '',
                required: false,
                validate: label => label === '' || /^[a-zA-Z0-9-]+$/.test(label),
            });

            if (label !== '') {
                subDirectory += `__${label}`;
            }

            subDirectory += `__${uuid}`;

            params['subDirectory'] = subDirectory;
        }

        if (type == 'Sequences') {
            const useSeedDirectory = await confirm({
                message: 'Render each seed to sub-directory?',
                default: true,
            });
            params['perSeedDirectory'] = useSeedDirectory;
        }

        if (goal === 'render') {
            params['seeds'] = await input({
                message: 'Seed(s):',
                required: true,
                default: makeHashStringUsingPRNG(seedrandom(uuid.toString())),
                validate: seeds => /^\w+(,\w+)*$/.test(seeds),
            });
            params.seeds = params.seeds.split(',');
            console.log('\n', params.seeds, '\n');
        } else if (goal === 'explore') {
            params['count'] = await number({
                message: 'How many do you want? (1...N):',
                required: true,
                default: 1,
                min: 1,
            });
        }

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

        params['devicePixelRatio'] = await number({
            message: 'Pixel Ratio:',
            required: true,
            default: 1,
        });

        // 24 hours (minus 1 minute) to trigger before "startToCloseTimeout"
        params['timeout'] = 24 * 60 * 60 * 1000 - 1000 * 60;

        if (workflow === 'renderSequences' || workflow == 'exploreSequences') {
            const frameRange = await input({
                message: 'Frame range(s):',
                required: true,
                default: '0',
                validate: input => /^(\d+(-\d+)?)(,(\d+(-\d+)?))*$/.test(input),
            });

            params['frameRanges'] = [];

            let low = Infinity;
            let high = -Infinity;

            const ranges = frameRange.split(',');
            for (const range of ranges) {
                const frames = range.split('-');
                if (frames.length > 2) throw new Error(`Frame Range "${range}" is not supported`);

                const frameRange = {
                    start: parseInt(frames[0]),
                    end: parseInt(frames[frames.length === 2 ? 1 : 0]),
                };

                if (frameRange.start > frameRange.end) throw new Error(`Frame Range "${range}" cannot have start greater than end`);
                if (frameRange.start < 0 || frameRange.end < 0) throw new Error(`Frame Range "${range} cannot be less than zero`);

                params['frameRanges'].push(frameRange);

                low = Math.min(low, frameRange.start);
                high = Math.max(high, frameRange.end);
            }

            params['padding'] = await number({
                message: 'Frame padding:',
                required: true,
                default: String(high - low).length,
                min: String(high - low).length,
            });

            params['framerate'] = await number({
                message: 'Framerate (FPS):',
                required: true,
                default: 30,
                min: 1,
            });
        }

        function getConfig(configPath: string) {
            if (configPath == '') return undefined;
            try {
                const data = fs.readFileSync(configPath, 'utf-8');
                return JSON.parse(data) as ScriptConfig;
            } catch (error) {
                return {error}; // will throw in validation
            }
        }

        const configPath = await input({
            message: 'Pre/Post JSON config (optional):',
            default: '',
            validate: configPath => isValidScriptConfig(getConfig(configPath)),
        });
        params['scriptConfig'] = getConfig(configPath);

        const ok = await confirm({
            message: 'Confirm to submit:',
        });

        if (!ok) return;

        switch (workflow) {
            case 'renderFrames':
                await client.workflow.start(renderFrames, {
                    args: [
                        {
                            uuid,
                            url: params.url,
                            seeds: params.seeds,
                            width: params.width,
                            height: params.height,
                            devicePixelRatio: params.devicePixelRatio,
                            timeout: params.timeout,
                            outputRootPath: params.outputRootPath,
                            subDirectory: params.subDirectory,
                            scriptConfig: params.scriptConfig,
                        },
                    ],
                    taskQueue: QueueManager.queue,
                    workflowId: `${uuid}-${QueueManager.queue}`,
                });
                break;
            case 'renderSequences':
                await client.workflow.start(renderSequences, {
                    args: [
                        {
                            uuid,
                            url: params.url,
                            seeds: params.seeds,
                            width: params.width,
                            height: params.height,
                            devicePixelRatio: params.devicePixelRatio,
                            timeout: params.timeout,
                            outputRootPath: params.outputRootPath,
                            sequence: {
                                fps: params.framerate,
                                padding: params.padding,
                                ranges: params.frameRanges,
                            },
                            subDirectory: params.subDirectory,
                            perSeedDirectory: params.perSeedDirectory,
                            scriptConfig: params.scriptConfig,
                        },
                    ],
                    taskQueue: QueueManager.queue,
                    workflowId: `${uuid}-${QueueManager.queue}`,
                });
                break;
            case 'exploreFrames':
                await client.workflow.start(exploreFrames, {
                    args: [
                        {
                            uuid,
                            url: params.url,
                            width: params.width,
                            height: params.height,
                            devicePixelRatio: params.devicePixelRatio,
                            outputRootPath: params.outputRootPath,
                            timeout: params.timeout,
                            count: params.count,
                            subDirectory: params.subDirectory,
                            scriptConfig: params.scriptConfig,
                        },
                    ],
                    taskQueue: QueueManager.queue,
                    workflowId: `${uuid}-${QueueManager.queue}`,
                });
                break;
            case 'exploreSequences':
                await client.workflow.start(exploreSequences, {
                    args: [
                        {
                            uuid,
                            url: params.url,
                            width: params.width,
                            height: params.height,
                            devicePixelRatio: params.devicePixelRatio,
                            timeout: params.timeout,
                            count: params.count,
                            outputRootPath: params.outputRootPath,
                            sequence: {
                                fps: params.framerate,
                                padding: params.padding,
                                ranges: params.frameRanges,
                            },
                            subDirectory: params.subDirectory,
                            perSeedDirectory: params.perSeedDirectory,
                            scriptConfig: params.scriptConfig,
                        },
                    ],
                    taskQueue: QueueManager.queue,
                    workflowId: `${uuid}-${QueueManager.queue}`,
                });
        }

        console.log(`\nWorkflow Submitted - ${uuid}\n`);
        return;
    } finally {
        process.exit(0);
    }
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
