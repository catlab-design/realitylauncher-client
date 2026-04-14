


export type {
    LaunchOptions,
    LaunchProgress,
    LaunchResult,
    OnGameCloseCallback,
    GameLogCallback,
    ProgressCallback,
} from "./types.js";


export {
    setOnGameCloseCallback,
    getOnGameCloseCallback,
    setGameLogCallback,
    getGameLogCallback,
    setProgressCallback,
    getProgressCallback,
} from "./callbacks.js";


export {
    resetLauncherState,
    getGameProcess,
    setGameProcess,
    getLastGamePid,
    clearLastGamePid,
    isLaunching,
    setLaunching,
    isAborted,
    setAborted,
    killProcessAndChildren,
    killAllLauncherJavaProcesses,
    startKillRetry,
    clearKillRetry,
    isGameRunning,
    killGame,
} from "./gameProcess.js";




