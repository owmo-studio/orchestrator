import * as dotenv from 'dotenv';
dotenv.config();

import {Worker, NativeConnection} from '@temporalio/worker';
import {TASK_QUEUE} from './constants';

async function run() {
    const connection = await NativeConnection.connect({
        address: process.env.NODE_ENV === 'production' ? process.env.TEMPORAL_ADDRESS : 'localhost:7233',
    });

    const worker = await Worker.create({
        connection,
        activities: {},
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
