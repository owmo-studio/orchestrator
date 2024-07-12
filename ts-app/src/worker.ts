import * as dotenv from 'dotenv';
import * as activities from './activities';
import {BrowserSingleton} from './singletons/browser';
import {Worker, NativeConnection} from '@temporalio/worker';
import {DEV_TEMPORAL_ADDRESS, TASK_QUEUE} from './constants';

dotenv.config();

async function run() {
    const connection = await NativeConnection.connect({
        address: process.env.NODE_ENV === 'production' ? process.env.TEMPORAL_ADDRESS : DEV_TEMPORAL_ADDRESS,
    });

    const worker = await Worker.create({
        connection,
        activities,
        taskQueue: TASK_QUEUE,
        workflowsPath: require.resolve('./workflows'),
        maxConcurrentWorkflowTaskExecutions: 1,
        maxConcurrentActivityTaskExecutions: 1,
        shutdownGraceTime: 0,
        shutdownForceTime: 0,
    });

    await BrowserSingleton.init();

    const originalShutdown = worker.shutdown;

    worker.shutdown = async function shutdown() {
        await BrowserSingleton.shutdown();
        originalShutdown.call(this);
    };

    process.on('SIGINT', async () => {
        console.log('Received SIGINT. Initiating graceful shutdown...');
        worker.shutdown();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('Received SIGTERM. Initiating graceful shutdown...');
        worker.shutdown();
        process.exit(0);
    });

    await worker.run();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
