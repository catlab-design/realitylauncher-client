

import type { LaunchProgress, OnGameCloseCallback, GameLogCallback, ProgressCallback } from "./types.js";


let onGameCloseCallback: OnGameCloseCallback | null = null;
let gameLogCallback: GameLogCallback | null = null;
let progressCallback: ProgressCallback | null = null;


export function setOnGameCloseCallback(callback: OnGameCloseCallback | null): void {
    onGameCloseCallback = callback;
}


export function getOnGameCloseCallback(): OnGameCloseCallback | null {
    return onGameCloseCallback;
}


export function setGameLogCallback(callback: GameLogCallback | null): void {
    gameLogCallback = callback;
}


export function getGameLogCallback(): GameLogCallback | null {
    return gameLogCallback;
}


export function setProgressCallback(callback: ProgressCallback | null): void {
    progressCallback = callback;
}


export function getProgressCallback(): ProgressCallback | null {
    return progressCallback;
}
