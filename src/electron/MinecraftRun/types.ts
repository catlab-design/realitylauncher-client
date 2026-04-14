


export interface LaunchOptions {
    instanceId?: string;
    telemetryUserId?: string;
    version: string;
    username: string;
    uuid: string;
    accessToken?: string;
    ramMB?: number;
    javaPath?: string;
    gameDirectory?: string;
    loader?: {
        type: "forge" | "fabric" | "neoforge" | "quilt" | "legacyfabric" | "vanilla";
        build?: string;
        enable: boolean;
    };
}


export interface LaunchProgress {
    type: "download" | "extract" | "launch" | "prepare";
    task?: string;
    current?: number;
    total?: number;
    percent?: number;
    speed?: number; 
    estimated?: number; 
}


export interface LaunchResult {
    ok: boolean;
    message: string;
    pid?: number;
}


export type OnGameCloseCallback = () => void;
export type GameLogCallback = (level: string, message: string) => void;
export type ProgressCallback = (progress: LaunchProgress) => void;
