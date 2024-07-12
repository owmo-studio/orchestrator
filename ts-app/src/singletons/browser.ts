import puppeteer, {Browser} from 'puppeteer';
import {delay, throwIfUndefined} from '../helpers';

export class BrowserSingleton {
    static #instance: BrowserSingleton;

    private pid!: number;
    private browser!: Browser | null;
    private browserWSEndpoint!: string;

    private constructor() {}

    static get instance(): BrowserSingleton {
        if (!BrowserSingleton.#instance) {
            BrowserSingleton.#instance = new BrowserSingleton();
        }
        return BrowserSingleton.#instance;
    }

    static async init() {
        const instance = BrowserSingleton.instance;
        if (instance.browser) return;

        instance.browser = await puppeteer.launch({
            headless: 'shell',
            args: ['--hide-scrollbars', '--enable-gpu', '--single-process', '--no-zygote', '--no-sandbox'],
            protocolTimeout: 0,
            handleSIGINT: false,
            ignoreHTTPSErrors: true,
        });

        instance.browserWSEndpoint = instance.browser.wsEndpoint();

        while (!instance.browser.process()) {
            await delay(500);
        }

        const {pid} = instance.browser.process() ?? {pid: undefined};
        throwIfUndefined(pid);
        instance.pid = pid;
    }

    static async getConnectedBrowser() {
        const instance = BrowserSingleton.instance;
        return await puppeteer.connect({browserWSEndpoint: instance.browserWSEndpoint});
    }

    static async shutdown() {
        const instance = BrowserSingleton.instance;
        if (instance.browser) {
            process.kill(instance.pid, 'SIGKILL');
            await instance.browser.close();
            instance.browser = null;
        }
    }
}
