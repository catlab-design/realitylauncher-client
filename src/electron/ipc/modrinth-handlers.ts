

import { ipcMain, BrowserWindow, app } from "electron";
import path from "path";
import { createRequire } from "module";
import {
    searchModpacks,
    getProject,
    getProjectVersions,
    getVersion,
    downloadModpack,
    getPopularModpacks,
    getGameVersions,
    getLoaders,
    getInstalledModpacks,
    deleteInstalledModpack,
    getLoaderVersions,
    type SearchFilters,
} from "../modrinth.js";





interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; 
const searchCache = new Map<string, CacheEntry<any>>();
const projectCache = new Map<string, CacheEntry<any>>();
const versionsCache = new Map<string, CacheEntry<any>>();

function getCacheKey(prefix: string, params: any): string {
    return `${prefix}:${JSON.stringify(params)}`;
}

function getFromCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }

    return entry.data;
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
    cache.set(key, { data, timestamp: Date.now() });

    
    if (cache.size > 100) {
        const firstKey = cache.keys().next().value;
        if (firstKey) cache.delete(firstKey);
    }
}





let nativeModule: any = null;


const customRequire = createRequire(__filename);

function getNative(): any {
    if (nativeModule) return nativeModule;

    const nativePath = path.join(app.getAppPath(), "native", "index.cjs");
    console.log("[Modrinth] Loading native module from:", nativePath);

    nativeModule = customRequire(nativePath);
    return nativeModule;
}





export function registerModrinthHandlers(getMainWindow: () => BrowserWindow | null): void {
    
    ipcMain.handle("modrinth-search", async (_event, filters: any) => {
        try {
            const cacheKey = getCacheKey("search", filters);
            const cached = getFromCache(searchCache, cacheKey);
            if (cached) {
                console.log("[Modrinth] Search cache hit:", cacheKey.substring(0, 50));
                return cached;
            }

            const project_type = filters.projectType || "modpack";
            const game_version = filters.gameVersion;
            const loader = filters.loader;

            
            const result = await searchModpacks({
                query: filters.query,
                projectType: project_type,
                gameVersion: game_version,
                loader: loader,
                limit: filters.limit,
                offset: filters.offset,
                sortBy: filters.sortBy || filters.index
            });

            setCache(searchCache, cacheKey, result);
            console.log("[Modrinth] Search result cached:", result?.hits?.length || 0, "hits");
            return result;
        } catch (error: any) {
            console.error("[Modrinth] Search error:", error);
            throw error;
        }
    });

    
    ipcMain.handle("modrinth-get-project", async (_event, idOrSlug: string) => {
        try {
            if (!idOrSlug) {
                console.warn("[Modrinth] get-project called with empty ID");
                return null;
            }

            const cached = getFromCache(projectCache, idOrSlug);
            if (cached) {
                console.log("[Modrinth] Project cache hit:", idOrSlug);
                return cached;
            }

            
            const result = await getProject(idOrSlug);

            setCache(projectCache, idOrSlug, result);
            return result;
        } catch (error: any) {
            console.error("[Modrinth] Get project error:", error);
            throw error;
        }
    });

    
    ipcMain.handle("modrinth-get-versions", async (_event, idOrSlug: string) => {
        try {
            const cached = getFromCache(versionsCache, idOrSlug);
            if (cached) {
                console.log("[Modrinth] Versions cache hit:", idOrSlug);
                return cached;
            }

            console.log("[Modrinth] Getting versions for project:", idOrSlug);
            
            const result = await getProjectVersions(idOrSlug);

            setCache(versionsCache, idOrSlug, result);
            console.log("[Modrinth] Got", result?.length || 0, "versions for project:", idOrSlug);
            return result;
        } catch (error: any) {
            console.error("[Modrinth] Get versions error:", error);
            throw error;
        }
    });

    
    ipcMain.handle("modrinth-get-version", async (_event, versionId: string) => {
        try {
            return await getVersion(versionId);
        } catch (error: any) {
            console.error("[Modrinth] Get version error:", error);
            throw error;
        }
    });

    
    ipcMain.handle("modrinth-download", async (_event, versionId: string) => {
        try {
            const mainWindow = getMainWindow();
            const version = await getVersion(versionId);

            const result = await downloadModpack(version, (progress) => {
                mainWindow?.webContents.send("modrinth-download-progress", progress);
            });

            return { ok: true, path: result };
        } catch (error: any) {
            console.error("[Modrinth] Download error:", error);
            return { ok: false, error: error.message };
        }
    });

    
    ipcMain.handle("modrinth-get-popular", async (_event, limit: number = 10) => {
        try {
            return await getPopularModpacks(limit);
        } catch (error: any) {
            console.error("[Modrinth] Get popular error:", error);
            throw error;
        }
    });

    
    ipcMain.handle("modrinth-get-game-versions", async () => {
        try {
            return await getGameVersions();
        } catch (error: any) {
            console.error("[Modrinth] Get game versions error:", error);
            throw error;
        }
    });

    
    ipcMain.handle("modrinth-get-loaders", async () => {
        try {
            return await getLoaders();
        } catch (error: any) {
            console.error("[Modrinth] Get loaders error:", error);
            throw error;
        }
    });

    
    ipcMain.handle("modrinth-get-loader-versions", async (_event, loader: string, gameVersion: string) => {
        try {
            const cacheKey = getCacheKey("loader-versions", { loader, gameVersion });
            const cached = getFromCache(versionsCache, cacheKey);
            if (cached) return cached;

            const result = await getLoaderVersions(loader, gameVersion);
            setCache(versionsCache, cacheKey, result);
            return result;
        } catch (error: any) {
            console.error("[Modrinth] Get loader versions error:", error);
            return [];
        }
    });

    
    ipcMain.handle("modrinth-get-installed", async () => {
        try {
            return await getInstalledModpacks();
        } catch (error: any) {
            console.error("[Modrinth] Get installed error:", error);
            throw error;
        }
    });

    
    ipcMain.handle("modrinth-delete-modpack", async (_event, modpackPath: string) => {
        try {
            return await deleteInstalledModpack(modpackPath);
        } catch (error: any) {
            console.error("[Modrinth] Delete modpack error:", error);
            return false;
        }
    });

    
    ipcMain.handle("modrinth-prefetch", async () => {
        try {
            console.log("[Modrinth] Starting prefetch...");
            const native = getNative();

            
            const modpacks = await native.modrinthSearch({
                projectType: "modpack",
                limit: 20,
                sortBy: "downloads"
            });
            setCache(searchCache, getCacheKey("search", { projectType: "modpack", limit: 20, sortBy: "downloads" }), modpacks);

            
            const mods = await native.modrinthSearch({
                projectType: "mod",
                limit: 20,
                sortBy: "downloads"
            });
            setCache(searchCache, getCacheKey("search", { projectType: "mod", limit: 20, sortBy: "downloads" }), mods);

            console.log("[Modrinth] Prefetch complete:", modpacks?.hits?.length || 0, "modpacks,", mods?.hits?.length || 0, "mods");
            return { ok: true, modpacks: modpacks?.hits?.length || 0, mods: mods?.hits?.length || 0 };
        } catch (error: any) {
            console.error("[Modrinth] Prefetch error:", error);
            return { ok: false, error: error.message };
        }
    });

    
    ipcMain.handle("modrinth-clear-cache", async () => {
        searchCache.clear();
        projectCache.clear();
        versionsCache.clear();
        console.log("[Modrinth] Cache cleared");
        return { ok: true };
    });

    console.log("[IPC] Modrinth handlers registered (with caching)");
}
