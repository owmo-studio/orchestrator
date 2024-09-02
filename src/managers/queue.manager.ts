import {TASK_QUEUE_RENDER} from '../constants';

export class QueueManager {
    static #instance: QueueManager;

    private customQueue: string | undefined;

    private constructor() {
        this.customQueue = process.env.QUEUE ?? undefined;
    }

    static get instance(): QueueManager {
        if (!QueueManager.#instance) {
            QueueManager.#instance = new QueueManager();
        }
        return QueueManager.#instance;
    }

    static get queue(): string {
        const instance = QueueManager.instance;
        return `${TASK_QUEUE_RENDER}${instance.customQueue ? `-${instance.customQueue}` : ''}`;
    }
}
