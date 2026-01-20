/**
 * ========================================
 * MinecraftRun Callbacks
 * ========================================
 * 
 * Callback handlers for game events
 */

import type { LaunchProgress, OnGameCloseCallback, GameLogCallback, ProgressCallback } from "./types.js";

// Callback holders
let onGameCloseCallback: OnGameCloseCallback | null = null;
let gameLogCallback: GameLogCallback | null = null;
let progressCallback: ProgressCallback | null = null;

/**
 * Set callback for when game closes
 */
export function setOnGameCloseCallback(callback: OnGameCloseCallback | null): void {
    onGameCloseCallback = callback;
}

/**
 * Get current onGameClose callback
 */
export function getOnGameCloseCallback(): OnGameCloseCallback | null {
    return onGameCloseCallback;
}

/**
 * Set callback for game log messages
 */
export function setGameLogCallback(callback: GameLogCallback | null): void {
    gameLogCallback = callback;
}

/**
 * Get current gameLog callback
 */
export function getGameLogCallback(): GameLogCallback | null {
    return gameLogCallback;
}

/**
 * Set callback for progress updates
 */
export function setProgressCallback(callback: ProgressCallback | null): void {
    progressCallback = callback;
}

/**
 * Get current progress callback
 */
export function getProgressCallback(): ProgressCallback | null {
    return progressCallback;
}
