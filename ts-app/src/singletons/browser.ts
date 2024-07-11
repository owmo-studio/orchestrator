import puppeteer, {Browser} from 'puppeteer';

export class BrowserSingleton {
    static #instance: BrowserSingleton;

    private browser!: Browser | null;
    private browserWSEndpoint!: string;

    private constructor() {}

    static get instance(): BrowserSingleton {
        if (!BrowserSingleton.#instance) {
            BrowserSingleton.#instance = new BrowserSingleton();
        }
        return BrowserSingleton.#instance;
    }

    static async getConnectedBrowser() {
        const instance = BrowserSingleton.instance;

        if (!instance.browser) {
            instance.browser = await puppeteer.launch({
                headless: 'shell',
                args: ['--hide-scrollbars', '--enable-gpu', '--single-process', '--no-zygote', '--no-sandbox'],
                protocolTimeout: 0,
                handleSIGINT: false,
                ignoreHTTPSErrors: true,
            });

            instance.browserWSEndpoint = instance.browser.wsEndpoint();
        }

        return await puppeteer.connect({browserWSEndpoint: instance.browserWSEndpoint});
    }

    static async cleanup() {
        const instance = BrowserSingleton.instance;

        if (instance.browser) {
            await instance.browser.close();
            if (instance.browser.process()) {
                instance.browser.process()?.kill('SIGINT');
            }
            instance.browser = null;
        }
    }
}
