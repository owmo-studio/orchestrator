import * as activity from '@temporalio/activity';
import {CancelledFailure} from '@temporalio/activity';
import fs from 'fs';
import path from 'path';
import {MAX_RENDER_DURATION_MS} from '../constants';
import {composeEngineConfigURL, createZipArchive, delay} from '../common/helpers';
import {logActivity} from '../common/logging';
import {RenderFrame} from '../interfaces';
import {BrowserManager} from '../managers/browser.manager';

interface Output {
    timeToRender: string;
    screenshot: string;
    archive: string;
}

declare global {
    interface Window {
        onMessageReceivedEvent: (e: MessageEvent) => void;
    }
}

function pad(num: number) {
    return num < 10 ? '0' + num : num;
}

function isCancellationError(err: unknown): boolean {
    if (err instanceof Error) {
        return err.name === 'CancelledFailure' || /cancel+ed/i.test(err.message);
    }
    return false;
}

function isExpectedCancellationTeardownError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const message = err.message ?? '';
    if (/Navigating frame was detached/i.test(message)) return true;
    if (/LifecycleWatcher disposed/i.test(message)) return true;
    if (/Target closed/i.test(message)) return true;
    if (/Execution context was destroyed/i.test(message)) return true;
    return false;
}

function shouldRestartBrowserAfterError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;

    const message = err.message ?? '';
    const name = err.name ?? '';

    if (/ProtocolError/i.test(name) && /timed out/i.test(message)) return true;
    if (/Page\.navigate timed out/i.test(message)) return true;
    if (/Browser connect timeout/i.test(message)) return true;
    if (/Target closed/i.test(message)) return true;
    if (/Session closed/i.test(message)) return true;
    if (/Connection closed/i.test(message)) return true;
    if (/Connection terminated/i.test(message)) return true;

    return false;
}

export async function snapshotCanvasArchiveDownloads(params: RenderFrame): Promise<Output> {
    const context = activity.Context.current();
    let cancellationRequested = false;
    const cancellationGuard = context.cancelled.catch(async err => {
        cancellationRequested = true;
        logActivity({
            context,
            type: 'warn',
            label: 'snapshotCanvasArchiveDownloads',
            status: 'TERMINATION_DETECTED',
            message: 'Temporal cancelled activity (workflow terminated/cancelled). Forcing browser restart.',
            data: {
                workflowId: context.info.workflowExecution.workflowId,
                runId: context.info.workflowExecution.runId,
                activityId: context.info.activityId,
            },
        });
        await BrowserManager.forceRestart('activity-cancelled');
        throw err;
    });
    const withCancellation = <T>(promise: Promise<T>) => Promise.race([promise, cancellationGuard]) as Promise<T>;

    logActivity({
        context,
        type: 'info',
        label: 'snapshotCanvasArchiveDownloads',
        status: 'INVOKED',
        data: params,
    });

    const startTime: Date = new Date();
    const effectiveTimeoutMs = Math.max(1000, Math.min(params.timeout, MAX_RENDER_DURATION_MS));

    const intervalId = setInterval(() => {
        try {
            activity.heartbeat();
        } catch {}
    }, 5000);

    const URL = composeEngineConfigURL(params.url, {
        seed: params.seed,
        renderMethod: 'offline',
        frame: params.frame.index,
        framerate: params.frame.fps,
        fitMode: 'exact',
        width: params.width,
        height: params.height,
        devicePixelRatio: params.devicePixelRatio,
        keepCanvasOnDestroy: true,
    });

    const extension = (ext: string) => {
        if (params.frame.isPadded) {
            const paddedFrame = String(params.frame.index).padStart(params.frame.padding, '0');
            return `${paddedFrame}.${ext}`;
        }
        return ext;
    };

    const filepath = `${params.outputRootPath}/${params.seed}.${extension('png')}`;

    const browser = await withCancellation(BrowserManager.getConnectedBrowser());
    let client: any;

    const guids: {[key: string]: string} = {};
    const downloadsInProgress: Array<Promise<string>> = [];
    const archivePath = `${params.outputRootPath}/${params.seed}.${extension('zip')}`;

    const onDownloadWillBegin = (event: {suggestedFilename: string; guid: string}) => {
        const {suggestedFilename, guid} = event;
        const newFileName = `${params.seed}.${suggestedFilename}`;
        const oldFilePath = path.resolve(params.outputRootPath, event.guid);
        const newFilePath = path.resolve(params.outputRootPath, newFileName);
        guids[guid] = newFileName;

        const downloadPromise: Promise<string> = new Promise((resolve, reject) => {
            const onDownloadProgress = async (downloadEvent: {guid: string; state: string}) => {
                if (guid !== downloadEvent.guid) return;

                if (downloadEvent.state === 'completed') {
                    try {
                        if (fs.existsSync(newFilePath)) {
                            fs.unlinkSync(newFilePath);
                        }
                        fs.renameSync(oldFilePath, newFilePath);
                        resolve(newFilePath);
                    } catch (err) {
                        reject(err);
                    } finally {
                        client.off('Browser.downloadProgress', onDownloadProgress);
                    }
                } else if (downloadEvent.state === 'canceled') {
                    client.off('Browser.downloadProgress', onDownloadProgress);
                    reject(new Error(`Download canceled for guid=${guid}`));
                }
            };

            client.on('Browser.downloadProgress', onDownloadProgress);
        });

        downloadsInProgress.push(downloadPromise);
    };

    let downloadHealthInterval: NodeJS.Timeout | null = null;

    try {
        client = await withCancellation(browser.target().createCDPSession());

        await withCancellation(
            client.send('Browser.setDownloadBehavior', {
                behavior: 'allowAndName',
                downloadPath: params.outputRootPath,
                eventsEnabled: true,
            }),
        );

        client.on('Browser.downloadWillBegin', onDownloadWillBegin);

        const page = await withCancellation(browser.newPage());

        let messageReceived = false;

        await withCancellation(
            page.exposeFunction('onMessageReceivedEvent', (e: MessageEvent) => {
                if (e.isTrusted) messageReceived = true;
            }),
        );

        await withCancellation(
            page.evaluateOnNewDocument(() => {
                window.addEventListener('message', (e: MessageEvent) => {
                    window.onMessageReceivedEvent(e);
                });
            }),
        );

        page.on('pageerror', error => {
            const message = error instanceof Error ? error.message : String(error);
            const data = error instanceof Error ? {name: error.name, message: error.message, stack: error.stack} : {error};

            logActivity({
                context,
                type: 'error',
                label: 'snapshotCanvasArchiveDownloads',
                status: 'ERROR',
                message,
                data,
            });
        });

        page.on('console', message => {
            logActivity({
                context,
                type: 'info',
                label: 'snapshotCanvasArchiveDownloads',
                status: 'CONSOLE',
                message: `${message.text()}`,
            });
        });

        await withCancellation(page.setCacheEnabled(false));

        await withCancellation(
            page.setViewport({
                width: params.width,
                height: params.height,
                deviceScaleFactor: 1,
            }),
        );

        await withCancellation(page.goto(URL, {timeout: 0, waitUntil: 'load'}));

        await withCancellation(
            new Promise<'done' | 'timeout'>(resolve => {
                const interval = setInterval(() => {
                    if (messageReceived) {
                        clearInterval(interval);
                        const waitToResolve = downloadsInProgress.length > 0 ? 1000 : 0;
                        setTimeout(() => resolve('done'), waitToResolve);
                    }
                }, 100);
                setTimeout(() => {
                    clearInterval(interval);
                    resolve('timeout');
                }, effectiveTimeoutMs - 1000);
            }),
        );

        await withCancellation(
            Promise.race([
                Promise.all(downloadsInProgress),
                new Promise<never>((_, reject) => {
                    downloadHealthInterval = setInterval(async () => {
                        if (!(await BrowserManager.isBrowserAlive())) {
                            reject(new Error('Browser process died during download'));
                        }
                    }, 1000);
                }),
            ]),
        );

        if (downloadsInProgress.length > 0) {
            const filePaths: Array<string> = [];
            for (const key of Object.keys(guids)) filePaths.push(path.resolve(params.outputRootPath, guids[key]));
            await withCancellation(createZipArchive(filePaths, archivePath));
            await withCancellation(delay(1000));
        }

        const canvasData = await withCancellation(
            page.evaluate(() => {
                const canvas = document.querySelector('canvas') as HTMLCanvasElement;
                return canvas.toDataURL('image/png');
            }),
        );

        const canvasDataBuffer = Buffer.from(canvasData.split(',')[1], 'base64');
        fs.writeFileSync(filepath, canvasDataBuffer);

        await withCancellation(page.close());
    } catch (err) {
        const isCancelled = isCancellationError(err);
        const isExpectedTeardown = isExpectedCancellationTeardownError(err);
        const terminated = cancellationRequested || isCancelled;
        const shouldRestartBrowser = !terminated && shouldRestartBrowserAfterError(err);

        if (terminated || isExpectedTeardown) {
            logActivity({
                context,
                type: 'warn',
                label: 'snapshotCanvasArchiveDownloads',
                status: 'TERMINATED',
                message: 'Render activity stopped due to workflow termination/cancellation.',
                data: err instanceof Error ? {name: err.name, message: err.message} : {error: err},
            });

            if (terminated) {
                throw new CancelledFailure('Activity cancelled by workflow termination', [], err instanceof Error ? err : undefined);
            }
        } else {
            if (shouldRestartBrowser) {
                logActivity({
                    context,
                    type: 'warn',
                    label: 'snapshotCanvasArchiveDownloads',
                    status: 'BROWSER_RESTART',
                    message: 'Restarting browser after recoverable browser/protocol failure.',
                    data: err instanceof Error ? {name: err.name, message: err.message} : {error: err},
                });

                try {
                    await BrowserManager.forceRestart('recoverable-browser-error');
                } catch (restartErr) {
                    logActivity({
                        context,
                        type: 'warn',
                        label: 'snapshotCanvasArchiveDownloads',
                        status: 'BROWSER_RESTART_FAILED',
                        message: restartErr instanceof Error ? restartErr.message : String(restartErr),
                        data: restartErr instanceof Error ? {name: restartErr.name, message: restartErr.message, stack: restartErr.stack} : {error: restartErr},
                    });
                }
            }

            logActivity({
                context,
                type: 'error',
                label: 'snapshotCanvasArchiveDownloads',
                status: 'ERROR',
                message: err instanceof Error ? err.message : String(err),
                data: err instanceof Error ? {name: err.name, message: err.message, stack: err.stack} : {error: err},
            });
        }

        throw err;
    } finally {
        clearInterval(intervalId);
        if (downloadHealthInterval) clearInterval(downloadHealthInterval);
        if (client) {
            client.off('Browser.downloadWillBegin', onDownloadWillBegin);
            try {
                await client.detach();
            } catch {}
        }
        try {
            await browser.disconnect();
        } catch {}
        await BrowserManager.markCaptureEnd();
    }

    const endTime: Date = new Date();

    const diff: number = endTime.getTime() - startTime.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;

    const result = {
        screenshot: filepath,
        archive: Object.keys(guids).length > 0 ? archivePath : '',
        timeToRender: `${pad(hours)}:${pad(remainingMinutes)}:${pad(remainingSeconds)}`,
    };

    logActivity({
        context,
        type: 'info',
        label: 'snapshotCanvasArchiveDownloads',
        status: 'COMPLETED',
        data: result,
    });

    return result;
}
