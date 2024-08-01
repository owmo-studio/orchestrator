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

export interface Sequence {
    fps: number;
    start: number;
    end: number;
}

export interface Segment extends Sequence {
    chunk: number;
    padding: number;
}

export interface Frame extends Segment {
    frame: number;
}

export interface Render {
    uuid: string;
    url: string;
    width: number;
    height: number;
    outDir: string;
    timeout: number;
}
