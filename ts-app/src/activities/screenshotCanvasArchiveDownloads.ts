import fs from 'fs';
import path from 'path';
import * as activity from '@temporalio/activity';
import {addOrUpdateQueryParams, createZipArchive, delay} from '../helpers';
import {EngineConfig, RenderFrame} from '../interfaces';
import {PuppeteerBrowser} from '../browser';
import {logActivity} from '../logging';

interface Params extends RenderFrame {}

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

export async function screenshotCanvasArchiveDownloads(params: Params): Promise<Output> {
    const context = activity.Context.current();

    logActivity({
        context,
        type: 'info',
        label: 'screenshotCanvasArchiveDownloads',
        status: 'INVOKED',
        data: params,
    });

    const startTime: Date = new Date();

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

    const browser = await PuppeteerBrowser.getConnectedBrowser();

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
        guids[guid] = newFileName;

        downloadsInProgress.push(
            new Promise((resolve, reject) => {
                client.on('Browser.downloadProgress', async event => {
                    if (guid !== event.guid) return;
                    if (event.state === 'completed') {
                        fs.renameSync(path.resolve(params.outDir, event.guid), path.resolve(params.outDir, guids[event.guid]));
                        resolve(guids[event.guid]);
                    } else if (event.state === 'canceled') {
                        reject();
                    }
                });
            }),
        );
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
                label: 'screenshotCanvasArchiveDownloads',
                status: 'ERROR',
                message: `${error.message}`,
                data: error,
            });
        });

        page.on('console', message => {
            logActivity({
                context,
                type: 'info',
                label: 'screenshotCanvasArchiveDownloads',
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
                    resolve('done');
                }
            }, 100);
            setTimeout(() => {
                clearInterval(interval);
                resolve('timeout');
            }, params.timeout - 1000);
        });

        await page.waitForSelector('canvas');
        const canvas = await page.$('canvas');
        if (!canvas) throw new Error('canvas is null');

        await page.screenshot({
            path: filepath,
            clip: {
                x: 0,
                y: 0,
                width: params.width,
                height: params.height,
            },
        });

        await Promise.all(downloadsInProgress);

        if (downloadsInProgress.length > 0) {
            const filePaths: Array<string> = [];
            for (const key of Object.keys(guids)) filePaths.push(path.resolve(params.outDir, guids[key]));
            await createZipArchive(filePaths, archivePath);
            await delay(1000);
        }

        await page.close();
    } catch (e) {
        console.error(e);
        throw Error(`${e}`);
    } finally {
        await client.detach();
        await browser.disconnect();
    }

    const endTime: Date = new Date();

    const diff: number = endTime.getTime() - startTime.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;

    function pad(num: number) {
        return num < 10 ? '0' + num : num;
    }

    const result = {
        screenshot: filepath,
        archive: Object.keys(guids).length > 0 ? archivePath : '',
        timeToRender: `${pad(hours)}:${pad(remainingMinutes)}:${pad(remainingSeconds)}`,
    };

    logActivity({
        context,
        type: 'info',
        label: 'screenshotCanvasArchiveDownloads',
        status: 'COMPLETED',
        data: result,
    });

    return result;
}
