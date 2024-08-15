export interface EngineConfig {
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

export type Frame = number;

export interface RenderFrame {
    uuid: string;
    seed: string;
    url: string;
    width: number;
    height: number;
    outDir: string;
    timeout: number;
    frame: {
        fps: number;
        index: Frame;
        padding: number;
        isPadded: boolean;
    };
}

export interface FrameRange {
    start: Frame;
    end: Frame;
}

export interface Sequence {
    ranges: Array<FrameRange>;
    padding: number;
    fps: number;
}

export interface Segment {
    chunk: number;
    frames: Array<Frame>;
    padding: number;
    fps: number;
}

export interface ScriptExec {
    type: 'bash';
    scriptPath: string;
    execPath: string;
}

export interface ScriptConfig {
    workflow: {
        pre: Array<ScriptExec> | undefined;
        post: Array<ScriptExec> | undefined;
    };
    activity: {
        pre: Array<ScriptExec> | undefined;
        post: Array<ScriptExec> | undefined;
    };
}
