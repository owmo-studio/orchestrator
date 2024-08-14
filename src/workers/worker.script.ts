import * as dotenv from 'dotenv';
import * as activities from '../activities';
import {Worker, NativeConnection} from '@temporalio/worker';
import {DEV_TEMPORAL_ADDRESS, TASK_QUEUE_SCRIPT} from '../constants';

dotenv.config();

async function run() {
    const connection = await NativeConnection.connect({
        address: process.env.NODE_ENV === 'production' ? process.env.TEMPORAL_ADDRESS : DEV_TEMPORAL_ADDRESS,
    });

    const worker = await Worker.create({
        connection,
        activities,
        taskQueue: TASK_QUEUE_SCRIPT,
        workflowsPath: require.resolve('../workflows'),
        maxConcurrentActivityTaskExecutions: 4,
    });

    await worker.run();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
