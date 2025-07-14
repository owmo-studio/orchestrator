import {NativeConnection, Worker} from '@temporalio/worker';
import * as dotenv from 'dotenv';
import * as activities from '../activities';
import {delay} from '../common/helpers';
import {DEV_TEMPORAL_ADDRESS, TASK_QUEUE_SCRIPT} from '../constants';

dotenv.config({quiet: true});

async function run() {
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
    console.error(err);
    process.exit(1);
});
