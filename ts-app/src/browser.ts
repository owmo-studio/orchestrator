import puppeteer, {Browser} from 'puppeteer';
import {delay, throwIfUndefined} from './helpers';
import ps from 'ps-node';

export class PuppeteerBrowser {
    static #instance: PuppeteerBrowser;

    private pid!: number;
    private browser!: Browser | null;
    private browserWSEndpoint!: string;
    private monitoringInterval!: NodeJS.Timeout;

    private constructor() {}

    static get instance(): PuppeteerBrowser {
        if (!PuppeteerBrowser.#instance) {
            PuppeteerBrowser.#instance = new PuppeteerBrowser();
        }
        return PuppeteerBrowser.#instance;
    }

    static async init() {
        if (this.instance.browser) return;
        await this.launchBrowser();
        this.startMonitoring();
    }

    private static async launchBrowser() {
        this.instance.browser = await puppeteer.launch({
            headless: 'shell',
            args: ['--hide-scrollbars', '--enable-gpu', '--single-process', '--no-zygote', '--no-sandbox'],
            protocolTimeout: 0,
            handleSIGINT: false,
            handleSIGTERM: false,
            ignoreHTTPSErrors: true,
        });

        this.instance.browserWSEndpoint = this.instance.browser.wsEndpoint();

        while (!this.instance.browser.process()) {
            await delay(1000);
        }

        const {pid} = this.instance.browser.process() ?? {pid: undefined};
        throwIfUndefined(pid);
        this.instance.pid = pid;
    }

    private static startMonitoring() {
        if (this.instance.monitoringInterval) clearInterval(this.instance.monitoringInterval);
        this.instance.monitoringInterval = setInterval(async () => {
            if (!(await this.isProcessRunning(this.instance.pid))) {
                console.warn(`Puppeteer process with PID ${this.instance.pid} is not running. Restarting...`);
                await PuppeteerBrowser.launchBrowser();
            }
        }, 5000);
    }

    private static async isProcessRunning(pid: number): Promise<boolean> {
        return new Promise(resolve => {
            ps.lookup({pid}, (err, resultList) => {
                if (err) {
                    console.error(err);
                    resolve(false);
                } else {
                    resolve(resultList.length > 0);
                }
            });
        });
    }

    static async getConnectedBrowser() {
        return await puppeteer.connect({browserWSEndpoint: this.instance.browserWSEndpoint});
    }

    static async shutdown() {
        if (this.instance.monitoringInterval) {
            clearInterval(this.instance.monitoringInterval);
        }

        if (this.instance.browser) {
            process.kill(this.instance.pid, 'SIGKILL');
            await this.instance.browser.close();
            this.instance.browser = null;
        }
    }
}
