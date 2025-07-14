import ps from 'ps-node';
import puppeteer, {Browser} from 'puppeteer';
import {delay, throwIfUndefined} from '../common/helpers';

interface ProcessError extends Error {
    code?: string;
}

export class BrowserManager {
    static #instance: BrowserManager;

    private pid!: number;
    private browser!: Browser | null;
    private browserWSEndpoint!: string;
    private monitoringInterval!: NodeJS.Timeout;

    private connectCount: number = 0;
    private maxConnects: number = 10;

    private constructor() {}

    static get instance(): BrowserManager {
        if (!BrowserManager.#instance) {
            BrowserManager.#instance = new BrowserManager();
        }
        return BrowserManager.#instance;
    }

    static async init() {
        if (this.instance.browser) return;
        await this.launchBrowser();
    }

    private static async launchBrowser() {
        this.instance.browser = await puppeteer.launch({
            headless: true,
            args: ['--hide-scrollbars', '--enable-gpu', '--single-process', '--no-zygote', '--no-sandbox'],
            protocolTimeout: 0,
            handleSIGINT: false,
            handleSIGTERM: false,
            handleSIGHUP: false,
            acceptInsecureCerts: true,
        });

        this.instance.browserWSEndpoint = this.instance.browser.wsEndpoint();

        while (!this.instance.browser.process()) {
            await delay(1000);
        }

        const {pid} = this.instance.browser.process() ?? {pid: undefined};
        throwIfUndefined(pid);
        this.instance.pid = pid;

        this.startMonitoring();
    }

    private static startMonitoring() {
        if (this.instance.monitoringInterval) clearInterval(this.instance.monitoringInterval);
        this.instance.monitoringInterval = setInterval(async () => {
            if (!(await this.isProcessRunning(this.instance.pid))) {
                console.warn(`Puppeteer process with PID ${this.instance.pid} is not running. Restarting...`);
                await BrowserManager.launchBrowser();
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
        // Re-launching the browser every N times it's requested
        if (this.#instance.connectCount >= this.#instance.maxConnects) {
            await this.shutdown();
            await this.launchBrowser();
            this.#instance.connectCount = 0;
        }

        this.#instance.connectCount++;
        return await puppeteer.connect({browserWSEndpoint: this.instance.browserWSEndpoint});
    }

    static async shutdown() {
        // Stop monitoring
        if (this.instance.monitoringInterval) {
            clearInterval(this.instance.monitoringInterval);
        }

        // Attempt graceful shutdown
        if (this.instance.browser) {
            try {
                await this.instance.browser.close();
            } catch (err: unknown) {
                if (err instanceof Error && (err.message.includes('Target closed') || err.message.includes('Navigating frame was detached'))) {
                    console.warn('Browser was already closed:', err.message);
                } else {
                    console.error('Error closing browser:', err);
                }
            } finally {
                this.instance.browser = null;
            }
        }

        // Kill the browser process if it hasn't already exited
        if (this.instance.pid) {
            try {
                process.kill(this.instance.pid, 'SIGTERM');
                await new Promise<void>((resolve, reject) => {
                    const checkIfExited = setInterval(() => {
                        try {
                            process.kill(this.instance.pid, 0);
                        } catch (err: unknown) {
                            const processError = err as ProcessError;
                            if (processError.code === 'ESRCH') {
                                clearInterval(checkIfExited);
                                resolve();
                            } else {
                                reject(err);
                            }
                        }
                    }, 100);
                });
            } catch (error: unknown) {
                const processError = error as ProcessError;
                if (processError.code === 'ESRCH') {
                    console.warn('Process already exited');
                } else {
                    console.error('Error killing process:', error);
                }
            }
        }
    }
}
