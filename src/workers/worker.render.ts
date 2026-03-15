import {NativeConnection, Worker} from '@temporalio/worker';
import * as dotenv from 'dotenv';
import * as activities from '../activities';
import {delay} from '../common/helpers';
import {createTerminalAutoClear, logProcessEvent} from '../common/logging';
import {DEV_TEMPORAL_ADDRESS} from '../constants';
import {BrowserManager, BrowserManagerInitParams} from '../managers/browser.manager';
import {QueueManager} from '../managers/queue.manager';

dotenv.config({quiet: true});

const RELAUNCH_ARG = '--relaunch';

async function run() {
    const args = process.argv.slice(2);
    logProcessEvent({event: 'worker.render.started', data: {args, taskQueue: QueueManager.queue}});
    const stopAutoClear = createTerminalAutoClear({workerLabel: 'worker.render'});

    const connection = await NativeConnection.connect({
        address: process.env.NODE_ENV === 'production' ? process.env.TEMPORAL_ADDRESS : DEV_TEMPORAL_ADDRESS,
    });

    const worker = await Worker.create({
        connection,
        activities,
        taskQueue: QueueManager.queue,
        workflowsPath: require.resolve('../workflows'),
        maxConcurrentActivityTaskExecutions: 1,
        maxHeartbeatThrottleInterval: '5s',
        defaultHeartbeatThrottleInterval: '2s',
    });

    const params: BrowserManagerInitParams = {};

    const relaunchIndex = args.indexOf(RELAUNCH_ARG);
        if (relaunchIndex !== -1 && args[relaunchIndex + 1]) {
            const value = args[relaunchIndex + 1];
            const parsed = parseInt(value, 10);
            if (!/\./.test(value) && parsed > 0) params.relaunchThreshold = parsed;
            else console.warn(`relaunch args "${value}" is not a valid integer`);
        }

    await BrowserManager.init(params);

    const shutdown = async () => {
        logProcessEvent({event: 'worker.render.shutdown_requested'});
        stopAutoClear?.();
        await BrowserManager.shutdown();
        await delay(1000);
        process.exit(0);
    };

    process.on('SIGINT', async () => {
        console.log('Received SIGINT. Initiating graceful shutdown...');
        await shutdown();
    });

    process.on('SIGTERM', async () => {
        console.log('Received SIGTERM. Initiating graceful shutdown...');
        await shutdown();
    });

    await worker.run();
}

run().catch(err => {
    logProcessEvent({event: 'worker.render.crashed', data: {error: err instanceof Error ? {name: err.name, message: err.message, stack: err.stack} : {error: err}}});
    console.error(err);
    process.exit(1);
});
