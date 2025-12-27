/**
 * ========================================
 * Minecraft Game Launcher Module
 * ========================================
 * 
 * ใช้ minecraft-java-core เพื่อเปิดเกม Minecraft
 * - ดาวน์โหลด game files อัตโนมัติ
 * - สร้าง command line arguments
 * - Spawn Java process
 * - รองรับ mod loaders (Forge, Fabric, NeoForge, Quilt)
 */

import { Launch } from "minecraft-java-core";
import { app } from "electron";
import { getMinecraftDir, getConfig } from "./config.js";
import { execSync, type ChildProcess } from "node:child_process";

// ========================================
// Types
// ========================================

export interface LaunchOptions {
    version: string;
    username: string;
    uuid: string;
    accessToken?: string;
    ramMB?: number;
    javaPath?: string;
    gameDirectory?: string;
    loader?: {
        type: "forge" | "fabric" | "neoforge" | "quilt" | "legacyfabric";
        build?: string;
        enable: boolean;
    };
}

export interface LaunchProgress {
    type: "download" | "extract" | "launch";
    task?: string;
    current?: number;
    total?: number;
    percent?: number;
    speed?: number; // kB/s
    estimated?: number; // seconds remaining
}

export interface LaunchResult {
    ok: boolean;
    message: string;
    pid?: number;
}

// ========================================
// Launcher Instance
// ========================================

const launcher = new Launch();

// Track current game process
let gameProcess: ChildProcess | null = null;

// Track the last known game PID (even if process handle is lost)
let lastGamePid: number | null = null;

// Track if we're in the launching phase (downloading, preparing, etc.)
let isLaunching = false;

// Track if launch was aborted (user clicked stop during download)
let launchAborted = false;

/**
 * Reset launcher state - call this on app start to clear any stale state
 */
export function resetLauncherState(): void {
    isLaunching = false;
    launchAborted = false;
    gameProcess = null;
    lastGamePid = null;
    console.log("[Launcher] State reset on app start");
}

/**
 * Callback when game closes
 */
type OnGameCloseCallback = () => void;
let onGameCloseCallback: OnGameCloseCallback | null = null;

export function setOnGameCloseCallback(callback: OnGameCloseCallback | null): void {
    onGameCloseCallback = callback;
}

/**
 * Game log callback type
 */
type GameLogCallback = (level: string, message: string) => void;
let gameLogCallback: GameLogCallback | null = null;

export function setGameLogCallback(callback: GameLogCallback | null): void {
    gameLogCallback = callback;
}

/**
 * Progress callback type
 */
type ProgressCallback = (progress: LaunchProgress) => void;

// Progress listeners
let progressCallback: ProgressCallback | null = null;

// Setup event listeners
// Game data event - sends logs to renderer if callback is set
launcher.on("data", (e: string) => {
    if (gameLogCallback && e && e.trim()) {
        // Parse log level from Minecraft log format: [HH:MM:SS] [Thread/LEVEL]: message
        let level = "info";
        if (e.includes("/ERROR]") || e.includes("/FATAL]")) level = "error";
        else if (e.includes("/WARN]")) level = "warn";
        else if (e.includes("/DEBUG]")) level = "debug";

        gameLogCallback(level, e.trim());
    }
});

launcher.on("progress", (progress: number, size: number) => {
    const percent = size > 0 ? Math.round((progress / size) * 100) : 0;
    const progressData: LaunchProgress = {
        type: "download",
        task: "Downloading files",
        current: progress,
        total: size,
        percent: percent,
    };

    console.log(`[Launcher] Download: ${percent}%`);

    if (progressCallback) {
        progressCallback(progressData);
    }
});

launcher.on("speed", (speed: number) => {
    console.log(`[Launcher] Speed: ${speed} kB/s`);
    if (progressCallback) {
        progressCallback({
            type: "download",
            speed: speed,
        });
    }
});

launcher.on("estimated", (time: number) => {
    console.log(`[Launcher] ETA: ${time}s`);
    if (progressCallback) {
        progressCallback({
            type: "download",
            estimated: time,
        });
    }
});

launcher.on("extract", (extract: string) => {
    console.log("[Launcher] Extracting:", extract);
    if (progressCallback) {
        progressCallback({
            type: "extract",
            task: `Extracting ${extract}`,
        });
    }
});

launcher.on("patch", (patch: string) => {
    console.log("[Launcher] Patching:", patch);
});

launcher.on("error", (err: Error) => {
    console.error("[Launcher] Error:", err);
    isLaunching = false;
});

launcher.on("close", () => {
    console.log("[Launcher] Game closed");
    isLaunching = false;
    launchAborted = false;
    gameProcess = null;

    // Notify main process that game has closed
    if (onGameCloseCallback) {
        onGameCloseCallback();
    }
});

// Capture process reference when minecraft-java-core spawns the game
launcher.on("debug", (e: string) => console.log("[MCLC Debug]", e));
launcher.on("data", (e: string) => console.log("[MCLC Data]", e));
launcher.on("process", (proc: ChildProcess) => {
    console.log("[Launcher] Game process started, PID:", proc.pid);
    gameProcess = proc;
    if (proc.pid) lastGamePid = proc.pid;

    // Detach the process from Electron's event loop
    // This allows the game to continue running after Launcher closes
    proc.unref();
    if (proc.stdout) (proc.stdout as any).unref?.();
    if (proc.stderr) (proc.stderr as any).unref?.();
    if (proc.stdin) (proc.stdin as any).unref?.();

    // If user clicked stop during download, kill immediately
    if (launchAborted) {
        console.log("[Launcher] Launch was aborted, killing process immediately");
        killProcessAndChildren(proc.pid);
        proc.kill();
        gameProcess = null;
        isLaunching = false;
        launchAborted = false;
    }
});

// Also listen for "start" event as alternative
launcher.on("start", (proc: ChildProcess) => {
    if (proc && proc.pid) {
        console.log("[Launcher] Game started via 'start' event, PID:", proc.pid);
        gameProcess = proc;
        lastGamePid = proc.pid;

        // Detach the process from Electron's event loop
        proc.unref();
        if (proc.stdout) (proc.stdout as any).unref?.();
        if (proc.stderr) (proc.stderr as any).unref?.();
        if (proc.stdin) (proc.stdin as any).unref?.();

        // If user clicked stop during download, kill immediately
        if (launchAborted) {
            console.log("[Launcher] Launch was aborted, killing process immediately");
            killProcessAndChildren(proc.pid);
            proc.kill();
            gameProcess = null;
            isLaunching = false;
            launchAborted = false;
        }
    }
});

/**
 * Kill a process and all its children (Windows only)
 * Uses taskkill with /T flag to terminate the entire process tree
 */
function killProcessAndChildren(pid: number | undefined): void {
    if (!pid) return;

    if (process.platform === "win32") {
        try {
            // /F = Force, /T = Tree (kill child processes too)
            execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
            console.log("[Launcher] Killed process tree for PID:", pid);
        } catch {
            // Process may already be dead
        }
    }
}

/**
 * Kill all Java processes related to our launcher
 */
function killAllLauncherJavaProcesses(): void {
    if (process.platform !== "win32") return;

    try {
        // Kill by window title
        execSync('taskkill /F /FI "WINDOWTITLE eq Minecraft*"', { stdio: "ignore" });
    } catch { /* ignore */ }

    try {
        // Kill javaw.exe with our launcher branding in command line
        const psCommand = `Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'java*' -and $_.CommandLine -like '*RealityLauncher*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
        execSync(`powershell -Command "${psCommand}"`, { stdio: "ignore", timeout: 3000 });
        console.log("[Launcher] Killed launcher Java processes via PowerShell");
    } catch { /* ignore */ }
}

/**
 * Set progress callback
 */
export function setProgressCallback(callback: ProgressCallback | null): void {
    progressCallback = callback;
}

/**
 * Launch Minecraft game
 */
export async function launchGame(options: LaunchOptions): Promise<LaunchResult> {
    // Set launching flag and reset abort flag
    isLaunching = true;
    launchAborted = false;

    const {
        version,
        username,
        uuid,
        accessToken,
        ramMB = 4096,
        javaPath,
        loader,
    } = options;

    // Sanitize UUID - remove "catid-" prefix which causes crash in some mods (EpicFight)
    const sanitizedUuid = uuid ? uuid.replace(/^catid-/, "") : uuid;

    const config = getConfig();
    // minecraft-java-core uses `path` as the working directory for ALL game files
    // This includes assets, libraries, versions, mods, saves, config
    // We use the instance directory directly so mods/saves stay with the instance
    const gameDir = options.gameDirectory || getMinecraftDir();

    console.log("[Launcher] Starting game with options:", {
        version,
        username,
        uuid,
        ramMB,
        gameDir,
        javaPath: javaPath || config.javaPath || "auto",
        loader: loader,
    });

    try {
        // Create authentication object for minecraft-java-core
        // For offline mode, we create a profile without access token
        const authenticator = {
            access_token: accessToken || "",
            client_token: "",
            uuid: sanitizedUuid,
            name: username,
            user_properties: "{}",
            meta: {
                type: accessToken ? "msa" : "offline",
                demo: false,
            },
        };

        // Build launch options for minecraft-java-core
        // path = directory where game files are stored (assets, libraries, mods, saves, etc.)
        // Note: minecraft-java-core doesn't support separate gameDirectory
        const launchOpts: any = {
            path: gameDir,
            authenticator: authenticator,
            version: version,
            memory: {
                min: `${Math.min(ramMB, 2048)}M`,
                max: `${ramMB}M`,
            },
            verify: false,
            downloadFileMultiple: 5,
            // Protect user folders from being deleted during verification
            ignored: [
                "mods",
                "config",
                "saves",
                "resourcepacks",
                "shaderpacks",
                "options.txt",
                "servers.dat",
                "screenshots",
                "logs",
                "crash-reports",
            ],
        };

        // Add custom Java path if specified
        let customJavaPath = javaPath || config.javaPath;

        // Handle "auto" - use system java
        if (customJavaPath === "auto") {
            customJavaPath = "";
        }

        if (customJavaPath) {
            launchOpts.java = {
                path: customJavaPath,
            };
        }

        // Add custom JVM arguments if specified
        if (config.javaArguments) {
            launchOpts.JVM_ARGS = config.javaArguments.split(" ");
        }

        // Add loader configuration if specified
        if (loader && loader.enable) {
            launchOpts.loader = {
                type: loader.type,
                build: loader.build || "latest",
                enable: true,
            };
        }

        // Add launcher branding
        const LAUNCHER_NAME = "RealityLauncher";
        const LAUNCHER_VERSION = app.getVersion() || "0.0.1";

        // JVM arguments for branding
        const brandingJvmArgs = [
            `-Dminecraft.launcher.brand=${LAUNCHER_NAME}`,
            `-Dminecraft.launcher.version=${LAUNCHER_VERSION}`,
            `-Dminecraft.appName=${LAUNCHER_NAME}`,
        ];

        // Game arguments
        const brandingGameArgs = [
            "--launcherName", LAUNCHER_NAME,
            "--launcherVersion", LAUNCHER_VERSION,
        ];

        // Merge with existing JVM args
        if (launchOpts.JVM_ARGS) {
            launchOpts.JVM_ARGS = [...launchOpts.JVM_ARGS, ...brandingJvmArgs];
        } else {
            launchOpts.JVM_ARGS = brandingJvmArgs;
        }

        // Add game arguments
        launchOpts.GAME_ARGS = brandingGameArgs;

        // Debug: Log launch options
        console.log("[Launcher] Launch options:", JSON.stringify({
            path: launchOpts.path,
            version: launchOpts.version,
            game_args: launchOpts.GAME_ARGS,
            authenticator: launchOpts.authenticator,
        }, null, 2));

        // Launch the game
        console.log("[Launcher] Launching with minecraft-java-core...");

        // The Launch method may return a ChildProcess or trigger events
        const launchResult = await launcher.Launch(launchOpts);

        // Debug: Log what we got back
        console.log("[Launcher] Launch returned:", typeof launchResult, launchResult && typeof launchResult === 'object' ? Object.keys(launchResult) : String(launchResult));

        // Check if user aborted during download
        if (launchAborted) {
            console.log("[Launcher] Launch was aborted during download");
            isLaunching = false;
            launchAborted = false;
            return {
                ok: false,
                message: "การเปิดเกมถูกยกเลิก",
            };
        }

        // Handle different return types - minecraft-java-core returns the process
        if (launchResult) {
            // Cast to any to check properties
            const result = launchResult as any;

            // Check if it's a ChildProcess (has pid property)
            if (result.pid !== undefined) {
                gameProcess = result as ChildProcess;
                console.log("[Launcher] Got process directly from Launch(), PID:", gameProcess.pid);
            }
            // Check if it has a process property
            else if (result.process && result.process.pid) {
                gameProcess = result.process as ChildProcess;
                console.log("[Launcher] Got process from result.process, PID:", gameProcess.pid);
            }
        }

        // If we got a process, set up event handlers
        if (gameProcess) {
            const pid = gameProcess.pid;
            console.log("[Launcher] Game started with PID:", pid);

            // Note: stdout/stderr logging disabled for performance
            // Game output can be very verbose and slow down the launcher
            // Uncomment for debugging:
            gameProcess.stdout?.on("data", (data: Buffer) => {
                console.log("[Game]", data.toString("utf-8").trim());
            });
            gameProcess.stderr?.on("data", (data: Buffer) => {
                console.error("[Game Error]", data.toString("utf-8").trim());
            });

            gameProcess.on("exit", (code: number | null) => {
                console.log("[Launcher] Game exited with code:", code);
                isLaunching = false;
                gameProcess = null;
            });

            gameProcess.on("error", (err: Error) => {
                console.error("[Launcher] Game process error:", err);
                isLaunching = false;
                gameProcess = null;
            });

            return {
                ok: true,
                message: `เปิดเกม ${version} สำเร็จ`,
                pid: pid,
            };
        }

        // If no direct process returned, assume launch was successful via events
        console.log("[Launcher] Game launch initiated (no direct process handle)");
        // Keep isLaunching=true, will be cleared when game process starts or exits
        return {
            ok: true,
            message: `เปิดเกม ${version} สำเร็จ`,
        };
    } catch (error: any) {
        // Reset launching flag on error
        isLaunching = false;
        console.error("[Launcher] Error launching game:", error);

        // Check for common errors
        if (error.message?.includes("java")) {
            return {
                ok: false,
                message: "ไม่พบ Java - กรุณาติดตั้ง Java หรือตั้งค่า Java path ในการตั้งค่า",
            };
        }

        if (error.message?.includes("ENOENT")) {
            return {
                ok: false,
                message: "ไม่พบไฟล์ที่จำเป็น - กรุณาตรวจสอบการตั้งค่า",
            };
        }

        return {
            ok: false,
            message: error.message || "เกิดข้อผิดพลาดในการเปิดเกม",
        };
    }
}

// Kill retry interval
let killRetryInterval: NodeJS.Timeout | null = null;

/**
 * Start retry mechanism to kill Minecraft/Java process
 * Keeps trying every 200ms for 5 seconds
 */
function startKillRetry() {
    // Clear any existing retry
    if (killRetryInterval) {
        clearInterval(killRetryInterval);
    }

    let attempts = 0;
    const maxAttempts = 25; // 25 attempts x 200ms = 5 seconds

    console.log("[Launcher] Starting kill retry mechanism");

    killRetryInterval = setInterval(() => {
        attempts++;

        // Stop if launchAborted was cleared (game was killed) or max attempts reached
        if (!launchAborted || attempts >= maxAttempts) {
            console.log("[Launcher] Kill retry stopped (attempts:", attempts, ")");
            clearKillRetry();
            return;
        }

        // Try to kill each iteration
        killAllLauncherJavaProcesses();
    }, 200);
}

function clearKillRetry() {
    launchAborted = false;
    isLaunching = false;
    if (killRetryInterval) {
        clearInterval(killRetryInterval);
        killRetryInterval = null;
    }
}

/**
 * Check if game is running or launching
 */
export function isGameRunning(): boolean {
    return isLaunching || gameProcess !== null;
}

/**
 * Kill running game process
 */
export function killGame(): boolean {
    const wasLaunching = isLaunching;
    isLaunching = false;
    launchAborted = true; // Set abort flag to catch any late-starting process

    console.log("[Launcher] Kill requested. wasLaunching:", wasLaunching, "gameProcess:", !!gameProcess, "lastGamePid:", lastGamePid);

    // If we have a process handle, kill it
    if (gameProcess) {
        const pid = gameProcess.pid;
        console.log("[Launcher] Killing game process, PID:", pid);

        try {
            // First try taskkill with tree flag for Windows
            killProcessAndChildren(pid);
            gameProcess.kill();
        } catch (err) {
            console.error("[Launcher] Error killing process:", err);
        }

        gameProcess = null;
        lastGamePid = null;
        launchAborted = false;
        console.log("[Launcher] Game process killed");
        return true;
    }

    // Try to kill by last known PID
    if (lastGamePid) {
        console.log("[Launcher] No process handle, trying last known PID:", lastGamePid);
        killProcessAndChildren(lastGamePid);
        lastGamePid = null;
    }

    // If we were launching (download phase), immediately try to kill all launcher Java processes
    if (wasLaunching) {
        console.log("[Launcher] Was launching - aggressively killing all launcher Java processes");
        killAllLauncherJavaProcesses();

        // Start retry mechanism to keep trying for a few seconds
        // This handles the case where Java process starts after we click stop
        startKillRetry();
        return true;
    }

    // Fallback: try to kill by window title or command line on Windows
    if (process.platform === "win32") {
        killAllLauncherJavaProcesses();
        return true;
    }

    return false;
}

/**
 * Get installed Minecraft versions
 */
export async function getInstalledVersions(): Promise<string[]> {
    const minecraftDir = getMinecraftDir();
    const fs = await import("node:fs");
    const path = await import("node:path");

    const versionsDir = path.join(minecraftDir, "versions");

    try {
        if (!fs.existsSync(versionsDir)) {
            return [];
        }

        const dirs = fs.readdirSync(versionsDir, { withFileTypes: true });
        const versions: string[] = [];

        for (const dir of dirs) {
            if (dir.isDirectory()) {
                // Check if version has a valid JSON file
                const jsonPath = path.join(versionsDir, dir.name, `${dir.name}.json`);
                if (fs.existsSync(jsonPath)) {
                    versions.push(dir.name);
                }
            }
        }

        // Sort versions (newest first)
        return versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    } catch (error) {
        console.error("[Launcher] Error reading versions:", error);
        return [];
    }
}
