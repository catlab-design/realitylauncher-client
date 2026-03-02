import { ChildProcess, exec } from "child_process";
import { getNativeModule } from "../native.js";

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

type NativeRunningInstance = {
    instanceId?: string;
    instance_id?: string;
    pid?: number;
    gameDir?: string;
    game_dir?: string;
    startTime?: number;
    start_time?: number;
};

function getNativeProcessModule(): any | null {
    try {
        return getNativeModule();
    } catch {
        return null;
    }
}

function normalizePathForCompare(value: string): string {
    if (process.platform === "win32") {
        return value.replace(/\//g, "\\").toLowerCase();
    }
    return value;
}

function getNativeRunningInstances(): Array<{
    instanceId: string;
    pid: number;
    gameDir: string;
    startTime: number;
}> {
    const native = getNativeProcessModule();
    if (!native || typeof native.getRunningInstances !== "function") {
        return [];
    }

    try {
        const rows = native.getRunningInstances();
        if (!Array.isArray(rows)) return [];
        return rows
            .map((row: NativeRunningInstance) => ({
                instanceId: row.instanceId || row.instance_id || "",
                pid: Number(row.pid) || 0,
                gameDir: row.gameDir || row.game_dir || "",
                startTime: Number(row.startTime ?? row.start_time ?? 0),
            }))
            .filter((row) => !!row.instanceId && row.pid > 0);
    } catch (error) {
        console.warn("[GameProcess] Native getRunningInstances failed:", error);
        return [];
    }
}

function isPidAlive(pid: number): boolean {
    const native = getNativeProcessModule();
    if (native && typeof native.isProcessAlive === "function") {
        try {
            return !!native.isProcessAlive(pid);
        } catch (error) {
            console.warn(`[GameProcess] Native isProcessAlive failed for ${pid}:`, error);
        }
    }

    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function killPidTree(pid: number): boolean {
    const native = getNativeProcessModule();
    if (native && typeof native.killProcessTree === "function") {
        try {
            if (native.killProcessTree(pid)) {
                return true;
            }
        } catch (error) {
            console.warn(`[GameProcess] Native killProcessTree failed for ${pid}:`, error);
        }
    }

    const platform = process.platform;
    if (platform === "win32") {
        exec(`taskkill /pid ${pid} /T /F`, () => {
            // Ignore "not found" errors
        });
        return true;
    }

    if (platform === "darwin") {
        try {
            process.kill(-pid, "SIGKILL");
            return true;
        } catch {
            try {
                process.kill(pid, "SIGKILL");
                return true;
            } catch {
                return false;
            }
        }
    }

    exec(`pkill -KILL -P ${pid}`, () => {
        try {
            process.kill(pid, "SIGKILL");
        } catch {}
    });
    return true;
}

function removeNativeRunningInstance(instanceId: string): void {
    const native = getNativeProcessModule();
    if (!native || typeof native.removeRunningInstance !== "function") {
        return;
    }
    try {
        native.removeRunningInstance(instanceId);
    } catch {}
}

function getNativeTrackedPid(instanceId: string): number | null {
    const native = getNativeProcessModule();
    if (!native || typeof native.getInstancePid !== "function") {
        return null;
    }
    try {
        const pid = native.getInstancePid(instanceId);
        return typeof pid === "number" && pid > 0 ? pid : null;
    } catch {
        return null;
    }
}

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
    const processIsActive = (instanceKey: string, processRef: ChildProcess): boolean => {
        const pid = Number((processRef as any).pid) || 0;
        if (!pid) return false;

        const hasExited = processRef.killed === true || typeof processRef.exitCode === "number";
        if (hasExited) return false;

        if (isPidAlive(pid)) {
            return true;
        }

        gameProcesses.delete(instanceKey);
        launchingStates.delete(instanceKey);
        return false;
    };

    if (instanceId) {
        const p = gameProcesses.get(instanceId);
        if (p && processIsActive(instanceId, p)) {
            return true;
        }

        const nativeInstances = getNativeRunningInstances();
        const nativeEntry = nativeInstances.find((item) => item.instanceId === instanceId);
        if (nativeEntry && isPidAlive(nativeEntry.pid)) {
            return true;
        }

        const nativeTrackedPid = getNativeTrackedPid(instanceId);
        if (nativeTrackedPid && isPidAlive(nativeTrackedPid)) {
            return true;
        }
        return false;
    }

    // If no ID provided, check if ANY tracked game is running
    for (const [id, p] of gameProcesses) {
        if (processIsActive(id, p)) {
            return true;
        }
    }

    // Also check persisted native tracker (covers app restart + orphaned JS map)
    const nativeInstances = getNativeRunningInstances();
    if (nativeInstances.some((item) => isPidAlive(item.pid))) {
        return true;
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
        const normalizedGameDir = normalizePathForCompare(gameDir);
        const nativeMatch = getNativeRunningInstances().find((item) => {
            if (!item.gameDir) return false;
            const trackedDir = normalizePathForCompare(item.gameDir);
            return (
                trackedDir === normalizedGameDir ||
                trackedDir.includes(normalizedGameDir) ||
                normalizedGameDir.includes(trackedDir)
            );
        });

        if (nativeMatch?.pid && isPidAlive(nativeMatch.pid)) {
            resolve(nativeMatch.pid);
            return;
        }

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

export function killProcessAndChildren(pid: number): boolean {
    return killPidTree(pid);
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
    const tryKillPid = (pid: number, source: string): boolean => {
        if (!pid || pid <= 0) return false;
        console.log(`[GameProcess] Killing ${source}: ${pid}`);
        const ok = killProcessAndChildren(pid);
        if (!ok) {
            console.warn(`[GameProcess] Failed to kill PID ${pid} from ${source}`);
            return false;
        }
        return true;
    };

    // 1. Try killing the known PID
    if (gameProcess && gameProcess.pid) {
        const pid = gameProcess.pid;
        killed = tryKillPid(pid, "known PID") || killed;

        try { gameProcess.kill(); } catch (e) { }
    } else {
        console.warn(`[GameProcess] No gameProcess object found for ${instanceId}`);
    }

    // 2. Fallback: Native tracker PID
    if (!killed) {
        const nativeTrackedPid = getNativeTrackedPid(instanceId);
        if (nativeTrackedPid) {
            killed = tryKillPid(nativeTrackedPid, "native tracker PID") || killed;
        }
    }

    // 3. Fallback: Scan by directory
    if (!killed && gameDirectory) {
        console.log(`[GameProcess] Verify/Fallback: Checking for any Java process in: ${gameDirectory}`);
        const fallbackPid = await findPidByGameDirectory(gameDirectory);

        if (fallbackPid) {
            killed = tryKillPid(fallbackPid, "directory scan PID") || killed;
        }
    }

    if (killed) {
        removeNativeRunningInstance(instanceId);
    }

    resetLauncherState(instanceId);
}

/**
 * Kill all known Java processes (Emergency cleanup)
 */
export async function killAllLauncherJavaProcesses(): Promise<void> {
    const nativeInstances = getNativeRunningInstances();
    for (const nativeInstance of nativeInstances) {
        killProcessAndChildren(nativeInstance.pid);
        removeNativeRunningInstance(nativeInstance.instanceId);
    }

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
