/**
 * ========================================
 * Instance Management IPC Handlers
 * ========================================
 * 
 * Handles all instance-related IPC:
 * - CRUD operations for instances
 * - Instance content (mods, resourcepacks, shaders, datapacks)
 * - Instance launching
 * - Log reading
 */

import { ipcMain, shell, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { net } from "electron";
import AdmZip from "adm-zip";
import {
    getInstances,
    getInstance,
    createInstance,
    updateInstance,
    deleteInstance,
    duplicateInstance,
    getInstanceDir,
    setInstanceIcon,
    type GameInstance,
    type CreateInstanceOptions,
    type UpdateInstanceOptions,
} from "../instances.js";
import { getConfig } from "../config.js";
import { getSession } from "../auth.js";
import {
    launchGame,
    isGameRunning,
    setProgressCallback,
    setGameLogCallback,
} from "../launcher.js";

// Cache for mod metadata
interface ModMetadataCache {
    displayName?: string;
    author?: string;
    description?: string;
    icon?: string;
    modrinthIcon?: string;
    hash?: string;
    modrinthId?: string; // "found" | "checked"
    id?: string; // The internal Mod ID (slug)
}
const modMetadataCache = new Map<string, ModMetadataCache>();
// Cache for project ID -> icon URL to avoid re-fetching project info
const modrinthProjectCache = new Map<string, string>();

function getModCacheKey(filepath: string, size: number, mtime: string): string {
    return `${filepath}|${size}|${mtime}`;
}

async function calculateSha1(filePath: string): Promise<string> {
    // console.log(`[Hash] Hashing ${path.basename(filePath)}`);
    return new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath);
        const hash = crypto.createHash("sha1");
        stream.on("error", (err) => reject(err));
        stream.pipe(hash).on("finish", () => {
            resolve(hash.digest("hex"));
        });
    });
}



// Extract mod info from JAR file
async function extractModInfo(jarPath: string): Promise<ModMetadataCache> {
    try {
        const buffer = await fs.promises.readFile(jarPath);
        const zip = new AdmZip(buffer);

        // Try Fabric mod
        const fabricEntry = zip.getEntry("fabric.mod.json");
        if (fabricEntry) {
            const content = fabricEntry.getData().toString("utf8");
            const json = JSON.parse(content);

            let icon: string | undefined;
            if (json.icon) {
                const iconEntry = zip.getEntry(json.icon);
                if (iconEntry) {
                    const iconData = iconEntry.getData();
                    const mimeType = json.icon.endsWith(".png") ? "image/png" : "image/jpeg";
                    icon = `data:${mimeType};base64,${iconData.toString("base64")}`;
                } else {
                    // console.log(`[ModInfo] Icon not found in zip: ${json.icon} for ${jarPath}`);
                }
            } else {
                // console.log(`[ModInfo] No icon defined in fabric.mod.json for ${jarPath}`);
            }

            return {
                id: json.id,
                displayName: json.name || json.id,
                author: Array.isArray(json.authors)
                    ? json.authors.map((a: any) => typeof a === "string" ? a : a.name).join(", ")
                    : json.authors,
                description: json.description,
                icon,
            };
        }

        // Try Forge mod
        const forgeEntry = zip.getEntry("META-INF/mods.toml");
        if (forgeEntry) {
            const content = forgeEntry.getData().toString("utf8");
            const modIdMatch = content.match(/modId\s*=\s*"([^"]+)"/);
            const displayNameMatch = content.match(/displayName\s*=\s*"([^"]+)"/);
            const authorsMatch = content.match(/authors\s*=\s*"([^"]+)"/);
            const descMatch = content.match(/description\s*=\s*'''([^']+)'''/s) || content.match(/description\s*=\s*"([^"]+)"/);
            const logoMatch = content.match(/logoFile\s*=\s*"([^"]+)"/);

            let icon: string | undefined;
            if (logoMatch) {
                const logoPath = logoMatch[1];
                const iconEntry = zip.getEntry(logoPath);
                if (iconEntry) {
                    icon = `data:image/png;base64,${iconEntry.getData().toString("base64")}`;
                } else {
                    // console.log(`[ModInfo] Forge logo not found: ${logoPath} in ${jarPath}`);
                }
            }

            return {
                id: modIdMatch?.[1],
                displayName: displayNameMatch?.[1] || modIdMatch?.[1],
                author: authorsMatch?.[1],
                description: descMatch?.[1]?.trim(),
                icon,
            };
        }

        return {};
    } catch (e) {
        console.error(`[ModInfo] Failed to extract info from ${jarPath}:`, e);
        return {};
    }
}

// ========================================
// Modrinth API Helper
// ========================================
const ModrinthAPI = {
    async resolveHashes(hashes: string[]): Promise<Record<string, string>> {
        if (hashes.length === 0) return {};

        const results: Record<string, string> = {};
        const chunks = [];

        // Chunk hashes to avoid body size limits (e.g. 50 at a time)
        for (let i = 0; i < hashes.length; i += 50) {
            chunks.push(hashes.slice(i, i + 50));
        }

        for (const chunk of chunks) {
            try {
                // 1. Resolve hashes to Modrinth Versions
                const resp = await fetch("https://api.modrinth.com/v2/version_files", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "User-Agent": "RealityLauncher/0.0.1 (help@reality.notpumpkins.com)"
                    },
                    body: JSON.stringify({ hashes: chunk, algorithm: "sha1" })
                });

                if (!resp.ok) continue;

                const versions = await resp.json() as Record<string, any>;
                const projectIdsToFetch = new Set<string>();
                const hashToProjectId: Record<string, string> = {};

                for (const [hash, version] of Object.entries(versions)) {
                    if (version.project_id) {
                        hashToProjectId[hash] = version.project_id;
                        // check memory cache first
                        if (!modrinthProjectCache.has(version.project_id)) {
                            projectIdsToFetch.add(version.project_id);
                        } else {
                            results[hash] = modrinthProjectCache.get(version.project_id)!;
                        }
                    }
                }

                // 2. Fetch Project Info for unknown IDs
                const ids = Array.from(projectIdsToFetch);
                if (ids.length > 0) {
                    const projectResp = await fetch(`https://api.modrinth.com/v2/projects?ids=${JSON.stringify(ids)}`, {
                        headers: { "User-Agent": "RealityLauncher/0.0.1" }
                    });

                    if (projectResp.ok) {
                        const projects = await projectResp.json() as any[];
                        for (const proj of projects) {
                            if (proj.icon_url) {
                                modrinthProjectCache.set(proj.id, proj.icon_url);
                            }
                        }
                    }
                }

                // 3. Assemble results
                for (const [hash, pid] of Object.entries(hashToProjectId)) {
                    if (modrinthProjectCache.has(pid)) {
                        results[hash] = modrinthProjectCache.get(pid)!;
                    }
                }

            } catch (err) {
                console.error("[Modrinth] Failed to resolve batch:", err);
            }
        }
        return results;
    },

    async resolveSlugs(slugs: string[]): Promise<Record<string, string>> {
        if (slugs.length === 0) return {};
        const results: Record<string, string> = {};

        // Chunk slugs (50 at a time)
        const chunks = [];
        for (let i = 0; i < slugs.length; i += 50) {
            chunks.push(slugs.slice(i, i + 50));
        }

        for (const chunk of chunks) {
            try {
                // Check cache first
                const toFetch = chunk.filter(id => !modrinthProjectCache.has(id));
                chunk.forEach(id => {
                    if (modrinthProjectCache.has(id)) results[id] = modrinthProjectCache.get(id)!;
                });

                if (toFetch.length === 0) continue;

                const resp = await fetch(`https://api.modrinth.com/v2/projects?ids=${JSON.stringify(toFetch)}`, {
                    headers: { "User-Agent": "RealityLauncher/0.0.1" }
                });

                if (resp.ok) {
                    const projects = await resp.json() as any[];
                    for (const proj of projects) {
                        if (proj.icon_url) {
                            modrinthProjectCache.set(proj.id, proj.icon_url); // ID
                            modrinthProjectCache.set(proj.slug, proj.icon_url); // Slug
                            results[proj.slug] = proj.icon_url;
                            results[proj.id] = proj.icon_url;
                        }
                    }
                }
            } catch (e) {
                console.error("[Modrinth] Failed to resolve slugs:", e);
            }
        }
        return results;
    }
};

// Helper to ensure metadata is loaded (Local -> Hash -> Slug)
// Moved inside registerInstanceHandlers to access getMainWindow
export function registerInstanceHandlers(getMainWindow: () => BrowserWindow | null): void {

    // Track active operations (Launch / Install) for cancellation
    const activeOperations = new Map<string, AbortController>();

    async function ensureModMetadata(filePath: string, instanceId?: string): Promise<ModMetadataCache> {
        const stats = await fs.promises.stat(filePath);
        const cacheKey = getModCacheKey(filePath, stats.size, stats.mtime.toISOString());
        let metadata = modMetadataCache.get(cacheKey);

        // 1. Check if complete
        if (metadata && (metadata.icon || metadata.modrinthId)) {
            return metadata;
        }

        // 2. Local Extraction
        if (!metadata) {
            metadata = await extractModInfo(filePath);
            modMetadataCache.set(cacheKey, metadata);
        }

        // 3. Modrinth Lookup (if no icon)
        if (!metadata.icon && metadata.modrinthId !== "checked") {
            try {
                // Calculate Hash
                const hash = metadata.hash || await calculateSha1(filePath);
                metadata.hash = hash;
                modMetadataCache.set(cacheKey, metadata);

                // Hash Lookup
                const modrinthIcons = await ModrinthAPI.resolveHashes([hash]);
                if (modrinthIcons[hash]) {
                    metadata.modrinthIcon = modrinthIcons[hash];
                    metadata.icon = modrinthIcons[hash];
                    metadata.modrinthId = "found";
                    modMetadataCache.set(cacheKey, metadata);
                    if (instanceId) getMainWindow()?.webContents.send("instance-mods-icons-updated", instanceId);
                    return metadata;
                }

                // Slug Lookup (Fallback)
                if (metadata.id) {
                    const slugIcons = await ModrinthAPI.resolveSlugs([metadata.id]);
                    if (slugIcons[metadata.id]) {
                        metadata.modrinthIcon = slugIcons[metadata.id];
                        metadata.icon = slugIcons[metadata.id];
                        metadata.modrinthId = "found";
                        modMetadataCache.set(cacheKey, metadata);
                        if (instanceId) getMainWindow()?.webContents.send("instance-mods-icons-updated", instanceId);
                        return metadata;
                    }
                }

                // Mark checked
                metadata.modrinthId = "checked";
                modMetadataCache.set(cacheKey, metadata);
            } catch (e) {
                console.error(`[Mods] Failed ensureModMetadata for ${filePath}:`, e);
            }
        }

        return metadata;
    }
    // ----------------------------------------
    // Instance CRUD
    // ----------------------------------------

    ipcMain.handle("instances-list", async (_event, offset?: number, limit?: number): Promise<GameInstance[]> => {
        return await getInstances(offset, limit);
    });

    ipcMain.handle("instances-create", async (_event, options: CreateInstanceOptions): Promise<GameInstance> => {
        return await createInstance(options);
    });

    ipcMain.handle("instances-get", async (_event, id: string): Promise<GameInstance | null> => {
        return getInstance(id);
    });

    ipcMain.handle("instances-update", async (_event, id: string, updates: UpdateInstanceOptions): Promise<GameInstance | null> => {
        const instance = getInstance(id);
        if (!instance) {
            console.warn(`[IPC] instances-update: Instance not found (ID: ${id})`);
            return null;
        }
        return await updateInstance(id, updates);
    });

    ipcMain.handle("instances-delete", async (_event, id: string): Promise<boolean> => {
        return await deleteInstance(id);
    });

    ipcMain.handle("instances-set-icon", async (_event, id: string, iconData: string) => {
        return await setInstanceIcon(id, iconData);
    });

    ipcMain.handle("instances-duplicate", async (_event, id: string): Promise<GameInstance | null> => {
        return duplicateInstance(id);
    });

    ipcMain.handle("instances-open-folder", async (_event, id: string): Promise<void> => {
        const dir = getInstanceDir(id);
        await shell.openPath(dir);
    });

    // ----------------------------------------
    // Instance Launch
    // ----------------------------------------

    ipcMain.handle("instance-cancel-action", async (_event, instanceId: string) => {
        if (activeOperations.has(instanceId)) {
            console.log(`[IPC] Cancelling operation for ${instanceId}`);
            activeOperations.get(instanceId)?.abort();
            return { ok: true };
        }
        return { ok: false, error: "No active operation found" };
    });

    ipcMain.handle("instances-launch", async (_event, id: string) => {
        const mainWindow = getMainWindow();
        const instance = getInstance(id);
        if (!instance) {
            console.warn(`[IPC] instances-launch: Instance not found (ID: ${id})`);
            return { ok: false, message: "Instance ไม่พบ" };
        }

        const session = getSession();
        if (!session) return { ok: false, message: "กรุณา login ก่อน" };

        if (isGameRunning(id)) return { ok: false, message: "Instance นี้กำลังทำงานอยู่" };

        const config = getConfig();
        const ramMB = instance.ramMB || config.ramMB || 4096;
        const startTime = Date.now();

        // ----------------------------------------
        // Auto-Sync Server Mods
        // ----------------------------------------
        if (instance.cloudId && instance.autoUpdate !== false) {
            const session = getSession();
            // If user is offline/not logged in, we skip sync (or should we fail? Prefer skip for offline play)
            if (session && session.apiToken) {
                try {
                    const { syncServerMods } = await import("../cloud-instances.js");

                    // Create cancel controller
                    const controller = new AbortController();
                    activeOperations.set(id, controller);

                    // Initial Status
                    mainWindow?.webContents.send("launch-progress", { type: "sync-start", task: "กำลังตรวจสอบอัปเดต..." });

                    try {
                        await syncServerMods(id, session.apiToken, (progress) => {
                            mainWindow?.webContents.send("launch-progress", progress);
                        }, controller.signal);
                    } finally {
                        activeOperations.delete(id);
                    }

                    // Reload instance data after sync (in case loader/version changed)
                    const updatedInstance = getInstance(id);
                    if (updatedInstance) {
                        console.log(`[Launch] Reloading instance data after sync for ${updatedInstance.name}`);
                        // Update local variables for launch options
                        instance.loader = updatedInstance.loader;
                        instance.loaderVersion = updatedInstance.loaderVersion;
                        instance.minecraftVersion = updatedInstance.minecraftVersion;
                        instance.javaPath = updatedInstance.javaPath;
                        instance.javaArguments = updatedInstance.javaArguments;

                        // Note: We don't replace the whole 'instance' const because it's used elsewhere,
                        // but we updated the specific fields needed for launchOptions below.
                        // Ideally we should have re-fetched getInstance(id) assign to a new variable, 
                        // but 'instance' is const.
                        // Let's rely on getInstance(id) returning the reference from the array?
                        // Yes, getInstance returns reference from local cache array which loadInstances/updateInstance updates.
                        // Wait, updateInstance updates the object in array.
                        // importCloudInstance checks findIndex and updates.
                        // So the object reference 'instance' might be STALE if array was mutated nicely?
                        // instances.ts: instances[index] = { ...instances[index], ...updates }; 
                        // This REPLACES the object in the array with a new object. 
                        // So our 'const instance' holding the OLD object reference is definitely STALE.
                    }

                    // Notify frontend that instance data has changed (loader, version, etc.)
                    mainWindow?.webContents.send("instances-updated");

                } catch (error: any) {
                    if (error.message === "Cancelled") {
                        mainWindow?.webContents.send("launch-progress", { type: "sync-error", task: "ยกเลิกการเข้าเล่นแล้ว" });
                        return { ok: false, message: "Game launch cancelled" };
                    }
                    console.error("[Launch] Auto-sync failed:", error);
                    // Decide strategy: Fail or Warn?
                    // For now, let's log and continue (Offline mode support)
                    // Optionally notify frontend of warning?
                    mainWindow?.webContents.send("launch-progress", { type: "sync-warning", task: "ไม่สามารถอัปเดตได้ (เล่นแบบ Offline)" });
                    await new Promise(r => setTimeout(r, 1000)); // Show warning briefly
                }
            }
        }

        // Auto-fix Forge version REMOVED: This was causing double-prefixing (e.g. 1.20.1-1.20.1-47.x)
        // if (instance.loader === "forge" && instance.loaderVersion && !instance.loaderVersion.startsWith(instance.minecraftVersion)) {
        //     const fixed = `${instance.minecraftVersion}-${instance.loaderVersion}`;
        //     instance.loaderVersion = fixed;
        //     updateInstance(id, { loaderVersion: fixed });
        // }

        updateInstance(id, { lastPlayedAt: new Date().toISOString() });

        setProgressCallback((progress) => {
            mainWindow?.webContents.send("launch-progress", progress);
        });

        setGameLogCallback((level, message) => {
            mainWindow?.webContents.send("game-log", { level, message });
        });

        // Use minecraftUuid if available (for CatID linked with Microsoft)
        const gameUuid = session.minecraftUuid || session.uuid;

        // Pass instanceId to launchGame (options cast to any in launcher.ts allows this)
        console.log(`[Launch] Preparing to launch instance: ${instance.name} (${id})`);
        console.log(`[Launch] Type: ${instance.cloudId ? "Cloud/Server" : "Local"}`);
        console.log(`[Launch] Loader: ${instance.loader} Version: ${instance.loaderVersion}`);
        console.log(`[Launch] Mods Sync: ${instance.cloudId && instance.autoUpdate !== false ? "Enabled" : "Disabled"}`);

        // Validate loaderVersion for Forge/NeoForge
        // Valid formats: "47.4.0", "1.20.1-47.4.0" 
        // Invalid: "1.20.1" (minecraft version only)
        let loaderBuild = instance.loaderVersion || "latest";
        if ((instance.loader === "forge" || instance.loader === "neoforge") && loaderBuild !== "latest") {
            // If loaderVersion is EXACTLY the minecraft version (no forge version appended), it's wrong
            // Valid: "47.4.0" or "1.20.1-47.4.0"
            // Invalid: "1.20.1" (same as MC version)
            if (loaderBuild === instance.minecraftVersion) {
                console.warn(`[Launch] Invalid loaderVersion "${loaderBuild}" for ${instance.loader}, using "latest"`);
                loaderBuild = "latest";
            }
        }

        const launchOptions = {
            version: instance.minecraftVersion,
            username: session.username,
            uuid: gameUuid,
            accessToken: session.accessToken,
            ramMB,
            javaPath: instance.javaPath || config.javaPath,
            gameDirectory: instance.gameDirectory,
            loader: instance.loader !== "vanilla" ? {
                type: instance.loader,
                build: loaderBuild,
                enable: true,
            } : undefined,
            instanceId: id, // Pass ID for tracking
        };

        console.log(`[Launch] Launch Options:`, JSON.stringify(launchOptions, null, 2));

        const result = await launchGame(launchOptions as any);

        setProgressCallback(null);

        if (result.ok) {
            // Notify renderer that game has started (also sent from rustLauncher)
            mainWindow?.webContents.send("game-started", { instanceId: id });

            // Track play time when game stops
            const startTime2 = Date.now();

            // Listen for game-stopped to update play time
            const updatePlayTime = () => {
                const mins = Math.round((Date.now() - startTime2) / 60000);
                if (mins > 0) {
                    const curr = getInstance(id);
                    if (curr) updateInstance(id, { totalPlayTime: curr.totalPlayTime + mins });
                }
            };

            // The game-stopped event is now sent from rustLauncher.ts via ipcMain.emit
            // We just need to track play time here
            const handler = (_e: any, data: { instanceId: string }) => {
                if (data && data.instanceId === id) {
                    updatePlayTime();
                    ipcMain.removeListener("game-stopped", handler);
                }
            };

            ipcMain.on("game-stopped", handler);
        }

        return result;
    });

    ipcMain.handle("instance-join", async (_event, key: string) => {
        const { joinInstanceByKey } = await import("../cloud-instances.js");
        const { importCloudInstance } = await import("../instances.js");
        const { getApiToken } = await import("../auth.js");
        const session = getSession();

        if (!session) {
            return { ok: false, error: "กรุณา login ก่อน" };
        }

        const apiToken = getApiToken();
        if (!apiToken) {
            return { ok: false, error: "ไม่มี API token - กรุณา login ใหม่" };
        }

        const result = await joinInstanceByKey(key, apiToken);
        if (result.ok && result.instance) {
            // Create/Update local instance from cloud data
            await importCloudInstance(result.instance);
            getMainWindow()?.webContents.send("instances-updated");
        }
        return result;
    });

    // ----------------------------------------
    // Mods Management
    // ----------------------------------------

    ipcMain.handle("instance-list-mods", async (_event, instanceId: string) => {
        const instance = getInstance(instanceId);
        if (!instance) {
            console.warn(`[IPC] instance-list-mods: Instance not found (ID: ${instanceId})`);
            return { ok: false, error: "Instance not found", mods: [] };
        }

        const modsDir = path.join(instance.gameDirectory, "mods");
        if (!fs.existsSync(modsDir)) return { ok: true, mods: [] };

        try {
            const files = await fs.promises.readdir(modsDir);
            const jarFiles = files.filter(f => f.endsWith(".jar") || f.endsWith(".jar.disabled"));
            const uncached: string[] = [];

            const mods = await Promise.all(jarFiles.map(async (file) => {
                const filePath = path.join(modsDir, file);
                try {
                    const stats = await fs.promises.stat(filePath);
                    const mtime = stats.mtime.toISOString();

                    let name = file;
                    let enabled = true;
                    if (file.endsWith(".jar.disabled")) {
                        name = file.replace(".jar.disabled", "");
                        enabled = false;
                    } else if (file.endsWith(".jar")) {
                        name = file.replace(".jar", "");
                    }

                    const cacheKey = getModCacheKey(filePath, stats.size, mtime);
                    const metadata = modMetadataCache.get(cacheKey);

                    // Add to processing queue if:
                    // 1. No metadata exists
                    // 2. Metadata exists but no icon AND we haven't checked Modrinth yet (modrinthId marker)
                    if (!metadata || (!metadata.icon && !metadata.modrinthId)) {
                        uncached.push(file);
                    }

                    return {
                        filename: file,
                        name,
                        displayName: metadata?.displayName || name,
                        author: metadata?.author || "",
                        description: metadata?.description || "",
                        icon: metadata?.icon || null,
                        enabled,
                        size: stats.size,
                        modifiedAt: mtime,
                    };
                } catch (e) {
                    return null;
                }
            }));

            // Filter out failed stats
            const validMods = mods.filter(m => m !== null) as any[];

            // logical sort
            validMods.sort((a, b) => a.displayName.localeCompare(b.displayName));
            return { ok: true, mods: validMods, hasUncached: uncached.length > 0 };
        } catch (error: any) {
            return { ok: false, error: error.message, mods: [] };
        }
    });

    ipcMain.handle("instance-get-mod-metadata", async (_event, instanceId: string, filename: string) => {
        const instance = getInstance(instanceId);
        if (!instance) return { ok: false, error: "Instance not found" };

        const filePath = path.join(instance.gameDirectory, "mods", filename);
        if (!fs.existsSync(filePath)) return { ok: false, error: "Mod not found" };

        try {
            const metadata = await ensureModMetadata(filePath, instanceId);
            return { ok: true, metadata };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    ipcMain.handle("instance-toggle-mod", async (_event, instanceId: string, filename: string) => {
        const instance = getInstance(instanceId);
        if (!instance) {
            console.warn(`[IPC] instance-toggle-mod: Instance not found (ID: ${instanceId})`);
            return { ok: false, error: "Instance not found" };
        }

        const modsDir = path.join(instance.gameDirectory, "mods");
        const filePath = path.join(modsDir, filename);

        if (!fs.existsSync(filePath)) return { ok: false, error: "Mod not found" };

        try {
            let newFilename: string;
            let enabled: boolean;

            if (filename.endsWith(".jar.disabled")) {
                newFilename = filename.replace(".jar.disabled", ".jar");
                enabled = true;
            } else if (filename.endsWith(".jar")) {
                newFilename = filename + ".disabled";
                enabled = false;
            } else {
                return { ok: false, error: "Invalid mod file" };
            }

            fs.renameSync(filePath, path.join(modsDir, newFilename));
            return { ok: true, newFilename, enabled };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    ipcMain.handle("instance-delete-mod", async (_event, instanceId: string, filename: string) => {
        const instance = getInstance(instanceId);
        if (!instance) return { ok: false, error: "Instance not found" };

        // Check if locked
        if (instance.lockedMods?.includes(filename)) {
            return { ok: false, error: "Mod is locked (Cannot delete)" };
        }

        const filePath = path.join(instance.gameDirectory, "mods", filename);
        if (!fs.existsSync(filePath)) return { ok: false, error: "Mod not found" };

        try {
            fs.rmSync(filePath, { force: true });
            return { ok: true };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    ipcMain.handle("instance-toggle-lock", async (_event, instanceId: string, filename: string) => {
        const instance = getInstance(instanceId);
        if (!instance) {
            console.warn(`[IPC] instance-toggle-lock: Instance not found (ID: ${instanceId})`);
            return { ok: false, error: "Instance not found" };
        }

        const locked = instance.lockedMods || [];
        const isLocked = locked.includes(filename);

        let newLocked: string[];
        if (isLocked) {
            newLocked = locked.filter(f => f !== filename);
        } else {
            newLocked = [...locked, filename];
        }

        updateInstance(instanceId, { lockedMods: newLocked });
        return { ok: true, locked: !isLocked, lockedMods: newLocked };
    });

    ipcMain.handle("instance-check-integrity", async (_event, instanceId: string) => {
        const instance = getInstance(instanceId);
        if (!instance) return { ok: false, error: "Instance not found" };

        if (!instance.cloudId) {
            return { ok: true, message: "Local instance integrity check skipped" };
        }

        try {
            const { syncServerMods } = await import("../cloud-instances.js");
            const session = getSession();
            await syncServerMods(instanceId, session?.apiToken || "");

            // Notify frontend that instance data might have changed (loader, version)
            const wins = BrowserWindow.getAllWindows();
            if (wins.length > 0) {
                wins[0].webContents.send("instances-updated");
            }

            return { ok: true, message: "Sync complete" };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    // ----------------------------------------
    // Resource Packs
    // ----------------------------------------

    ipcMain.handle("instance-list-resourcepacks", async (_event, instanceId: string) => {
        const instance = getInstance(instanceId);
        if (!instance) return { ok: false, error: "Instance not found" };

        const dir = path.join(instance.gameDirectory, "resourcepacks");
        if (!fs.existsSync(dir)) return { ok: true, items: [] };

        try {
            const files = await fs.promises.readdir(dir);
            const items = await Promise.all(files.map(async (file) => {
                const filePath = path.join(dir, file);
                try {
                    const stats = await fs.promises.stat(filePath);
                    const isDirectory = stats.isDirectory();

                    if (!file.endsWith(".zip") && !file.endsWith(".zip.disabled") && !isDirectory) {
                        return null;
                    }

                    let enabled = true;
                    let displayName = file;

                    if (file.endsWith(".zip.disabled")) {
                        enabled = false;
                        displayName = file.replace(".zip.disabled", "");
                    } else if (file.endsWith(".zip")) {
                        displayName = file.replace(".zip", "");
                    }

                    // For now, let's not extract icons here if it's slow.
                    // But if we want to keep it, we should do it cautiously.
                    let icon: string | null = null;
                    if (file.endsWith(".zip") || file.endsWith(".zip.disabled") || isDirectory) {
                        // Minimal try-catch to not block the whole list
                        try {
                            if (!isDirectory) {
                                // Extract zip icon only if it's small or we have a cache?
                                // For scale, icons are mandatory for "premium" feel.
                                const zip = new AdmZip(filePath);
                                const packPng = zip.getEntry("pack.png");
                                if (packPng) icon = `data:image/png;base64,${packPng.getData().toString("base64")}`;
                            } else {
                                const packPngPath = path.join(filePath, "pack.png");
                                if (fs.existsSync(packPngPath)) {
                                    icon = `data:image/png;base64,${fs.readFileSync(packPngPath).toString("base64")}`;
                                }
                            }
                        } catch { }
                    }

                    return {
                        filename: file,
                        name: displayName,
                        isDirectory,
                        size: stats.size,
                        modifiedAt: stats.mtime.toISOString(),
                        enabled,
                        icon
                    };
                } catch {
                    return null;
                }
            }));

            return { ok: true, items: items.filter(i => i !== null) };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    ipcMain.handle("instance-toggle-resourcepack", async (_event, instanceId: string, filename: string) => {
        const instance = getInstance(instanceId);
        if (!instance) return { ok: false, error: "Instance not found" };

        const dir = path.join(instance.gameDirectory, "resourcepacks");
        const filePath = path.join(dir, filename);

        if (!fs.existsSync(filePath)) return { ok: false, error: "Not found" };

        try {
            let newFilename: string;
            let enabled: boolean;

            if (filename.endsWith(".zip.disabled")) {
                newFilename = filename.replace(".zip.disabled", ".zip");
                enabled = true;
            } else if (filename.endsWith(".zip")) {
                newFilename = filename + ".disabled";
                enabled = false;
            } else {
                return { ok: false, error: "Cannot toggle directories" };
            }

            fs.renameSync(filePath, path.join(dir, newFilename));
            return { ok: true, newFilename, enabled };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    ipcMain.handle("instance-delete-resourcepack", async (_event, instanceId: string, filename: string) => {
        const instance = getInstance(instanceId);
        if (!instance) return { ok: false, error: "Instance not found" };

        const filePath = path.join(instance.gameDirectory, "resourcepacks", filename);
        if (!fs.existsSync(filePath)) return { ok: false, error: "Not found" };

        try {
            const stats = fs.statSync(filePath);
            if (stats.isDirectory()) {
                fs.rmSync(filePath, { recursive: true });
            } else {
                fs.rmSync(filePath, { force: true });
            }
            return { ok: true };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    // ----------------------------------------
    // Shaders
    // ----------------------------------------

    ipcMain.handle("instance-list-shaders", async (_event, instanceId: string) => {
        const instance = getInstance(instanceId);
        if (!instance) return { ok: false, error: "Instance not found" };

        const dir = path.join(instance.gameDirectory, "shaderpacks");
        if (!fs.existsSync(dir)) return { ok: true, items: [] };

        try {
            const files = await fs.promises.readdir(dir);
            const items = await Promise.all(files.map(async (file) => {
                const filePath = path.join(dir, file);
                try {
                    const stats = await fs.promises.stat(filePath);
                    const isDirectory = stats.isDirectory();

                    if (!file.endsWith(".zip") && !file.endsWith(".zip.disabled") && !isDirectory) {
                        return null;
                    }

                    let enabled = true;
                    let displayName = file;

                    if (file.endsWith(".zip.disabled")) {
                        enabled = false;
                        displayName = file.replace(".zip.disabled", "");
                    } else if (file.endsWith(".zip")) {
                        displayName = file.replace(".zip", "");
                    }

                    let icon: string | null = null;
                    try {
                        if (file.endsWith(".zip") || file.endsWith(".zip.disabled")) {
                            const zip = new AdmZip(filePath);
                            const possibleIcons = ["shaders/logo.png", "logo.png", "pack.png"];
                            for (const iconPath of possibleIcons) {
                                const iconEntry = zip.getEntry(iconPath);
                                if (iconEntry) {
                                    icon = `data:image/png;base64,${iconEntry.getData().toString("base64")}`;
                                    break;
                                }
                            }
                        } else if (isDirectory) {
                            const possiblePaths = [
                                path.join(filePath, "shaders", "logo.png"),
                                path.join(filePath, "logo.png"),
                                path.join(filePath, "pack.png")
                            ];
                            for (const iconPath of possiblePaths) {
                                if (fs.existsSync(iconPath)) {
                                    icon = `data:image/png;base64,${fs.readFileSync(iconPath).toString("base64")}`;
                                    break;
                                }
                            }
                        }
                    } catch { }

                    return {
                        filename: file,
                        name: displayName,
                        isDirectory,
                        size: stats.size,
                        modifiedAt: stats.mtime.toISOString(),
                        enabled,
                        icon
                    };
                } catch {
                    return null;
                }
            }));

            return { ok: true, items: items.filter(i => i !== null) };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    ipcMain.handle("instance-toggle-shader", async (_event, instanceId: string, filename: string) => {
        const instance = getInstance(instanceId);
        if (!instance) return { ok: false, error: "Instance not found" };

        const dir = path.join(instance.gameDirectory, "shaderpacks");
        const filePath = path.join(dir, filename);

        if (!fs.existsSync(filePath)) return { ok: false, error: "Not found" };

        try {
            let newFilename: string;
            let enabled: boolean;

            if (filename.endsWith(".zip.disabled")) {
                newFilename = filename.replace(".zip.disabled", ".zip");
                enabled = true;
            } else if (filename.endsWith(".zip")) {
                newFilename = filename + ".disabled";
                enabled = false;
            } else {
                return { ok: false, error: "Cannot toggle directories" };
            }

            fs.renameSync(filePath, path.join(dir, newFilename));
            return { ok: true, newFilename, enabled };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    ipcMain.handle("instance-delete-shader", async (_event, instanceId: string, filename: string) => {
        const instance = getInstance(instanceId);
        if (!instance) return { ok: false, error: "Instance not found" };

        const filePath = path.join(instance.gameDirectory, "shaderpacks", filename);
        if (!fs.existsSync(filePath)) return { ok: false, error: "Not found" };

        try {
            const stats = fs.statSync(filePath);
            if (stats.isDirectory()) {
                fs.rmSync(filePath, { recursive: true });
            } else {
                fs.rmSync(filePath, { force: true });
            }
            return { ok: true };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    // ----------------------------------------
    // Datapacks
    // ----------------------------------------

    ipcMain.handle("instance-list-datapacks", async (_event, instanceId: string) => {
        const instance = getInstance(instanceId);
        if (!instance) return { ok: false, error: "Instance not found" };

        const items: any[] = [];

        const processDp = async (dpDir: string, worldName: string) => {
            if (!fs.existsSync(dpDir)) return;
            const files = await fs.promises.readdir(dpDir);

            const dpItems = await Promise.all(files.map(async (file) => {
                const filePath = path.join(dpDir, file);
                try {
                    const stats = await fs.promises.stat(filePath);
                    const isDir = stats.isDirectory();

                    if (!file.endsWith(".zip") && !file.endsWith(".zip.disabled") &&
                        !file.endsWith(".jar") && !file.endsWith(".jar.disabled") && !isDir) {
                        return null;
                    }

                    let enabled = true;
                    let displayName = file;

                    if (file.endsWith(".zip.disabled") || file.endsWith(".jar.disabled")) {
                        enabled = false;
                        displayName = file.replace(".zip.disabled", "").replace(".jar.disabled", "");
                    } else if (file.endsWith(".zip")) {
                        displayName = file.replace(".zip", "");
                    } else if (file.endsWith(".jar")) {
                        displayName = file.replace(".jar", "");
                    }

                    let icon: string | null = null;
                    try {
                        if (file.endsWith(".zip") || file.endsWith(".zip.disabled") ||
                            file.endsWith(".jar") || file.endsWith(".jar.disabled")) {
                            const zip = new AdmZip(filePath);
                            const packPng = zip.getEntry("pack.png");
                            if (packPng) icon = `data:image/png;base64,${packPng.getData().toString("base64")}`;
                        } else if (isDir) {
                            const packPngPath = path.join(filePath, "pack.png");
                            if (fs.existsSync(packPngPath)) {
                                icon = `data:image/png;base64,${fs.readFileSync(packPngPath).toString("base64")}`;
                            }
                        }
                    } catch { }

                    return {
                        filename: file,
                        name: displayName,
                        worldName,
                        isDirectory: isDir,
                        size: stats.size,
                        modifiedAt: stats.mtime.toISOString(),
                        enabled,
                        icon
                    };
                } catch {
                    return null;
                }
            }));

            items.push(...dpItems.filter(i => i !== null));
        };

        await processDp(path.join(instance.gameDirectory, "datapacks"), "(Global)");

        const savesDir = path.join(instance.gameDirectory, "saves");
        if (fs.existsSync(savesDir)) {
            try {
                const worlds = await fs.promises.readdir(savesDir);
                await Promise.all(worlds.map(async (worldName) => {
                    const worldPath = path.join(savesDir, worldName);
                    try {
                        const worldStats = await fs.promises.stat(worldPath);
                        if (!worldStats.isDirectory()) return;
                        await processDp(path.join(worldPath, "datapacks"), worldName);
                    } catch { }
                }));
            } catch { }
        }

        return { ok: true, items };
    });

    ipcMain.handle("instance-toggle-datapack", async (_event, instanceId: string, worldName: string, filename: string) => {
        const instance = getInstance(instanceId);
        if (!instance) return { ok: false, error: "Instance not found" };

        const dpDir = worldName === "(Global)"
            ? path.join(instance.gameDirectory, "datapacks")
            : path.join(instance.gameDirectory, "saves", worldName, "datapacks");
        const filePath = path.join(dpDir, filename);

        if (!fs.existsSync(filePath)) return { ok: false, error: "Not found" };

        try {
            let newFilename: string;
            let enabled: boolean;

            if (filename.endsWith(".zip.disabled")) {
                newFilename = filename.replace(".zip.disabled", ".zip");
                enabled = true;
            } else if (filename.endsWith(".jar.disabled")) {
                newFilename = filename.replace(".jar.disabled", ".jar");
                enabled = true;
            } else if (filename.endsWith(".zip")) {
                newFilename = filename + ".disabled";
                enabled = false;
            } else if (filename.endsWith(".jar")) {
                newFilename = filename + ".disabled";
                enabled = false;
            } else {
                return { ok: false, error: "Cannot toggle directories" };
            }

            fs.renameSync(filePath, path.join(dpDir, newFilename));
            return { ok: true, newFilename, enabled };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    ipcMain.handle("instance-delete-datapack", async (_event, instanceId: string, worldName: string, filename: string) => {
        const instance = getInstance(instanceId);
        if (!instance) return { ok: false, error: "Instance not found" };

        const filePath = worldName === "(Global)"
            ? path.join(instance.gameDirectory, "datapacks", filename)
            : path.join(instance.gameDirectory, "saves", worldName, "datapacks", filename);

        if (!fs.existsSync(filePath)) return { ok: false, error: "Not found" };

        try {
            const stats = fs.statSync(filePath);
            if (stats.isDirectory()) {
                fs.rmSync(filePath, { recursive: true, force: true });
            } else {
                fs.rmSync(filePath, { force: true });
            }
            return { ok: true };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    // ----------------------------------------
    // Logs
    // ----------------------------------------

    ipcMain.handle("instance-read-latest-log", async (_event, instanceId: string) => {
        const instance = getInstance(instanceId);
        if (!instance) return { ok: false, error: "Instance not found", content: "" };

        const logPath = path.join(instance.gameDirectory, "logs", "latest.log");

        try {
            if (!fs.existsSync(logPath)) {
                return { ok: true, content: "", message: "No log file" };
            }
            const content = fs.readFileSync(logPath, "utf-8");
            const lines = content.split("\n").slice(-500);
            return { ok: true, content: lines.join("\n") };
        } catch (error: any) {
            return { ok: false, error: error.message, content: "" };
        }
    });

    // ----------------------------------------
    // Cloud Sync
    // ----------------------------------------

    ipcMain.handle("instances-cloud-sync", async () => {
        try {
            const session = getSession();
            if (!session || !session.apiToken) {
                return { ok: false, error: "Not logged in or no API token" };
            }

            const { syncCloudInstances } = await import("../cloud-instances.js");
            await syncCloudInstances(session.apiToken);

            // Notify frontend that instances might have been updated/added
            getMainWindow()?.webContents.send("instances-updated");

            return { ok: true };
        } catch (error: any) {
            console.error("[IPC] Cloud sync failed:", error);
            return { ok: false, error: error.message };
        }
    });

    ipcMain.handle("instances-cloud-install", async (_event, id: string) => {
        let createdInstanceId: string | null = null;

        try {
            const session = getSession();
            if (!session || !session.apiToken) {
                return { ok: false, error: "Not logged in or no API token" };
            }

            const { fetchJoinedServers, syncServerMods } = await import("../cloud-instances.js");
            const { importCloudInstance, deleteInstance } = await import("../instances.js");

            console.log(`[Instances] Manually installing cloud instance: ${id}`);
            getMainWindow()?.webContents.send("install-progress", { type: "start", task: "กำลังตรวจสอบข้อมูล..." });

            // 1. Fetch all joined servers
            const data = await fetchJoinedServers(session.apiToken);
            const allInstances = [...data.owned, ...data.member];

            // 2. Find target
            const target = allInstances.find(i => (i.storagePath || i.id) === id);

            if (target) {
                const instance = await importCloudInstance(target);
                createdInstanceId = instance.id;
                getMainWindow()?.webContents.send("instances-updated");

                // 3. Download Content
                // MUST match importCloudInstance logic: storagePath || id
                const targetId = target.storagePath || target.id;
                console.log(`[Instances] Downloading content for: ${target.name} (ID: ${targetId})`);

                // Create cancel controller
                const controller = new AbortController();
                activeOperations.set(id, controller); // map using the requested 'id' (CloudID)

                try {
                    await syncServerMods(targetId, session.apiToken, (progress) => {
                        getMainWindow()?.webContents.send("install-progress", progress);
                    }, controller.signal);

                    // Success - clear the cleanup flag
                    createdInstanceId = null;
                } catch (syncError: any) {
                    if (syncError.message === "Cancelled" || syncError.message === "Download cancelled") {
                        throw new Error("Installation cancelled");
                    }
                    console.error("[Instances] Sync Error:", syncError);
                    throw new Error(`Sync Failed: ${syncError?.message}`);
                } finally {
                    activeOperations.delete(id);
                }

                console.log(`[Instances] Installed successfully: ${target.name}`);
                getMainWindow()?.webContents.send("install-progress", { type: "complete", task: "ติดตั้งเสร็จสิ้น", percent: 100 });
                return { ok: true };
            } else {
                return { ok: false, error: "Cloud Instance not found in your list." };
            }

        } catch (error: any) {
            // Cleanup: Delete the instance if installation was cancelled or failed
            if (createdInstanceId) {
                console.log("[Instances] Installation failed or cancelled, cleaning up instance:", createdInstanceId);
                try {
                    const { deleteInstance } = await import("../instances.js");
                    await deleteInstance(createdInstanceId);
                    getMainWindow()?.webContents.send("instances-updated");
                    console.log("[Instances] Cleanup complete");
                } catch (cleanupError) {
                    console.error("[Instances] Failed to cleanup instance:", cleanupError);
                }
            }

            console.error("[IPC] Cloud install failed:", error);
            return { ok: false, error: error?.message || "การติดตั้งล้มเหลว" };
        }
    });

    ipcMain.handle("instances-get-joined", async () => {
        try {
            const session = getSession();
            if (!session || !session.apiToken) {
                return { ok: false, error: "Not logged in or no API token" };
            }

            const { fetchJoinedServers } = await import("../cloud-instances.js");
            const data = await fetchJoinedServers(session.apiToken);
            return { ok: true, data };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    ipcMain.handle("instance-leave", async (_event, instanceId: string) => {
        try {
            const session = getSession();
            if (!session || !session.apiToken) {
                return { ok: false, error: "Not logged in" };
            }

            const { leaveInstance } = await import("../cloud-instances.js");
            return await leaveInstance(instanceId, session.apiToken);
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    ipcMain.handle("instance-join-public", async (_event, instanceId: string) => {
        try {
            const session = getSession();
            if (!session || !session.apiToken) {
                return { ok: false, error: "Not logged in" };
            }

            const { joinPublicInstance } = await import("../cloud-instances.js");
            return await joinPublicInstance(instanceId, session.apiToken);
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    // ----------------------------------------
    // Add Content File (Drag & Drop)
    // ----------------------------------------

    ipcMain.handle("instance-add-content-file", async (_event, instanceId: string, filePath: string, contentType: string) => {
        console.log("[IPC] instance-add-content-file called:", { instanceId, filePath, contentType });

        const instance = getInstance(instanceId);
        if (!instance) {
            console.log("[IPC] Instance not found:", instanceId);
            return { ok: false, error: "Instance not found" };
        }

        const fileName = path.basename(filePath);
        const ext = path.extname(fileName).toLowerCase();

        // Validate file extension based on content type
        const validExtensions: Record<string, string[]> = {
            mod: [".jar"],
            resourcepack: [".zip"],
            shader: [".zip"],
            datapack: [".zip"],
        };

        const allowed = validExtensions[contentType] || [];
        if (!allowed.includes(ext)) {
            return {
                ok: false,
                error: `ไฟล์ ${ext} ไม่รองรับสำหรับ ${contentType}\nรองรับ: ${allowed.join(", ")}`
            };
        }

        // Determine target directory
        const folderMap: Record<string, string> = {
            mod: "mods",
            resourcepack: "resourcepacks",
            shader: "shaderpacks",
            datapack: "datapacks",
        };

        const targetFolder = folderMap[contentType];
        if (!targetFolder) return { ok: false, error: "Invalid content type" };

        const targetDir = path.join(instance.gameDirectory, targetFolder);
        const targetPath = path.join(targetDir, fileName);

        try {
            // Ensure directory exists
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            // Check if file already exists
            if (fs.existsSync(targetPath)) {
                return { ok: false, error: `ไฟล์ ${fileName} มีอยู่แล้ว` };
            }

            // Copy file
            fs.copyFileSync(filePath, targetPath);
            return { ok: true, filename: fileName };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    console.log("[IPC] Instance handlers registered");
}
