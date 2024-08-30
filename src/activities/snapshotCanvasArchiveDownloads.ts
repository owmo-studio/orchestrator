import fs from 'fs';
import path from 'path';
import * as activity from '@temporalio/activity';
import {addOrUpdateQueryParams, createZipArchive, delay} from '../common/helpers';
import {EngineConfig, RenderFrame} from '../interfaces';
import {BrowserManager} from '../managers/browser.manager';
import {logActivity} from '../common/logging';

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

export async function snapshotCanvasArchiveDownloads(params: RenderFrame): Promise<Output> {
    const context = activity.Context.current();

    logActivity({
        context,
        type: 'info',
        label: 'snapshotCanvasArchiveDownloads',
        status: 'INVOKED',
        data: params,
    });

    const startTime: Date = new Date();

    const intervalId = setInterval(() => {
        activity.heartbeat();
    }, 5000);

    const engineConfig: EngineConfig = {
        seed: params.seed,
        runConfig: {
            method: 'frames',
            frame: params.frame.index,
            framerate: params.frame.fps,
        },
        fitConfig: {
            method: 'exact',
            width: params.width,
            height: params.height,
            devicePixelRatio: params.devicePixelRatio,
        },
        keepCanvasOnDestroy: true,
    };

    const URL = addOrUpdateQueryParams(params.url, 'config', JSON.stringify(engineConfig));

    const extension = (ext: string) => {
        if (params.frame.isPadded) {
            const paddedFrame = String(params.frame.index).padStart(params.frame.padding, '0');
            return `${paddedFrame}.${ext}`;
        }
        return ext;
    };

    const filepath = `${params.outDir}/${params.seed}.${extension('png')}`;

    const browser = await BrowserManager.getConnectedBrowser();

    const client = await browser.target().createCDPSession();

    await client.send('Browser.setDownloadBehavior', {
        behavior: 'allowAndName',
        downloadPath: params.outDir,
        eventsEnabled: true,
    });

    const guids: {[key: string]: string} = {};
    const downloadsInProgress: Array<Promise<string>> = [];
    const archivePath = `${params.outDir}/${params.seed}.${extension('zip')}`;

    client.on('Browser.downloadWillBegin', async event => {
        const {suggestedFilename, guid} = event;
        const newFileName = `${params.seed}.${suggestedFilename}`;
        const oldFilePath = path.resolve(params.outDir, event.guid);
        const newFilePath = path.resolve(params.outDir, newFileName);
        guids[guid] = newFileName;

        const downloadPromise: Promise<string> = new Promise(resolve => {
            client.on('Browser.downloadProgress', async event => {
                if (guid !== event.guid) return;
                if (event.state === 'completed') {
                    try {
                        if (fs.existsSync(newFilePath)) {
                            fs.unlinkSync(newFilePath);
                        }
                        fs.renameSync(oldFilePath, newFilePath);
                        resolve(newFilePath);
                    } catch (err) {
                        console.log(err);
                        throw err;
                    }
                }
            });
        });

        downloadPromise.catch(err => {
            console.log(err);
            throw err;
        });

        downloadsInProgress.push(downloadPromise);
    });

    try {
        const page = await browser.newPage();

        let messageReceived = false;

        await page.exposeFunction('onMessageReceivedEvent', (e: MessageEvent) => {
            if (e.isTrusted) messageReceived = true;
        });

        await page.evaluateOnNewDocument(() => {
            window.addEventListener('message', (e: MessageEvent) => {
                window.onMessageReceivedEvent(e);
            });
        });

        page.on('pageerror', error => {
            logActivity({
                context,
                type: 'error',
                label: 'snapshotCanvasArchiveDownloads',
                status: 'ERROR',
                message: `${error.message}`,
                data: error,
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

        await page.setCacheEnabled(false);

        await page.setViewport({
            width: params.width,
            height: params.height,
            deviceScaleFactor: 1,
        });

        await page.goto(URL, {timeout: 0, waitUntil: 'load'});

        await new Promise(resolve => {
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
            }, params.timeout - 1000);
        });

        await Promise.all(downloadsInProgress).catch(err => {
            console.log(err);
            throw err;
        });

        if (downloadsInProgress.length > 0) {
            const filePaths: Array<string> = [];
            for (const key of Object.keys(guids)) filePaths.push(path.resolve(params.outDir, guids[key]));
            await createZipArchive(filePaths, archivePath);
            await delay(1000);
        }

        const canvasData = await page.evaluate(() => {
            const canvas = document.querySelector('canvas') as HTMLCanvasElement;
            return canvas.toDataURL('image/png');
        });

        const canvasDataBuffer = Buffer.from(canvasData.split(',')[1], 'base64');
        fs.writeFileSync(filepath, canvasDataBuffer);

        await page.close();
    } catch (err) {
        console.log(err);
        throw err;
    } finally {
        await client.detach();
        await browser.disconnect();
        clearInterval(intervalId);
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
