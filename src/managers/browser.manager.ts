import {execFile} from 'child_process';
import ps from 'ps-node';
import puppeteer, {Browser} from 'puppeteer';
import {promisify} from 'util';
import {MAX_BROWSER_RSS_GROWTH_FACTOR, MAX_BROWSER_RSS_GROWTH_MB, MAX_BROWSER_RSS_MB} from '../constants';
import {delay, throwIfUndefined} from '../common/helpers';
import {logProcessEvent} from '../common/logging';

interface ProcessError extends Error {
    code?: string;
}

export interface BrowserManagerInitParams {
    relaunchThreshold?: number;
    maxBrowserRssMb?: number;
}

export class BrowserManager {
    static #instance: BrowserManager;

    private pid!: number;
    private browser!: Browser | null;
    private browserWSEndpoint!: string;
    private monitoringInterval!: NodeJS.Timeout;

    private static shuttingDown = false;
    private static launchPromise: Promise<void> | null = null;
    private static restartPromise: Promise<void> | null = null;
    private static readonly execFileAsync = promisify(execFile);

    private connectRequests: number = 0;
    private relaunchThreshold: number = Infinity;
    private activeCaptures: number = 0;
    private restartPending: boolean = false;
    private pendingRestartReason: string | null = null;
    private maxBrowserRssMb: number = MAX_BROWSER_RSS_MB;
    private minObservedBrowserRssMb: number = Infinity;

    private constructor() {}

    static get instance(): BrowserManager {
        if (!BrowserManager.#instance) {
            BrowserManager.#instance = new BrowserManager();
        }
        return BrowserManager.#instance;
    }

    static async init(params: BrowserManagerInitParams = {}) {
        if (this.instance.browser && (await this.isBrowserResponsive())) return;

        const {relaunchThreshold, maxBrowserRssMb} = params;
        if (relaunchThreshold && relaunchThreshold > 0) this.instance.relaunchThreshold = relaunchThreshold;
        if (maxBrowserRssMb && maxBrowserRssMb > 0) this.instance.maxBrowserRssMb = maxBrowserRssMb;

        logProcessEvent({
            event: 'browser_manager.init',
            data: {relaunchThreshold: this.instance.relaunchThreshold, maxBrowserRssMb: this.instance.maxBrowserRssMb},
        });

        await this.launchBrowser();
    }

    private static async launchBrowser() {
        if (this.launchPromise) {
            await this.launchPromise;
            return;
        }

        this.launchPromise = (async () => {
            logProcessEvent({event: 'browser.launch.started'});
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
            this.instance.minObservedBrowserRssMb = Infinity;
            logProcessEvent({event: 'browser.launch.completed', data: {browserPid: pid}});

            const proc = this.instance.browser.process();
            if (proc) {
                proc.on('exit', async (code, signal) => {
                    if (BrowserManager.shuttingDown) return;
                    if (BrowserManager.instance.pid !== pid) return;
                    console.warn(`Browser process exited unexpectedly (pid=${pid}, code=${code}, signal=${signal}). Relaunching...`);
                    logProcessEvent({event: 'browser.process_exit', data: {browserPid: pid, code, signal}});
                    await BrowserManager.restartBrowser('process-exit', true);
                });
            }

            this.instance.browser.on('disconnected', async () => {
                if (BrowserManager.shuttingDown) return;
                if (!BrowserManager.instance.browser || BrowserManager.instance.pid !== pid) return;
                console.warn('Browser disconnected unexpectedly. Relaunching...');
                logProcessEvent({event: 'browser.disconnected', data: {browserPid: pid}});
                await BrowserManager.restartBrowser('browser-disconnected', true);
            });

            this.startMonitoring();
        })();

        try {
            await this.launchPromise;
        } finally {
            this.launchPromise = null;
        }
    }

    private static startMonitoring() {
        if (this.instance.monitoringInterval) clearInterval(this.instance.monitoringInterval);

        this.instance.monitoringInterval = setInterval(async () => {
            const {pid} = this.instance;
            const isAlive = await this.isProcessRunning(pid);

            if (!isAlive) {
                console.warn(`Puppeteer process with PID ${pid} is not alive. Relaunching...`);
                logProcessEvent({event: 'browser.monitor_dead', data: {browserPid: pid}});
                await BrowserManager.restartBrowser('monitor-process-dead', true);
                return;
            }

            if (this.instance.restartPending && this.instance.activeCaptures === 0) {
                await BrowserManager.restartBrowser(this.instance.pendingRestartReason ?? 'pending-restart');
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

    private static async getProcessRssMb(pid: number): Promise<number | null> {
        if (!pid) return null;
        if (process.platform === 'win32') return null;
        try {
            const {stdout} = await this.execFileAsync('ps', ['-o', 'rss=', '-p', `${pid}`]);
            const rssKb = parseInt(stdout.trim(), 10);
            if (!Number.isFinite(rssKb) || rssKb <= 0) return null;
            return rssKb / 1024;
        } catch {
            return null;
        }
    }

    private static async waitForProcessExit(pid: number, timeoutMs: number): Promise<void> {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (!(await this.isProcessRunning(pid))) return;
            await delay(100);
        }
        throw new Error(`Timed out waiting for browser process ${pid} to exit`);
    }

    private static async shouldRestartBetweenCaptures(): Promise<{restart: boolean; reason?: string}> {
        const rssMb = await this.getProcessRssMb(this.instance.pid);
        if (rssMb !== null) {
            this.instance.minObservedBrowserRssMb = Math.min(this.instance.minObservedBrowserRssMb, rssMb);

            if (rssMb >= this.instance.maxBrowserRssMb) {
                return {restart: true, reason: `rss ${Math.round(rssMb)}MB exceeds cap ${this.instance.maxBrowserRssMb}MB`};
            }

            if (this.instance.minObservedBrowserRssMb < Infinity) {
                const baseline = this.instance.minObservedBrowserRssMb;
                const growthMb = rssMb - baseline;
                if (rssMb >= baseline * MAX_BROWSER_RSS_GROWTH_FACTOR && growthMb >= MAX_BROWSER_RSS_GROWTH_MB) {
                    return {restart: true, reason: `rss growth ${Math.round(growthMb)}MB from baseline ${Math.round(baseline)}MB`};
                }
            }
        }

        if (this.instance.connectRequests >= this.instance.relaunchThreshold) {
            return {restart: true, reason: `connect requests reached threshold ${this.instance.relaunchThreshold}`};
        }

        return {restart: false};
    }

    private static async restartBrowser(reason: string, force: boolean = false) {
        if (!force && this.instance.activeCaptures > 0) {
            this.instance.restartPending = true;
            this.instance.pendingRestartReason = reason;
            console.warn(`Browser restart deferred (${reason}); ${this.instance.activeCaptures} capture(s) in progress`);
            logProcessEvent({
                event: 'browser.restart.deferred',
                data: {reason, activeCaptures: this.instance.activeCaptures, browserPid: this.instance.pid},
            });
            return;
        }

        if (this.restartPromise) {
            await this.restartPromise;
            return;
        }

        this.restartPromise = (async () => {
            logProcessEvent({
                event: 'browser.restart.started',
                data: {reason, force, browserPid: this.instance.pid, activeCaptures: this.instance.activeCaptures},
            });
            this.instance.restartPending = false;
            this.instance.pendingRestartReason = null;
            await this.shutdown();
            await this.launchBrowser();
            this.instance.connectRequests = 0;
            console.warn(`Browser restarted (${reason})`);
            logProcessEvent({
                event: 'browser.restart.completed',
                data: {reason, force, browserPid: this.instance.pid},
            });
        })();

        try {
            await this.restartPromise;
        } finally {
            this.restartPromise = null;
        }
    }

    static async markCaptureStart() {
        this.instance.activeCaptures++;
    }

    static async markCaptureEnd() {
        this.instance.activeCaptures = Math.max(0, this.instance.activeCaptures - 1);
        if (this.instance.activeCaptures === 0 && this.instance.restartPending) {
            await this.restartBrowser(this.instance.pendingRestartReason ?? 'deferred-restart');
        }
    }

    static async requestRestart(reason: string) {
        logProcessEvent({
            event: 'browser.restart.requested',
            data: {reason, browserPid: this.instance.pid, activeCaptures: this.instance.activeCaptures},
        });
        await this.restartBrowser(reason, false);
    }

    static async forceRestart(reason: string = 'forced-restart') {
        logProcessEvent({
            event: 'browser.restart.forced',
            data: {reason, browserPid: this.instance.pid, activeCaptures: this.instance.activeCaptures},
        });
        await this.restartBrowser(reason, true);
    }

    static async isBrowserAlive(): Promise<boolean> {
        return this.isProcessRunning(this.instance.pid);
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
        if (this.restartPromise) {
            await this.restartPromise;
        }

        if (this.instance.restartPending && this.instance.activeCaptures === 0) {
            await this.restartBrowser(this.instance.pendingRestartReason ?? 'pending-restart');
        }

        if (!this.instance.browserWSEndpoint || !this.instance.browser || !(await this.isBrowserResponsive())) {
            await this.launchBrowser();
        }

        if (this.instance.activeCaptures === 0) {
            const decision = await this.shouldRestartBetweenCaptures();
            if (decision.restart) {
                await this.restartBrowser(decision.reason ?? 'between-captures');
            }
        }
        this.instance.connectRequests++;
        await this.markCaptureStart();
        try {
            const connectPromise = puppeteer.connect({
                browserWSEndpoint: this.instance.browserWSEndpoint,
                protocolTimeout: 0,
            });
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Browser connect timeout')), 10000));
            return (await Promise.race([connectPromise, timeout])) as Browser;
        } catch (err) {
            await this.markCaptureEnd();
            throw err;
        }
    }

    static async shutdown() {
        this.shuttingDown = true;
        logProcessEvent({event: 'browser.shutdown.started', data: {browserPid: this.instance.pid}});

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
                    logProcessEvent({event: 'browser.shutdown.already_closed', data: {browserPid: this.instance.pid, message: err.message}});
                } else {
                    console.error('Error closing browser:', err);
                    logProcessEvent({event: 'browser.shutdown.close_error', data: {browserPid: this.instance.pid, error: err instanceof Error ? err.message : String(err)}});
                }
            } finally {
                this.instance.browser = null;
                this.instance.browserWSEndpoint = '';
            }
        }

        // Kill the browser process if it hasn't already exited
        if (this.instance.pid) {
            const pid = this.instance.pid;
            try {
                process.kill(pid, 'SIGTERM');
                logProcessEvent({event: 'browser.shutdown.sigterm', data: {browserPid: pid}});
                await this.waitForProcessExit(pid, 5000);
            } catch (error: unknown) {
                const processError = error as ProcessError;
                if (processError.code === 'ESRCH') {
                    console.warn('Process already exited');
                    logProcessEvent({event: 'browser.shutdown.already_exited', data: {browserPid: pid}});
                } else {
                    console.warn(`Graceful browser shutdown failed for pid=${pid}; sending SIGKILL`);
                    logProcessEvent({
                        event: 'browser.shutdown.sigkill',
                        data: {browserPid: pid, error: error instanceof Error ? error.message : String(error)},
                    });
                    try {
                        process.kill(pid, 'SIGKILL');
                        await this.waitForProcessExit(pid, 5000);
                    } catch (killError: unknown) {
                        const killProcessError = killError as ProcessError;
                        if (killProcessError.code !== 'ESRCH') {
                            console.error('Error force killing browser:', killError);
                            logProcessEvent({
                                event: 'browser.shutdown.sigkill_error',
                                data: {browserPid: pid, error: killError instanceof Error ? killError.message : String(killError)},
                            });
                        }
                    }
                }
            } finally {
                this.instance.pid = 0;
            }
        }

        this.shuttingDown = false;
        logProcessEvent({event: 'browser.shutdown.completed'});
    }
}
