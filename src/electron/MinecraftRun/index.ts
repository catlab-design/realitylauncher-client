/**
 * ========================================
 * MinecraftRun Module
 * ========================================
 * 
 * Main exports for Minecraft game launcher
 */

// Types
export type {
    LaunchOptions,
    LaunchProgress,
    LaunchResult,
    OnGameCloseCallback,
    GameLogCallback,
    ProgressCallback,
} from "./types.js";

// Callbacks
export {
    setOnGameCloseCallback,
    getOnGameCloseCallback,
    setGameLogCallback,
    getGameLogCallback,
    setProgressCallback,
    getProgressCallback,
} from "./callbacks.js";

// Game Process
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

// Re-export launcher from parent
// Note: launchGame and getInstalledVersions remain in ../launcher.ts
// They can be imported directly or re-exported here after refactoring
