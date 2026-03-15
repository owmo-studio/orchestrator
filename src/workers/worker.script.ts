import {NativeConnection, Worker} from '@temporalio/worker';
import * as dotenv from 'dotenv';
import * as activities from '../activities';
import {delay} from '../common/helpers';
import {createTerminalAutoClear, logProcessEvent} from '../common/logging';
import {DEV_TEMPORAL_ADDRESS, TASK_QUEUE_SCRIPT} from '../constants';

dotenv.config({quiet: true});

async function run() {
    logProcessEvent({event: 'worker.script.started', data: {taskQueue: TASK_QUEUE_SCRIPT}});
    const stopAutoClear = createTerminalAutoClear({workerLabel: 'worker.script'});

    const connection = await NativeConnection.connect({
        address: process.env.NODE_ENV === 'production' ? process.env.TEMPORAL_ADDRESS : DEV_TEMPORAL_ADDRESS,
    });

    const worker = await Worker.create({
        connection,
        activities,
        taskQueue: TASK_QUEUE_SCRIPT,
        workflowsPath: require.resolve('../workflows'),
        maxConcurrentActivityTaskExecutions: 1,
    });

    const shutdown = async () => {
        logProcessEvent({event: 'worker.script.shutdown_requested'});
        stopAutoClear?.();
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
    logProcessEvent({event: 'worker.script.crashed', data: {error: err instanceof Error ? {name: err.name, message: err.message, stack: err.stack} : {error: err}}});
    console.error(err);
    process.exit(1);
});
