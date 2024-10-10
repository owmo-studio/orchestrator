export type Frame = number;

export interface RenderFrame {
    uuid: string;
    seed: string;
    url: string;
    width: number;
    height: number;
    devicePixelRatio: number;
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

export interface Script {
    path: string;
    args?: Array<string>;
}

export interface ScriptConfig {
    work?: {
        pre?: Script;
        post?: Script;
    };
    sequence?: {
        pre?: Script;
        post?: Script;
    };
    frame?: {
        pre?: Script;
        post?: Script;
    };
}

export interface ScriptExec {
    label: string;
    script: Script;
    execPath: string;
    args?: Array<string>;
}
