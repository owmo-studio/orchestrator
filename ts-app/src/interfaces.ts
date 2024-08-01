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

export interface Frame extends Sequence {
    frame: number;
    padding: number;
}
