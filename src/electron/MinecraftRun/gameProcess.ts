import { ChildProcess, exec } from "child_process";
import * as os from "os";

// State
// Map instanceId -> ChildProcess
const gameProcesses = new Map<string, ChildProcess>();
// Map instanceId -> boolean (launching state)
const launchingStates = new Map<string, boolean>();
// Map instanceId -> boolean (aborted state)
const abortedStates = new Map<string, boolean>();
// Map instanceId -> gameDirectory
const activeGameDirectories = new Map<string, string>();

// Map instanceId -> kill retry timer (to prevent race conditions with multiple instances)
const killRetryTimers = new Map<string, NodeJS.Timeout>();
let lastGamePid: number | null = null;

// =========================================
// Getters & Setters
// =========================================

export function getGameProcess(instanceId: string) { return gameProcesses.get(instanceId) || null; }
export function setGameProcess(instanceId: string, p: ChildProcess | null) {
    if (p === null) {
        // When process is null, remove from map entirely
        gameProcesses.delete(instanceId);
    } else {
        gameProcesses.set(instanceId, p);
        if (p.pid) lastGamePid = p.pid;
    }
}

export function isLaunching(instanceId: string) { return launchingStates.get(instanceId) || false; }
export function setLaunching(instanceId: string, val: boolean) { launchingStates.set(instanceId, val); }

export function isAborted(instanceId: string) { return abortedStates.get(instanceId) || false; }
export function setAborted(instanceId: string, val: boolean) { abortedStates.set(instanceId, val); }

export function getLastGamePid(): number | null { return lastGamePid; }
export function clearLastGamePid(): void { lastGamePid = null; }

export function setActiveGameDirectory(instanceId: string, dir: string | null) {
    if (dir) {
        activeGameDirectories.set(instanceId, dir);
    } else {
        activeGameDirectories.delete(instanceId);
    }
}

export function isGameRunning(instanceId?: string): boolean {
    if (instanceId) {
        const p = gameProcesses.get(instanceId);
        if (!p) return false;

        // Check if process has definitively exited
        // Note: Fake process objects from polling don't have these properties
        // So we check explicitly for true/number values, not just "not null"
        const hasExited = p.killed === true || (typeof p.exitCode === 'number');

        if (hasExited) {
            // Process has exited, clean up stale reference
            gameProcesses.delete(instanceId);
            launchingStates.delete(instanceId);
            return false;
        }

        // If we have a PID and not definitely exited, consider it running
        return !!(p as any).pid;
    }

    // If no ID provided, check if ANY game is running
    for (const [id, p] of gameProcesses) {
        const hasExited = p.killed === true || (typeof p.exitCode === 'number');
        if (!hasExited && (p as any).pid) {
            return true;
        } else if (hasExited) {
            // Clean up dead processes
            gameProcesses.delete(id);
            launchingStates.delete(id);
        }
    }
    return false;
}

export function resetLauncherState(instanceId?: string) {
    if (instanceId) {
        gameProcesses.delete(instanceId);
        launchingStates.delete(instanceId);
        abortedStates.delete(instanceId);
        activeGameDirectories.delete(instanceId);
    } else {
        gameProcesses.clear();
        launchingStates.clear();
        abortedStates.clear();
        activeGameDirectories.clear();
    }
}

// =========================================
// Helper Functions
// =========================================

/**
 * Find PID by game directory
 */
function findPidByGameDirectory(gameDir: string): Promise<number | null> {
    return new Promise((resolve) => {
        const platform = process.platform;

        if (platform === "win32") {
            const pathForward = gameDir.replace(/\\/g, "/");
            const pathBackward = gameDir.replace(/\//g, "\\");
            const pathBackwardEscaped = pathBackward.replace(/\\/g, "\\\\");

            const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name like 'java%'\\" | Where-Object { $_.CommandLine -like '*${pathForward}*' -or $_.CommandLine -like '*${pathBackwardEscaped}*' } | Select-Object -ExpandProperty ProcessId"`;

            exec(cmd, (err, stdout) => {
                if (err) {
                    resolve(null);
                    return;
                }
                const lines = stdout.trim().split(/\r?\n/).filter(l => l.trim() !== "");
                if (lines.length === 0) {
                    resolve(null);
                    return;
                }
                const pid = parseInt(lines[lines.length - 1]);
                if (!isNaN(pid) && pid > 0) {
                    resolve(pid);
                } else {
                    resolve(null);
                }
            });
        } else if (platform === "darwin" || platform === "linux") {
            // macOS and Linux: use pgrep with pattern matching
            const escapedDir = gameDir.replace(/'/g, "'\\''");
            const cmd = `pgrep -f "java.*${escapedDir}" | tail -1`;

            exec(cmd, (err, stdout) => {
                if (err) {
                    resolve(null);
                    return;
                }
                const pid = parseInt(stdout.trim());
                if (!isNaN(pid) && pid > 0) {
                    resolve(pid);
                } else {
                    resolve(null);
                }
            });
        } else {
            resolve(null);
        }
    });
}

export function killProcessAndChildren(pid: number) {
    const platform = process.platform;

    if (platform === 'win32') {
        exec(`taskkill /pid ${pid} /T /F`, (err) => {
            // Ignore "not found" errors
        });
    } else if (platform === 'darwin') {
        // macOS: kill process group
        try {
            process.kill(-pid, 'SIGKILL');
        } catch (e) {
            // Fallback to regular kill
            try { process.kill(pid, 'SIGKILL'); } catch (e2) { }
        }
    } else {
        // Linux: try to kill process tree using pkill
        exec(`pkill -KILL -P ${pid}`, (err) => {
            // Also kill the parent
            try { process.kill(pid, 'SIGKILL'); } catch (e) { }
        });
    }
}

// =========================================
// Main Kill Logic
// =========================================

/**
 * Kill the current game process for a specific instance
 */
export async function killGame(instanceId: string): Promise<void> {
    console.log(`[GameProcess] killGame called for instance ${instanceId}`);
    let killed = false;
    const gameProcess = gameProcesses.get(instanceId);
    const gameDirectory = activeGameDirectories.get(instanceId);

    // 1. Try killing the known PID
    if (gameProcess && gameProcess.pid) {
        const pid = gameProcess.pid;
        console.log(`[GameProcess] Killing known PID: ${pid}`);

        if (process.platform === "win32") {
            try {
                await new Promise<void>((resolve) => {
                    exec(`taskkill /PID ${pid} /T /F`, (err, stdout, stderr) => {
                        if (err) {
                            console.warn(`[GameProcess] Taskkill warning for ${pid}:`, err.message);
                        } else {
                            console.log("[GameProcess] Taskkill success:", stdout.trim());
                            killed = true;
                        }
                        resolve();
                    });
                });
            } catch (e: any) {
                console.error("[GameProcess] Taskkill error:", e);
            }
        } else {
            try {
                process.kill(pid, "SIGKILL");
                killed = true;
            } catch (e) {
                console.error("[GameProcess] SIGKILL failed:", e);
            }
        }

        try { gameProcess.kill(); } catch (e) { }
    } else {
        console.warn(`[GameProcess] No gameProcess object found for ${instanceId}`);
    }

    // 2. Fallback: Scan by directory
    if (!killed && gameDirectory) {
        console.log(`[GameProcess] Verify/Fallback: Checking for any Java process in: ${gameDirectory}`);
        const fallbackPid = await findPidByGameDirectory(gameDirectory);

        if (fallbackPid) {
            console.log(`[GameProcess] Found persistent process PID: ${fallbackPid}. Force killing it.`);
            if (process.platform === "win32") {
                exec(`taskkill /PID ${fallbackPid} /T /F`, (err, stdout) => {
                    if (err) {
                        console.error("[GameProcess] Fallback Taskkill failed:", err.message);
                    } else {
                        console.log("[GameProcess] Fallback Taskkill success");
                    }
                });
            } else {
                try { process.kill(fallbackPid, "SIGKILL"); } catch (e) { }
            }
        }
    }

    resetLauncherState(instanceId);
}

/**
 * Kill all known Java processes (Emergency cleanup)
 */
export async function killAllLauncherJavaProcesses(): Promise<void> {
    if (lastGamePid) {
        killProcessAndChildren(lastGamePid);
    }
    // Iterate over all active processes
    const killPromises = Array.from(gameProcesses.keys()).map(id => killGame(id));
    await Promise.all(killPromises);
}

export function clearKillRetry(instanceId?: string): void {
    if (instanceId) {
        const timer = killRetryTimers.get(instanceId);
        if (timer) {
            clearTimeout(timer);
            killRetryTimers.delete(instanceId);
        }
    } else {
        // Clear all timers
        for (const timer of killRetryTimers.values()) {
            clearTimeout(timer);
        }
        killRetryTimers.clear();
    }
}

export function startKillRetry(instanceId: string): void {
    clearKillRetry(instanceId);

    const timer = setTimeout(async () => {
        const p = gameProcesses.get(instanceId);
        const dir = activeGameDirectories.get(instanceId);

        if (p && !p.killed) {
            console.log(`[GameProcess] Retry killing instance ${instanceId}...`);
            await killGame(instanceId);
        } else if (dir) {
            const pid = await findPidByGameDirectory(dir);
            if (pid) {
                console.log("[GameProcess] Retry found lingering process, killing...");
                await killGame(instanceId);
            }
        }
        killRetryTimers.delete(instanceId);
    }, 2000);

    killRetryTimers.set(instanceId, timer);
}
