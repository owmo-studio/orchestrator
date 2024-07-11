import fs from 'fs';
import path from 'path';
import * as activity from '@temporalio/activity';
import {addOrUpdateQueryParams} from '../helpers';
import {EngineConfig, Frame} from '../interfaces';
import {BrowserSingleton} from '../singletons/browser';

interface Params {
    url: string;
    seed: string;
    width: number;
    height: number;
    dirpath: string;
    timeout: number;
    frame?: Frame;
}

interface Output {
    snapshot: string;
}

declare global {
    interface Window {
        onMessageReceivedEvent: (e: MessageEvent) => void;
    }
}

export async function screenshotCanvasToFile(params: Params): Promise<Output> {
    const context = activity.Context.current();
    context.log.info('screenshotCanvasToFile INVOKED');

    const engineConfig: EngineConfig = {
        seed: params.seed,
        runConfig: {
            method: 'frames',
            frame: params.frame?.frame ?? 0,
            framerate: params.frame?.fps ?? 30,
        },
        fitConfig: {
            method: 'exact',
            width: params.width,
            height: params.height,
        },
        keepCanvasOnDestroy: true,
    };

    const URL = addOrUpdateQueryParams(params.url, 'config', JSON.stringify(engineConfig));

    const extension = () => {
        if (params.frame) {
            const maxDigits = String(params.frame.end - params.frame.start).length;
            const paddedFrame = String(params.frame.frame).padStart(maxDigits, '0');
            return `${paddedFrame}.png`;
        }
        return '.png';
    };

    const filepath = `${params.dirpath}/${params.seed}.${extension()}`;

    const browser = await BrowserSingleton.getConnectedBrowser();

    const client = await browser.target().createCDPSession();

    await client.send('Browser.setDownloadBehavior', {
        behavior: 'allowAndName',
        downloadPath: params.dirpath,
        eventsEnabled: true,
    });

    const guids: {[key: string]: string} = {};
    const downloadsInProgress: Array<Promise<string>> = [];

    client.on('Browser.downloadWillBegin', async event => {
        const {suggestedFilename, guid} = event;
        const newFileName = `${params.seed}.${suggestedFilename}`;
        guids[guid] = newFileName;

        downloadsInProgress.push(
            new Promise((resolve, reject) => {
                client.on('Browser.downloadProgress', async event => {
                    if (guid !== event.guid) return;
                    if (event.state === 'completed') {
                        fs.renameSync(path.resolve(params.dirpath, event.guid), path.resolve(params.dirpath, guids[event.guid]));
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
            context.log.error(`screenshotCanvasToFile :: ${error.message}`);
        });

        page.on('console', message => {
            context.log.info(`screenshotCanvasToFile :: console :: ${message.text()}`);
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
            }, params.timeout);
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

        await page.close();
    } catch (e) {
        console.log(e);
    } finally {
        await client.detach();
        await browser.disconnect();
    }

    context.log.info(`screenshotCanvasToFile > snapshot taken :: ${filepath}`);

    return {
        snapshot: filepath,
    };
}
