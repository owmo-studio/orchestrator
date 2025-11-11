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

    private static launching = false;
    private static shuttingDown = false;

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
        if (this.launching) {
            console.warn('Browser launch already in progress — skipping duplicate launch');
            return;
        }

        this.instance.browser = await puppeteer.launch({
            headless: true,
            args: ['--hide-scrollbars', '--enable-gpu', '--no-zygote', '--no-sandbox'],
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

        const proc = this.instance.browser.process();
        if (proc) {
            proc.on('exit', async (code, signal) => {
                if (BrowserManager.shuttingDown) return;
                console.warn(`Browser process exited unexpectedly (pid=${pid}, code=${code}, signal=${signal}). Relaunching...`);
                await BrowserManager.launchBrowser();
            });
        }

        this.instance.browser.on('disconnected', async () => {
            if (BrowserManager.shuttingDown) return;
            console.warn('Browser disconnected unexpectedly. Relaunching...');
            await BrowserManager.launchBrowser();
        });

        this.startMonitoring();

        this.launching = false;
    }

    private static startMonitoring() {
        if (this.instance.monitoringInterval) clearInterval(this.instance.monitoringInterval);

        this.instance.monitoringInterval = setInterval(async () => {
            const {pid} = this.instance;
            const [isAlive, isResponsive] = await Promise.all([this.isProcessRunning(pid), this.isBrowserResponsive()]);

            if (!isAlive || !isResponsive) {
                console.warn(`Puppeteer process with PID ${pid} not healthy (alive=${isAlive}, responsive=${isResponsive}). Restarting...`);
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

    static async isBrowserResponsive(): Promise<boolean> {
        const browser = this.instance.browser;
        if (!browser) return false;

        try {
            await browser.pages();
            return true;
        } catch {
            return false;
        }
    }

    static async getConnectedBrowser() {
        if (this.#instance.connectCount >= this.#instance.maxConnects) {
            await this.shutdown();
            await this.launchBrowser();
            this.#instance.connectCount = 0;
        }

        this.#instance.connectCount++;

        const connectPromise = puppeteer.connect({browserWSEndpoint: this.instance.browserWSEndpoint});
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Browser connect timeout')), 10000));

        return Promise.race([connectPromise, timeout]) as Promise<Browser>;
    }

    static async shutdown() {
        this.shuttingDown = true;

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

        this.shuttingDown = false;
    }
}
