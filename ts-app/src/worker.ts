import * as dotenv from 'dotenv';
import {Worker, NativeConnection} from '@temporalio/worker';
import {DEV_TEMPORAL_ADDRESS, TASK_QUEUE} from './constants';
import * as activities from './activities';

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
        maxConcurrentLocalActivityExecutions: 1,
        maxConcurrentActivityTaskExecutions: 1,
        maxConcurrentWorkflowTaskExecutions: 1,
    });

    await worker.run();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
