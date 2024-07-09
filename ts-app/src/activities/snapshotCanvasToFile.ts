import * as activity from '@temporalio/activity';
import {addOrUpdateQueryParams} from '../helpers';
import puppeteer from 'puppeteer';

interface Params {
    url: string;
    seed: string;
    width: number;
    height: number;
    filepath: string;
    timeout: number;
    frame?: number;
    framerate?: number;
}

interface EngineConfig {
    seed: string;
    runConfig: {
        method: 'frames';
        framerate: number;
        frame: number;
    };
    fitConfig: {
        method: 'exact';
        width: number;
        height: number;
    };
    keepCanvasOnDestroy: true;
}

interface Output {
    snapshot: string;
}

declare global {
    interface Window {
        onMessageReceivedEvent: (e: MessageEvent) => void;
    }
}

export async function snapshotCanvasToFile(params: Params): Promise<Output> {
    const context = activity.Context.current();
    context.log.info('snapshotCanvasToFile INVOKED');

    const flags = ['--hide-scrollbars', '--enable-gpu'];
    const viewport = {width: params.width, height: params.height};

    const browser = await puppeteer.launch({
        headless: 'new',
        args: flags,
        defaultViewport: viewport,
        handleSIGINT: false,
        protocolTimeout: 0,
        ignoreHTTPSErrors: true,
    });

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
        throw new Error(`snapshotCanvasToFile :: ${error.message}`);
    });

    page.on('console', message => {
        context.log.info(`snapshotCanvasToFile :: console :: ${message.text()}`);
    });

    await page.setCacheEnabled(false);

    await page.setViewport({
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
    });

    const engineConfig: EngineConfig = {
        seed: params.seed,
        runConfig: {
            method: 'frames',
            frame: params.frame ?? 0,
            framerate: params.framerate ?? 30,
        },
        fitConfig: {
            method: 'exact',
            width: viewport.width,
            height: viewport.height,
        },
        keepCanvasOnDestroy: true,
    };

    const serializedConfig = encodeURIComponent(JSON.stringify(engineConfig));

    const URL = addOrUpdateQueryParams(params.url, 'config', serializedConfig);

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
        path: params.filepath,
        clip: {
            x: 0,
            y: 0,
            width: viewport.width,
            height: viewport.height,
        },
    });

    await browser.close();

    context.log.info(`snapshotCanvasToFile > snapshot taken :: ${params.filepath}`);

    return {
        snapshot: params.filepath,
    };
}
