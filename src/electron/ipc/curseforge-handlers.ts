/**
 * ========================================
 * CurseForge API IPC Handlers with Caching
 * ========================================
 */

import { ipcMain } from "electron";
import {
  searchCurseForge,
  getCurseForgeProject,
  getCurseForgeDescription,
  getCurseForgeFiles,
  getCurseForgeFile,
  getCurseForgeDownloadUrl,
} from "../curseforge-api.js";

// ========================================
// In-Memory Cache
// ========================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache
const searchCache = new Map<string, CacheEntry<any>>();
const projectCache = new Map<string, CacheEntry<any>>();
const filesCache = new Map<string, CacheEntry<any>>();

function getCacheKey(prefix: string, params: any): string {
  return `${prefix}:${JSON.stringify(params)}`;
}

function getFromCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
): T | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

function setCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  data: T,
): void {
  cache.set(key, { data, timestamp: Date.now() });

  // Limit cache size to prevent memory leaks
  if (cache.size > 100) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
}

// ========================================
// Handlers
// ========================================

export function registerCurseForgeHandlers(): void {
  /**
   * curseforge-search - ค้นหา mods/modpacks จาก CurseForge (with caching)
   */
  ipcMain.handle("curseforge-search", async (_event, filters: any) => {
    try {
      const cacheKey = getCacheKey("cf-search", filters);
      const cached = getFromCache(searchCache, cacheKey);
      if (cached) {
        console.log("[CurseForge] Search cache hit");
        return cached;
      }

      const result = await searchCurseForge({
        query: filters.query,
        projectType: filters.projectType,
        gameVersion: filters.gameVersion,
        sortBy: filters.sortBy,
        pageSize: filters.pageSize,
        index: filters.index,
        modLoaderType: filters.modLoaderType,
      });

      setCache(searchCache, cacheKey, result);
      console.log(
        "[CurseForge] Search result cached:",
        result?.data?.length || 0,
        "items",
      );
      return result;
    } catch (error: any) {
      console.error("[CurseForge] Search error:", error);
      throw error;
    }
  });

  /**
   * curseforge-get-project - ดึงรายละเอียด project (with caching)
   */
  ipcMain.handle(
    "curseforge-get-project",
    async (_event, projectId: number | string) => {
      try {
        const cacheKey = `cf-project:${projectId}`;
        const cached = getFromCache(projectCache, cacheKey);
        if (cached) {
          console.log("[CurseForge] Project cache hit:", projectId);
          return cached;
        }

        const result = await getCurseForgeProject(projectId);
        setCache(projectCache, cacheKey, result);
        return result;
      } catch (error: any) {
        console.error("[CurseForge] Get project error:", error);
        throw error;
      }
    },
  );

  /**
   * curseforge-get-description - ดึงรายละเอียด description (HTML)
   */
  ipcMain.handle(
    "curseforge-get-description",
    async (_event, projectId: number | string) => {
      try {
        const cacheKey = `cf-desc:${projectId}`;
        const cached = getFromCache(projectCache, cacheKey);
        if (cached) return cached;

        const result = await getCurseForgeDescription(projectId);
        setCache(projectCache, cacheKey, result);
        return result;
      } catch (error: any) {
        console.error("[CurseForge] Get description error:", error);
        throw error;
      }
    },
  );

  /**
   * curseforge-get-files - ดึง files/versions ของ project (with caching)
   */
  ipcMain.handle(
    "curseforge-get-files",
    async (_event, projectId: number | string, gameVersion?: string) => {
      try {
        const cacheKey = `cf-files:${projectId}:${gameVersion || "all"}`;
        const cached = getFromCache(filesCache, cacheKey);
        if (cached) {
          console.log("[CurseForge] Files cache hit:", projectId);
          return cached;
        }

        const result = await getCurseForgeFiles(projectId, gameVersion);

        // Debug: Log file count and versions
        console.log("[CurseForge] Total files:", result?.data?.length);
        if (result?.data) {
          const versions = new Set<string>();
          const loaders = new Set<string>();
          for (const f of result.data) {
            f.gameVersions?.forEach((v: string) => {
              if (
                ["fabric", "forge", "neoforge", "quilt"].includes(
                  v.toLowerCase(),
                )
              ) {
                loaders.add(v);
              } else {
                versions.add(v);
              }
            });
          }
          console.log(
            "[CurseForge] Available MC versions:",
            [...versions].slice(0, 20),
          );
          console.log("[CurseForge] Available loaders:", [...loaders]);
        }

        setCache(filesCache, cacheKey, result);
        return result;
      } catch (error: any) {
        console.error("[CurseForge] Get files error:", error);
        throw error;
      }
    },
  );

  /**
   * curseforge-get-file - ดึงรายละเอียด file เดียว
   */
  ipcMain.handle(
    "curseforge-get-file",
    async (_event, projectId: number | string, fileId: number | string) => {
      try {
        return await getCurseForgeFile(projectId, fileId);
      } catch (error: any) {
        console.error("[CurseForge] Get file error:", error);
        throw error;
      }
    },
  );

  /**
   * curseforge-get-download-url - ดึง download URL
   */
  ipcMain.handle(
    "curseforge-get-download-url",
    async (_event, projectId: number | string, fileId: number | string) => {
      try {
        return await getCurseForgeDownloadUrl(projectId, fileId);
      } catch (error: any) {
        console.error("[CurseForge] Get download URL error:", error);
        throw error;
      }
    },
  );

  /**
   * curseforge-prefetch - Prefetch popular content
   */
  ipcMain.handle("curseforge-prefetch", async () => {
    try {
      console.log("[CurseForge] Starting prefetch...");

      // Prefetch popular modpacks
      const modpacks = await searchCurseForge({
        projectType: "modpack",
        pageSize: 20,
        sortBy: "downloads",
      });
      setCache(
        searchCache,
        getCacheKey("cf-search", {
          projectType: "modpack",
          pageSize: 20,
          sortBy: "downloads",
        }),
        modpacks,
      );

      // Prefetch popular mods
      const mods = await searchCurseForge({
        projectType: "mod",
        pageSize: 20,
        sortBy: "downloads",
      });
      setCache(
        searchCache,
        getCacheKey("cf-search", {
          projectType: "mod",
          pageSize: 20,
          sortBy: "downloads",
        }),
        mods,
      );

      console.log(
        "[CurseForge] Prefetch complete:",
        modpacks?.data?.length || 0,
        "modpacks,",
        mods?.data?.length || 0,
        "mods",
      );
      return {
        ok: true,
        modpacks: modpacks?.data?.length || 0,
        mods: mods?.data?.length || 0,
      };
    } catch (error: any) {
      console.error("[CurseForge] Prefetch error:", error);
      return { ok: false, error: error.message };
    }
  });

  /**
   * curseforge-clear-cache - Clear all CurseForge caches
   */
  ipcMain.handle("curseforge-clear-cache", async () => {
    searchCache.clear();
    projectCache.clear();
    filesCache.clear();
    console.log("[CurseForge] Cache cleared");
    return { ok: true };
  });

  console.log("[IPC] CurseForge handlers registered (with caching)");
}
