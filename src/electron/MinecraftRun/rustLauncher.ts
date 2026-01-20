/**
 * ========================================
 * Rust-based Minecraft Launcher
 * ========================================
 * 
 * ใช้ Rust native module สำหรับ launch Minecraft
 * - เร็วกว่า minecraft-java-core
 * - ไม่มีปัญหา PID polling
 * - รองรับ mod loaders
 */

import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import { createRequire } from "module";
import { getMinecraftDir, getConfig } from "../config.js";
import { execSync } from "child_process";

// Helper to locate a suitable Java executable (prefer Java 17)
// Helper to locate a suitable Java executable (Smart Version Selection)
async function getJavaPath(customJavaPath: string | undefined, configJavaPath: string | undefined, native: any, mcVersion?: string): Promise<string> {
    // Detect required Java version first
    // Minecraft < 1.17 -> Java 8
    // Minecraft 1.17 - 1.20.4 -> Java 17
    // Minecraft 1.20.5+ -> Java 21
    let targetJavaVersion = 17;
    if (mcVersion) {
        const parts = mcVersion.split(".");
        if (parts.length >= 2) {
            const minor = parseInt(parts[1]);
            const patch = parts[2] ? parseInt(parts[2]) : 0;

            if (minor < 17) {
                targetJavaVersion = 8;
            } else if (minor > 20 || (minor === 20 && patch >= 5)) {
                // 1.20.5+ requires Java 21
                targetJavaVersion = 21;
            }
            console.log(`[RustLauncher] Version Check: mcVersion=${mcVersion}, minor=${minor}, patch=${patch} -> targetJavaVersion=${targetJavaVersion}`);
        }
    }

    // Helper to check if Java path is valid (exists and not placeholder)
    const isValidJavaPath = (p: string | undefined): p is string => {
        return !!p && p !== "/path/to/java" && fs.existsSync(p);
    };

    // 1. Use explicit custom path if provided and exists
    let javaPath: string | undefined;
    if (isValidJavaPath(customJavaPath)) {
        javaPath = customJavaPath;
        console.log(`[RustLauncher] Using custom Java path: ${javaPath}`);
    }

    // 2. Check user-configured javaPaths from Settings
    if (!javaPath) {
        const config = getConfig();
        const javaPaths = config.javaPaths || {};

        // Try to match target version first, then fallback to higher versions
        if (targetJavaVersion === 8 && isValidJavaPath(javaPaths.java8)) {
            javaPath = javaPaths.java8;
            console.log(`[RustLauncher] Using configured Java 8: ${javaPath}`);
        } else if (targetJavaVersion >= 21) {
            // Requirement is Java 21+
            const candidates = [javaPaths.java21, javaPaths.java25];
            javaPath = candidates.find(isValidJavaPath);
            if (javaPath) {
                console.log(`[RustLauncher] Using configured Java (21+): ${javaPath}`);
            }
        } else if (targetJavaVersion >= 17) {
            // Requirement is Java 17+, but allow 21/25 too
            const candidates = [javaPaths.java17, javaPaths.java21, javaPaths.java25];
            javaPath = candidates.find(isValidJavaPath);
            if (javaPath) {
                console.log(`[RustLauncher] Using configured Java (17+): ${javaPath}`);
            }
        }

    }

    // 3. If still not set or set to "auto", discover installations via native module
    if (!javaPath || javaPath === "auto") {
        const canProbe = native && typeof native.findJavaInstallations === "function";
        const javaInstalls = canProbe ? await native.findJavaInstallations() : [];
        if (canProbe) {
            console.log(`[RustLauncher] Detected Java installations (Target: Java ${targetJavaVersion}):`, JSON.stringify(javaInstalls, null, 2));
        } else {
            console.log(`[RustLauncher] Native java finder unavailable, skipping auto-detect`);
        }

        if (javaInstalls && javaInstalls.length > 0) {
            const exactMatch = javaInstalls.find((j: any) => j.majorVersion === targetJavaVersion);
            const newerMatch = targetJavaVersion >= 17
                ? javaInstalls.find((j: any) => j.majorVersion >= targetJavaVersion)
                : undefined;

            javaPath = exactMatch?.path || newerMatch?.path || javaInstalls[0].path;
        }
    }

    // 4. Fallback to legacy single javaPath (only if file exists and we haven't found a better one)
    if (!javaPath && isValidJavaPath(configJavaPath)) {
        javaPath = configJavaPath;
        console.log(`[RustLauncher] Using legacy configured javaPath: ${javaPath}`);
    }

    if (!javaPath) {
        const msg = targetJavaVersion === 8
            ? "ไม่พบ Java 8 - กรุณาติดตั้ง Java 8 สำหรับ Minecraft รุ่นเก่า"
            : `ไม่พบ Java ${targetJavaVersion}+ - กรุณาติดตั้ง Java ${targetJavaVersion} หรือใหม่กว่า`;
        throw new Error(msg);
    }
    return javaPath;
}


import type { LaunchOptions, LaunchResult, LaunchProgress } from "./types.js";
import {
    getProgressCallback,
    getGameLogCallback,
    getOnGameCloseCallback,
} from "./callbacks.js";
import {
    setGameProcess,
    setLaunching,
    setAborted,
    isAborted,
    setActiveGameDirectory,
} from "./gameProcess.js";
import { downloadFileAtomic } from "../modrinth.js";

// Get native module (CJS compatible - esbuild outputs CJS)
const customRequire = createRequire(__filename);

function getNative() {
    const nativePath = path.join(app.getAppPath(), "native", "index.cjs");
    return customRequire(nativePath);
}

async function ensureLibrariesDownloaded(versionJsonStr: string, minecraftDir: string): Promise<void> {
    const version = JSON.parse(versionJsonStr);
    const librariesDir = path.join(minecraftDir, "libraries");
    const libs: any[] = version.libraries || [];

    for (const lib of libs) {
        try {
            const artifact = lib.downloads?.artifact;
            let relPath: string | undefined = artifact?.path;

            if (!relPath) {
                const parts = (lib.name || "").split(":");
                if (parts.length >= 3) {
                    const [group, name, ver, classifier] = parts;
                    const groupPath = group.replace(/\./g, "/");
                    const file = classifier
                        ? `${name}-${ver}-${classifier}.jar`
                        : `${name}-${ver}.jar`;
                    relPath = `${groupPath}/${name}/${ver}/${file}`;
                }
            }

            if (!relPath) continue;

            const destPath = path.join(librariesDir, relPath);
            if (fs.existsSync(destPath)) continue;

            let baseUrl = artifact?.url || lib.url;
            if (!baseUrl) {
                const group = (lib.name || "").split(":")[0] || "";
                if (group.startsWith("net.minecraftforge")) {
                    baseUrl = "https://maven.minecraftforge.net";
                } else if (group.startsWith("net.neoforged")) {
                    baseUrl = "https://maven.neoforged.net/releases";
                } else {
                    // Default Minecraft libs CDN
                    baseUrl = "https://libraries.minecraft.net";
                }
            }

            const url = baseUrl.endsWith("/") ? `${baseUrl}${relPath}` : `${baseUrl}/${relPath}`;
            const sha1 = artifact?.sha1;

            if (!fs.existsSync(path.dirname(destPath))) {
                fs.mkdirSync(path.dirname(destPath), { recursive: true });
            }

            await downloadFileAtomic(url, destPath, sha1 ? { sha1 } : undefined);
            console.log(`[ForgeFix] Downloaded missing library: ${relPath}`);
        } catch (e) {
            console.warn("[ForgeFix] Failed to ensure library", e);
        }
    }
}

interface DownloadItem {
    url: string;
    path: string;
    sha1?: string;
    size?: number;
}

interface PrepareResult {
    success: boolean;
    downloadsNeeded: DownloadItem[];
    classpath: string[];
    mainClass: string;
    gameArgs: string[];
    jvmArgs: string[];
    error?: string;
}

/**
 * Launch Minecraft using Rust backend
 */
export async function launchGameRust(options: LaunchOptions): Promise<LaunchResult> {
    const instanceId = (options as any).instanceId || "default";
    const native = getNative();

    setLaunching(instanceId, true);
    setAborted(instanceId, false);

    const {
        version,
        username,
        uuid,
        accessToken,
        ramMB = 4096,
        javaPath: customJavaPath,
        loader,
    } = options;

    const config = getConfig();
    const gameDir = options.gameDirectory || getMinecraftDir();
    const minecraftRoot = getMinecraftDir(); // Shared assets/libraries location
    const assetsDir = path.join(minecraftRoot, "assets");
    const librariesDir = path.join(minecraftRoot, "libraries");
    const versionsDir = path.join(minecraftRoot, "versions");
    const nativesDir = path.join(gameDir, "natives", version);

    setActiveGameDirectory(instanceId, gameDir);

    const progressCallback = getProgressCallback();
    const sendProgress = (progress: Partial<LaunchProgress>) => {
        if (progressCallback) progressCallback(progress as LaunchProgress);
    };

    try {
        // Step 1: Find Java
        sendProgress({ type: "prepare", task: "กำลังค้นหา Java..." });

        let javaPath = await getJavaPath(customJavaPath, config.javaPath, native, version);
        console.log(`[RustLauncher] Using Java: ${javaPath}`);

        // Step 2: Fetch version manifest
        sendProgress({ type: "prepare", task: "กำลังดึงข้อมูลเวอร์ชัน..." });

        const manifest = await native.fetchVersionManifest();
        const versionInfo = manifest.versions.find((v: any) => v.id === version);

        if (!versionInfo) {
            throw new Error(`ไม่พบเวอร์ชัน ${version}`);
        }

        // Step 3: Fetch version detail
        const versionJsonPath = path.join(versionsDir, version, `${version}.json`);
        let versionJson: string;

        if (fs.existsSync(versionJsonPath)) {
            versionJson = fs.readFileSync(versionJsonPath, "utf-8");
        } else {
            sendProgress({ type: "download", task: "กำลังดาวน์โหลด version JSON..." });
            versionJson = await native.fetchVersionDetail(versionInfo.url);

            // Save version JSON
            fs.mkdirSync(path.dirname(versionJsonPath), { recursive: true });
            fs.writeFileSync(versionJsonPath, versionJson);
        }

        // Step 4: Handle mod loader (Fabric/Forge/etc)
        if (loader && loader.enable && loader.type !== "vanilla") {
            sendProgress({ type: "prepare", task: `กำลังเตรียม ${loader.type}...` });
            versionJson = await applyModLoader(versionJson, version, loader, gameDir, native);
        }

        // Step 4.5: Handle inheritsFrom (merge with parent version)
        let mergedVersionData = JSON.parse(versionJson);
        if (mergedVersionData.inheritsFrom) {
            sendProgress({ type: "prepare", task: "กำลัง merge version profiles..." });
            const parentVersion = mergedVersionData.inheritsFrom;
            const parentJsonPath = path.join(versionsDir, parentVersion, `${parentVersion}.json`);

            let parentJson: string;
            if (fs.existsSync(parentJsonPath)) {
                parentJson = fs.readFileSync(parentJsonPath, "utf-8");
            } else {
                // Download parent version JSON
                const parentInfo = manifest.versions.find((v: any) => v.id === parentVersion);
                if (!parentInfo) {
                    throw new Error(`ไม่พบ parent version ${parentVersion}`);
                }
                parentJson = await native.fetchVersionDetail(parentInfo.url);
                fs.mkdirSync(path.dirname(parentJsonPath), { recursive: true });
                fs.writeFileSync(parentJsonPath, parentJson);
            }

            const parentData = JSON.parse(parentJson);

            // Merge: child overrides parent, but libraries are combined
            mergedVersionData = {
                ...parentData,
                ...mergedVersionData,
                // Combine libraries (child first, then parent)
                libraries: [
                    ...(mergedVersionData.libraries || []),
                    ...(parentData.libraries || [])
                ],
                // Merge arguments
                arguments: {
                    game: [
                        ...(mergedVersionData.arguments?.game || []),
                        ...(parentData.arguments?.game || [])
                    ],
                    jvm: [
                        ...(mergedVersionData.arguments?.jvm || []),
                        ...(parentData.arguments?.jvm || [])
                    ]
                }
            };

            // Remove inheritsFrom after merge
            delete mergedVersionData.inheritsFrom;

            console.log(`[RustLauncher] Merged ${mergedVersionData.id} with parent ${parentVersion}`);
            versionJson = JSON.stringify(mergedVersionData);
        }

        // Step 5: Prepare launch
        sendProgress({ type: "prepare", task: "กำลังเตรียมไฟล์เกม..." });

        const versionJarPath = path.join(versionsDir, version, `${version}.jar`);

        // Handle UUID: if it's a valid Minecraft UUID, use it directly
        // If it starts with "catid-", generate an offline-style UUID from username
        let sanitizedUuid = uuid || "00000000-0000-0000-0000-000000000000";
        if (uuid?.startsWith("catid-")) {
            // Generate deterministic offline-style UUID from username
            // This matches Minecraft's offline UUID generation
            const hash = username.split("").reduce((acc, char) => {
                return ((acc << 5) - acc) + char.charCodeAt(0);
            }, 0);
            sanitizedUuid = `00000000-0000-0000-0000-${Math.abs(hash).toString(16).padStart(12, "0")}`;
            console.log(`[RustLauncher] Generated offline UUID for CatID user: ${sanitizedUuid}`);
        }

        // Get asset index from version JSON
        const versionData = JSON.parse(versionJson);
        const assetIndex = versionData.assetIndex?.id || versionData.assets || version;

        const launchOptions = {
            instanceId,
            versionId: version,
            javaPath,
            gameDir,
            assetsDir,
            librariesDir,
            nativesDir,
            versionJarPath,
            username,
            uuid: sanitizedUuid,
            accessToken: accessToken || "",
            userType: accessToken ? "msa" : "legacy",
            ramMinMb: Math.min(ramMB, 2048),
            ramMaxMb: ramMB,
            extraJvmArgs: getOptimizedJvmArgs(),
            extraGameArgs: ["--launcherName", "RealityLauncher", "--launcherVersion", app.getVersion()],
            assetIndex,
        };

        const prepareResult: PrepareResult = await native.prepareLaunch(versionJson, launchOptions);

        if (!prepareResult.success) {
            throw new Error(prepareResult.error || "Failed to prepare launch");
        }

        if (prepareResult.downloadsNeeded.length > 0) {
            sendProgress({
                type: "download",
                task: "กำลังดาวน์โหลดไฟล์เกม...",
                current: 0,
                total: prepareResult.downloadsNeeded.length,
                percent: 0,
            });

            // Use TypeScript-based atomic download instead of native
            // This fixes issues with Forge/NeoForge library corruption
            const downloads = prepareResult.downloadsNeeded;
            const concurrency = 10;
            const queue = [...downloads];
            let completed = 0;
            const total = downloads.length;

            const workers = Array(Math.min(concurrency, queue.length)).fill(null).map(async () => {
                while (queue.length > 0) {
                    const dl = queue.shift();
                    if (!dl) break;

                    try {
                        // Use SHA1 from download item if available
                        const hash = dl.sha1;

                        await downloadFileAtomic(dl.url, dl.path, hash ? { sha1: hash } : undefined);

                        completed++;
                        sendProgress({
                            type: "download",
                            task: `กำลังดาวน์โหลด ${path.basename(dl.path)}`,
                            current: completed,
                            total: total,
                            percent: Math.round((completed / total) * 100)
                        });
                    } catch (err: any) {
                        console.error(`[RustLauncher] Failed to download ${dl.path}:`, err);
                        throw new Error(`Failed to download ${path.basename(dl.path)}: ${err.message}`);
                    }
                }
            });

            await Promise.all(workers)
                .catch(err => {
                    console.error("[RustLauncher] Download errors:", err);
                    throw new Error(`ดาวน์โหลดไฟล์ไม่สำเร็จ: ${err.message}`);
                });

            sendProgress({ type: "download", task: "ดาวน์โหลดเสร็จสิ้น", percent: 100 });
        }

        // Step 7: Download assets (versionData already parsed above)
        if (versionData.assetIndex) {
            sendProgress({ type: "download", task: "กำลังตรวจสอบ assets..." });

            const assetIndexPath = path.join(assetsDir, "indexes", `${versionData.assetIndex.id}.json`);

            if (!fs.existsSync(assetIndexPath)) {
                // Download asset index
                const assetIndexJson = await native.fetchVersionDetail(versionData.assetIndex.url);
                fs.mkdirSync(path.dirname(assetIndexPath), { recursive: true });
                fs.writeFileSync(assetIndexPath, assetIndexJson);
            }

            const assetDownloads = await native.getAssetDownloads(versionData.assetIndex.url, assetsDir);

            if (assetDownloads.length > 0) {
                sendProgress({
                    type: "download",
                    task: `กำลังดาวน์โหลด assets (${assetDownloads.length} ไฟล์)...`,
                    current: 0,
                    total: assetDownloads.length,
                });

                await native.downloadFiles(assetDownloads, 20);
            }
        }

        // Step 8: Extract natives
        sendProgress({ type: "extract", task: "กำลังแตกไฟล์ natives..." });
        fs.mkdirSync(nativesDir, { recursive: true });
        // Native extraction is handled by prepare_launch

        // Step 9: Launch game
        sendProgress({ type: "launch", task: "กำลังเปิดเกม..." });

        if (isAborted(instanceId)) {
            throw new Error("การเปิดเกมถูกยกเลิก");
        }

        // Launch using Node.js spawn for live logging
        const { spawn } = await import("child_process");

        const allArgs = [...prepareResult.jvmArgs, prepareResult.mainClass, ...prepareResult.gameArgs];

        // Debug: Log Java version
        const { execSync } = await import("child_process");
        try {
            const javaVer = execSync(`"${javaPath}" -version 2>&1`).toString();
            console.log(`[RustLauncher] Java Version Output:\n${javaVer}`);

            // ============================================
            // CRITICAL FIX: Java 17 Enforcement for Forge 1.20.1
            // ============================================
            // Forge 1.20.1 (older builds) crashes on Java 21 (UnionFileSystem error).
            // However, newer NeoForge/Forge 1.20.1 builds MIGHT require Java 21.
            // We only force downgrade if we didn't explicitly request Java 21 earlier.

            // Check if we already determined we need Java 21 (based on mcVersion logic at start)
            // But here mcVersion is "1.20.1", so targetJavaVersion was 17.
            // We need to check if the CURRENT javaPath is Java 21, and if so, 
            // deciding whether to keep it or downgrade.

            const isForge20 = version.includes("1.20.1") && loader && (loader.type?.toLowerCase() === "forge");
            // NOTE: NeoForge 1.20.1 usually works with Java 21 or requires it, so we exclude neoforge from forced downgrade

            if (isForge20 && javaVer.includes('"21.')) {
                console.warn(`[RustLauncher] Java 21 detected for Forge 1.20.1. Checking if downgrade is needed...`);
                // Only downgrade for standard Forge, not NeoForge (which is excluded by isForge20 check above)
                // And maybe we should trust the user's config if they explicitly set Java 21?
                // For now, let's just make sure we don't downgrade NeoForge.

                console.warn(`[RustLauncher] Force-downgrading to Java 17 for stability on Forge 1.20.1`);
                javaPath = await getJavaPath(undefined, undefined, native, "1.20.1");
            }

        } catch (e) {
            console.warn(`[RustLauncher] Failed to check Java version: ${e}`);
        }

        const child = spawn(javaPath, allArgs, {
            cwd: gameDir,
            env: { ...process.env },
            stdio: ["ignore", "pipe", "pipe"],
            // On Windows: keep attached for proper cleanup
            // On macOS/Linux: detach to prevent "not responding" issues
            detached: process.platform !== "win32",
            windowsHide: true,
        });

        // On non-Windows, unref the child so it doesn't block launcher exit
        if (process.platform !== "win32") {
            child.unref();
        }

        if (!child.pid) {
            throw new Error("Failed to start game process");
        }

        console.log(`[RustLauncher] Game started with PID: ${child.pid}`);
        console.log(`[RustLauncher] Full Launch Command: "${javaPath}" ${allArgs.join(" ")}`);
        console.log(`[RustLauncher] Launch Args (Head): ${allArgs.slice(0, 10).join(" ")}`);
        console.log(`[RustLauncher] Launch Args (Tail): ${allArgs.slice(-5).join(" ")}`);

        // Setup live logging
        const gameLogCallback = getGameLogCallback();

        if (child.stdout) {
            child.stdout.on("data", (data: Buffer) => {
                const lines = data.toString().split("\n");
                for (const line of lines) {
                    const lineStr = line.trim();
                    if (lineStr) {
                        console.log(`[Game] ${lineStr}`); // Added for debug

                        // Check for corruption errors
                        if (lineStr.includes("java.util.zip.ZipException") || lineStr.includes("zip END header not found")) {
                            console.error("[RustLauncher] Detected zip corruption in game logs!");
                            if (gameLogCallback) {
                                gameLogCallback("error", "DETECTED_CORRUPTION: ตรวจพบไฟล์เกมเสียหาย (ZipException) กรุณากด Verify Files เพื่อซ่อมแซม");
                            }
                        }

                        if (gameLogCallback) {
                            let level = "info";
                            if (lineStr.includes("/ERROR]") || lineStr.includes("/FATAL]")) level = "error";
                            else if (lineStr.includes("/WARN]")) level = "warn";
                            else if (lineStr.includes("/DEBUG]")) level = "debug";
                            gameLogCallback(level, lineStr);
                        }
                    }
                }
            });
        }

        if (child.stderr) {
            child.stderr.on("data", (data: Buffer) => {
                const lines = data.toString().split("\n");
                for (const line of lines) {
                    if (line.trim()) {
                        console.log(`[Game Err] ${line.trim()}`); // Added for debug
                        if (gameLogCallback) {
                            gameLogCallback("error", line.trim());
                        }
                    }
                }
            });
        }

        // Save running instance
        native.saveRunningInstance(instanceId, child.pid, gameDir);

        setGameProcess(instanceId, child as any);

        // Send game-started event to renderer
        const windows = BrowserWindow.getAllWindows();
        for (const win of windows) {
            win.webContents.send("game-started", { instanceId, pid: child.pid });
        }

        // Handle process close
        child.on("close", (code: number | null) => {
            console.log(`[RustLauncher] Game process closed with code: ${code}`);
            native.removeRunningInstance(instanceId);
            setGameProcess(instanceId, null as any);

            // Send IPC event to renderer
            const windows = BrowserWindow.getAllWindows();
            for (const win of windows) {
                win.webContents.send("game-stopped", { instanceId });
            }

            // Emit local event for main process listeners (instance handlers)
            ipcMain.emit("game-stopped", null, { instanceId });

            const onClose = getOnGameCloseCallback();
            if (onClose) onClose();
        });

        child.on("error", (err: Error) => {
            console.error(`[RustLauncher] Game process error:`, err);
        });

        setLaunching(instanceId, false);

        return {
            ok: true,
            message: `เปิดเกม ${version} สำเร็จ`,
            pid: child.pid,
        };

    } catch (error: any) {
        setLaunching(instanceId, false);
        console.error(`[RustLauncher] Error:`, error);

        return {
            ok: false,
            message: error.message || "เกิดข้อผิดพลาดในการเปิดเกม",
        };
    }
}

/**
 * Apply mod loader to version JSON
 */
async function applyModLoader(
    versionJson: string,
    mcVersion: string,
    loader: { type: string; build?: string },
    gameDir: string,
    native: any
): Promise<string> {
    const loaderType = loader.type.toLowerCase();

    if (loaderType === "fabric") {
        // Use native Rust Fabric installer
        console.log(`[Fabric] Using native Rust installer...`);
        const minecraftDir = getMinecraftDir();

        try {
            const loaderVersion = loader.build === "latest" ? undefined : loader.build;
            const result = await native.installFabric(mcVersion, loaderVersion, minecraftDir);

            console.log(`[Fabric] Installed: ${result.versionId}`);

            // Read the generated version JSON
            const fabricVersionJson = fs.readFileSync(result.versionJsonPath, "utf-8");
            const fabricProfile = JSON.parse(fabricVersionJson);

            // Merge with vanilla
            const vanilla = JSON.parse(versionJson);
            return JSON.stringify({
                ...vanilla,
                mainClass: fabricProfile.mainClass,
                libraries: [...fabricProfile.libraries, ...vanilla.libraries],
            });
        } catch (e: any) {
            console.error(`[Fabric] Native install failed:`, e);
            throw new Error(`Fabric install failed: ${e.message}`);
        }
    }

    if (loaderType === "forge" || loaderType === "neoforge") {
        const minecraftDir = getMinecraftDir();
        const librariesDir = path.join(minecraftDir, "libraries");
        const rustLoaderType = loaderType === "neoforge" ? "NeoForge" : "Forge";
        console.log(`[${loaderType}] Using native Rust installer...`);

        let vjson: string;

        try {
            const versionJsonPath = await native.installForge(mcVersion, rustLoaderType, loader.build, minecraftDir, undefined);
            vjson = fs.readFileSync(versionJsonPath, "utf-8");
            await ensureLibrariesDownloaded(vjson, minecraftDir);
        } catch (e: any) {
            console.error(`Native Forge install failed:`, e);
            throw new Error(`Native Forge install failed: ${e.message}`);
        }

        // Parse version to extract forge version and MCP version
        const versionData = JSON.parse(vjson);
        const forgeVersionId = versionData.id || "";
        // Extract forge version like "47.4.0" from "1.20.1-forge-47.4.0" or "1.20.1-47.4.0"
        let forgeVersionMatch = forgeVersionId.match(/forge-(\d+\.\d+\.\d+)/);
        if (!forgeVersionMatch && loader.build) {
            // Try to extract from loader.build like "1.20.1-47.4.0" or just "47.4.0"
            const buildMatch = loader.build.match(/(\d+\.\d+\.\d+)$/);
            if (buildMatch) {
                forgeVersionMatch = buildMatch;
            }
        }
        const forgeVersion = forgeVersionMatch ? forgeVersionMatch[1] : "latest";
        console.log(`[${loaderType}] Extracted forge version: ${forgeVersion} from ID: ${forgeVersionId}, build: ${loader.build}`);

        // Extract MCP version from arguments or known patterns
        // Forge 1.20.1 uses MCP version 20230612.114412
        let mcpVersion = "20230612.114412"; // Default for 1.20.1
        const mcpArg = versionData.arguments?.game?.find((a: string) =>
            typeof a === "string" && a.includes("--fml.mcpVersion")
        );
        if (mcpArg) {
            const idx = versionData.arguments.game.indexOf(mcpArg);
            if (idx >= 0 && versionData.arguments.game[idx + 1]) {
                mcpVersion = versionData.arguments.game[idx + 1];
            }
        }

        // Check for processor-generated files directly by known paths
        // These files are NOT downloadable - they MUST be generated by Forge installer
        const processorFiles = [
            path.join(librariesDir, "net", "minecraft", "client", `${mcVersion}-${mcpVersion}`, `client-${mcVersion}-${mcpVersion}-srg.jar`),
            path.join(librariesDir, "net", "minecraft", "client", `${mcVersion}-${mcpVersion}`, `client-${mcVersion}-${mcpVersion}-extra.jar`),
            path.join(librariesDir, "net", "minecraftforge", "forge", `${mcVersion}-${forgeVersion}`, `forge-${mcVersion}-${forgeVersion}-client.jar`),
        ];

        const missingProcessorFiles = processorFiles.filter(f => !fs.existsSync(f));
        console.log(`[${loaderType}] Checking processor files:`, processorFiles.map(f => `${path.basename(f)}: ${fs.existsSync(f) ? 'EXISTS' : 'MISSING'}`));

        if (missingProcessorFiles.length > 0) {
            console.log(`[${loaderType}] Missing processor-generated files:`, missingProcessorFiles.map(f => path.basename(f)));
            console.log(`[${loaderType}] Running Forge installer with Java to generate them...`);

            // Create dummy launcher_profiles.json (required by Forge installer)
            const launcherProfilesPath = path.join(minecraftDir, "launcher_profiles.json");
            if (!fs.existsSync(launcherProfilesPath)) {
                const dummyProfile = {
                    profiles: {},
                    selectedProfile: "(Default)",
                    clientToken: "00000000-0000-0000-0000-000000000000",
                    authenticationDatabase: {},
                    launcherVersion: {
                        name: "RealityLauncher",
                        format: 21,
                        profilesFormat: 1
                    }
                };
                fs.writeFileSync(launcherProfilesPath, JSON.stringify(dummyProfile, null, 2));
                console.log(`[${loaderType}] Created dummy launcher_profiles.json`);
            }

            // Download installer JAR
            const installerUrl = loaderType === "neoforge"
                ? `https://maven.neoforged.net/releases/net/neoforged/neoforge/${forgeVersion}/neoforge-${forgeVersion}-installer.jar`
                : `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${forgeVersion}/forge-${mcVersion}-${forgeVersion}-installer.jar`;

            const installerPath = path.join(minecraftDir, "temp", `${loaderType}-installer-${mcVersion}-${forgeVersion}.jar`);
            fs.mkdirSync(path.dirname(installerPath), { recursive: true });

            if (!fs.existsSync(installerPath)) {
                console.log(`[${loaderType}] Downloading installer: ${installerUrl}`);
                await downloadFileAtomic(installerUrl, installerPath);
            }

            // Find Java path for running installer (use any available Java)
            let javaPath: string;
            try {
                javaPath = await getJavaPath(undefined, undefined, native, mcVersion);
            } catch {
                // Fallback to system Java
                javaPath = "java";
            }
            console.log(`[${loaderType}] Running installer with Java: ${javaPath}`);

            // Run Forge installer in headless mode
            try {
                const installCmd = `"${javaPath}" -jar "${installerPath}" --installClient "${minecraftDir}"`;
                console.log(`[${loaderType}] Install command: ${installCmd}`);
                execSync(installCmd, {
                    cwd: minecraftDir,
                    stdio: "pipe", // Hide console output
                    timeout: 600000, // 10 minutes timeout for slow machines
                    windowsHide: true, // Hide CMD window
                });
                console.log(`[${loaderType}] Installer completed successfully`);
            } catch (installErr: any) {
                console.error(`[${loaderType}] Installer failed:`, installErr.message);
                // Check if files were created despite error
                const stillMissing = processorFiles.filter(f => !fs.existsSync(f));
                if (stillMissing.length > 0) {
                    throw new Error(`Forge installer failed to generate required files: ${stillMissing.map(f => path.basename(f)).join(", ")}`);
                }
            }

            // Cleanup installer
            try { fs.unlinkSync(installerPath); } catch { }
        }

        return vjson;
    } /* Legacy TS Implementation:

        if (!forgeFullVersion || forgeFullVersion === "latest") {
            try {
                if (loaderType === "neoforge") {
                    // NeoForge: Fetch from maven-metadata.xml
                    const metadataUrl = "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml";
                    const xmlText = await fetch(metadataUrl).then(r => r.text());

                    // Parse XML roughly with Regex
                    const versionMatch = xmlText.match(/<version>(.*?)<\/version>/g);
                    if (versionMatch) {
                        const versions = versionMatch.map(v => v.replace(/<\/?version>/g, ""));
                        // Filter by MC version - NeoForge uses simplified version like 20.1.x for MC 1.20.1
                        const validVersions = versions.filter(v => {
                            if (mcVersion === "1.20.1") return v.startsWith("47.1") || v.startsWith("20.1");
                            if (mcVersion === "1.21") return v.startsWith("21.");
                            if (mcVersion === "1.21.1") return v.startsWith("21.1");
                            const shortVer = mcVersion.split(".").slice(1).join(".");
                            return v.startsWith(shortVer);
                        }).reverse(); // Newest first

                        forgeFullVersion = validVersions[0];
                        console.log(`[NeoForge] Found versions for ${mcVersion}:`, validVersions.slice(0, 5));
                    }

                    if (!forgeFullVersion) {
                        console.error(`[NeoForge] No matching version found for MC ${mcVersion}`);
                    }
                } else {
                    // Forge: promotions_slim.json
                    const forgeListUrl = `https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json`;
                    const forgeListRes = await fetch(forgeListUrl);
                    const forgeList = await forgeListRes.json();

                    const recommendedKey = `${mcVersion}-recommended`;
                    const latestKey = `${mcVersion}-latest`;
                    forgeFullVersion = forgeList.promos?.[recommendedKey] || forgeList.promos?.[latestKey];
                    if (forgeFullVersion) {
                        forgeFullVersion = `${mcVersion}-${forgeFullVersion}`;
                    }
                }
            } catch (e) {
                console.error(`[${loaderType}] Failed to fetch version list:`, e);
            }
        }

        if (!forgeFullVersion) {
            throw new Error(`ไม่พบ ${loaderType === "neoforge" ? "NeoForge" : "Forge"} สำหรับ Minecraft ${mcVersion}`);
        }

        console.log(`[${loaderType}] Using version: ${forgeFullVersion}`);

        // Check if Forge version JSON already exists
        const forgeVersionId = loaderType === "neoforge"
            ? `neoforge-${forgeFullVersion}`
            : `${mcVersion}-forge-${forgeFullVersion.replace(mcVersion + "-", "")}`;
        const forgeVersionJsonPath = path.join(minecraftDir, "versions", forgeVersionId, `${forgeVersionId}.json`);

        if (fs.existsSync(forgeVersionJsonPath)) {
            console.log(`[${loaderType}] Using existing version JSON: ${forgeVersionJsonPath}`);
            return fs.readFileSync(forgeVersionJsonPath, "utf-8");
        }

        // Download Forge/NeoForge installer
        const installerUrl = loaderType === "neoforge"
            ? `https://maven.neoforged.net/releases/net/neoforged/neoforge/${forgeFullVersion}/neoforge-${forgeFullVersion}-installer.jar`
            : `https://maven.minecraftforge.net/net/minecraftforge/forge/${forgeFullVersion}/forge-${forgeFullVersion}-installer.jar`;

        const installerPath = path.join(minecraftDir, "temp", `${loaderType}-installer-${forgeFullVersion}.jar`);
        fs.mkdirSync(path.dirname(installerPath), { recursive: true });

        console.log(`[${loaderType}] Downloading installer from: ${installerUrl}`);

        // Download installer using atomic downloader
        await downloadFileAtomic(installerUrl, installerPath);


        // Manual extraction (Forge installer requires GUI mode, can't run headless)
        console.log(`[${loaderType}] Extracting from installer JAR...`);


        const AdmZip = (await import("adm-zip")).default;
        const zip = new AdmZip(installerPath);

        const installProfileEntry = zip.getEntry("install_profile.json");
        const versionJsonEntry = zip.getEntry("version.json");

        if (!installProfileEntry && !versionJsonEntry) {
            throw new Error(`ไม่พบ install profile ใน ${loaderType} installer`);
        }

        let forgeVersionJson: any;
        if (versionJsonEntry) {
            forgeVersionJson = JSON.parse(versionJsonEntry.getData().toString("utf-8"));
        } else if (installProfileEntry) {
            const installProfile = JSON.parse(installProfileEntry.getData().toString("utf-8"));
            forgeVersionJson = installProfile.versionInfo;
        }

        if (!forgeVersionJson) {
            throw new Error(`ไม่สามารถอ่าน version info จาก ${loaderType} installer`);
        }

        // Extract libraries from installer (maven/)
        const libEntries = zip.getEntries().filter(e =>
            e.entryName.startsWith("maven/") && !e.isDirectory
        );

        for (const libEntry of libEntries) {
            const targetPath = path.join(librariesDir, libEntry.entryName.replace("maven/", ""));
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            if (!fs.existsSync(targetPath)) {
                fs.writeFileSync(targetPath, libEntry.getData());
            }
        }


        // Fix for Modern Forge (1.17+): Extract data/ libraries
        // The installer contains files in data/ that need to be placed in libraries/
        // We parse install_profile.json to understand the mapping

        let installProfile: any = null;
        if (installProfileEntry) {
            installProfile = JSON.parse(installProfileEntry.getData().toString("utf-8"));
        }

        // Extract ALL data/*.jar files - we'll figure out mapping dynamically
        const dataJarEntries = zip.getEntries().filter(e =>
            e.entryName.startsWith("data/") && e.entryName.endsWith(".jar") && !e.isDirectory
        );

        console.log(`[${loaderType}] Found ${dataJarEntries.length} data JAR entries`);

        // The install_profile.json has a "data" section that maps keys to file references
        // e.g. "MAPPINGS": { "client": "[de.oceanlabs.mcp:mcp_config:1.20.1-20230612.114412@zip]" }
        // We need to extract these files to the correct library paths

        if (installProfile && installProfile.data) {
            console.log(`[${loaderType}] Processing install_profile.data keys:`, Object.keys(installProfile.data));

            for (const key of Object.keys(installProfile.data)) {
                const dataItem = installProfile.data[key];
                let clientValue = dataItem.client;

                if (!clientValue) continue;

                // If it's a reference like [xxx:yyy:zzz@ext], it's a Maven artifact
                // If it's a path like /data/client.jar, it's a local file in the installer
                if (clientValue.startsWith("/")) {
                    // Local file reference - strip leading /
                    const zipPath = clientValue.substring(1); // e.g., "data/client.jar"
                    const entry = zip.getEntry(zipPath);

                    if (entry) {
                        // For local files like /data/client.jar, we need to find which library needs it
                        // by checking version.json libraries that don't have downloads

                        // Common patterns:
                        // PATCHED -> net.minecraft:client:xxx:xxx-srg
                        // CLIENT_EXTRA -> net.minecraft:client:xxx-extra
                        // etc.

                        // For now, let's extract to a temp location and let Forge handle it
                        // OR, better: parse the forgeVersionJson.libraries to find matching entries

                        const libs = forgeVersionJson.libraries || [];
                        for (const lib of libs) {
                            // Check if this library has no download URL (meaning it should be provided by installer)
                            const hasDownload = lib.downloads?.artifact?.url || lib.url;
                            if (hasDownload) continue;

                            // Parse Maven coordinates: group:artifact:version[:classifier]
                            const parts = lib.name.split(":");
                            if (parts.length < 3) continue;

                            const group = parts[0].replace(/\./g, "/");
                            const artifact = parts[1];
                            const version = parts[2];
                            const classifier = parts[3] ? `-${parts[3]}` : "";

                            // Check if this key matches the library's classifier
                            // Common mappings:
                            // PATCHED -> srg (or just "client")
                            // CLIENT_EXTRA -> extra
                            const lowerKey = key.toLowerCase();
                            const lowerClassifier = classifier.toLowerCase();

                            let isMatch = false;
                            if (lowerKey === "patched" && (lowerClassifier.includes("srg") || artifact === "client")) isMatch = true;
                            if (lowerKey === "client_extra" && lowerClassifier.includes("extra")) isMatch = true;
                            if (lowerKey === "slim" && lowerClassifier.includes("slim")) isMatch = true;
                            if (lowerKey.includes(artifact.toLowerCase())) isMatch = true;

                            if (isMatch || (!hasDownload && lib.name.includes("client"))) {
                                const destPath = path.join(librariesDir, group, artifact, version, `${artifact}-${version}${classifier}.jar`);

                                if (!fs.existsSync(destPath)) {
                                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                                    fs.writeFileSync(destPath, entry.getData());
                                    console.log(`[${loaderType}] Extracted ${key} -> ${destPath}`);
                                }
                            }
                        }
                    }
                }
            }
        }

        // FALLBACK: Extract all data/*.jar entries that look like they should be libraries
        // This catches edge cases where the install_profile mapping is incomplete
        for (const entry of dataJarEntries) {
            const fileName = path.basename(entry.entryName);

            // Try to find a library in version.json that needs this file
            const libs = forgeVersionJson.libraries || [];
            for (const lib of libs) {
                const hasDownload = lib.downloads?.artifact?.url || lib.url;
                if (hasDownload) continue;

                // Check if library name matches file name pattern
                const parts = lib.name.split(":");
                if (parts.length < 3) continue;

                const artifact = parts[1];

                // If the data file contains the artifact name, it might be a match
                if (fileName.toLowerCase().includes(artifact.toLowerCase()) ||
                    (artifact === "client" && fileName === "client.jar")) {

                    const group = parts[0].replace(/\./g, "/");
                    const version = parts[2];
                    const classifier = parts[3] ? `-${parts[3]}` : "";
                    const destPath = path.join(librariesDir, group, artifact, version, `${artifact}-${version}${classifier}.jar`);

                    if (!fs.existsSync(destPath)) {
                        fs.mkdirSync(path.dirname(destPath), { recursive: true });
                        fs.writeFileSync(destPath, entry.getData());
                        console.log(`[${loaderType}] Fallback extracted ${entry.entryName} -> ${destPath}`);
                    }
                }
            }
        }

        // Save version JSON
        fs.mkdirSync(path.dirname(forgeVersionJsonPath), { recursive: true });
        fs.writeFileSync(forgeVersionJsonPath, JSON.stringify(forgeVersionJson, null, 2));

        // Cleanup installer
        try { fs.unlinkSync(installerPath); } catch { }

    */

    if (loaderType === "quilt") {
        // Use native Rust Quilt installer
        console.log(`[Quilt] Using native Rust installer...`);
        const minecraftDir = getMinecraftDir();

        try {
            const loaderVersion = loader.build === "latest" ? undefined : loader.build;
            const result = await native.installQuilt(mcVersion, loaderVersion, minecraftDir);

            console.log(`[Quilt] Installed: ${result.versionId}`);

            // Read the generated version JSON
            const quiltVersionJson = fs.readFileSync(result.versionJsonPath, "utf-8");
            const quiltProfile = JSON.parse(quiltVersionJson);

            // Merge with vanilla
            const vanilla = JSON.parse(versionJson);
            return JSON.stringify({
                ...vanilla,
                mainClass: quiltProfile.mainClass,
                libraries: [...quiltProfile.libraries, ...vanilla.libraries],
            });
        } catch (e: any) {
            console.error(`[Quilt] Native install failed:`, e);
            throw new Error(`Quilt install failed: ${e.message}`);
        }
    }

    // Fallback: Vanilla
    console.warn(`[Loader] Unknown loader type: ${loaderType}, falling back to vanilla`);
    return versionJson;
}

/**
 * Get optimized JVM arguments
 */
function getOptimizedJvmArgs(): string[] {
    const cpuCores = os.cpus().length;
    const gcThreads = Math.max(2, Math.min(Math.floor(cpuCores / 2), 8));

    return [
        "-XX:+UseG1GC",
        "-XX:+ParallelRefProcEnabled",
        "-XX:MaxGCPauseMillis=50",
        "-XX:+UnlockExperimentalVMOptions",
        "-XX:+DisableExplicitGC",
        "-XX:G1NewSizePercent=30",
        "-XX:G1MaxNewSizePercent=40",
        "-XX:G1HeapRegionSize=16M",
        "-XX:G1ReservePercent=20",
        "-XX:InitiatingHeapOccupancyPercent=15",
        "-XX:+AlwaysPreTouch",
        `-XX:ParallelGCThreads=${gcThreads}`,
        "-Dfile.encoding=UTF-8",
        // Force English locale to prevent log parsing issues with Buddhist year (2569)
        "-Duser.language=en",
        "-Duser.country=US",
    ];
}

export { launchGameRust as launchGame };
