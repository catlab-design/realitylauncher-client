import type { IpcMain } from "electron";
import { BrowserWindow } from "electron";
import * as path from "path";
import * as fs from "fs-extra";

interface InstanceLike {
  gameDirectory: string;
  cloudId?: string;
  lockedMods?: string[];
}

interface ModMetadataCache {
  id?: string;
  displayName?: string;
  author?: string;
  description?: string;
  version?: string;
  icon?: string;
  modrinthId?: string;
  modrinthProjectId?: string;
  curseforgeProjectId?: string;
}

interface ModsLogger {
  info: (message: string, data?: Record<string, unknown>) => unknown;
  warn: (message: string, data?: Record<string, unknown>) => unknown;
}

interface SessionLike {
  apiToken?: string | null;
}

export interface InstanceModHandlersDeps {
  ipcMain: IpcMain;
  logger: ModsLogger;
  getInstance: (id: string) => InstanceLike | null;
  getInstancesDir: () => string;
  getNativeModule: () => unknown;
  modMetadataCache: Map<string, ModMetadataCache>;
  pendingModrinthLookups: Set<string>;
  ensureModMetadata: (
    filePath: string,
    instanceId?: string,
    precalculatedSize?: number,
    precalculatedMtime?: string,
  ) => Promise<ModMetadataCache>;
  getModCacheKey: (filepath: string, size: number, mtime: string) => string;
  saveMetadataCache: () => void;
  updateInstance: (
    id: string,
    updates: { lockedMods?: string[] },
  ) => Promise<unknown> | unknown;
  activeOperations: Map<string, AbortController>;
  createThrottledProgressSender: (
    channel: string,
    minIntervalMs?: number,
  ) => (payload: any, force?: boolean) => void;
  refreshMicrosoftTokenIfNeeded: (
    logger: ModsLogger,
  ) => Promise<{ ok: boolean; session?: SessionLike | null }>;
  getSession: () => SessionLike | null;
}

export function registerInstanceModHandlers(deps: InstanceModHandlersDeps): void {
  const {
    ipcMain,
    logger,
    getInstance,
    getInstancesDir,
    getNativeModule,
    modMetadataCache,
    pendingModrinthLookups,
    ensureModMetadata,
    getModCacheKey,
    saveMetadataCache,
    updateInstance,
    activeOperations,
    createThrottledProgressSender,
    refreshMicrosoftTokenIfNeeded,
    getSession,
  } = deps;

  const modListCache = new Map<
    string,
    { mtimeMs: number; mods: any[]; hasUncached: boolean }
  >();

  ipcMain.handle("instance-list-mods", async (_event, instanceId: string) => {
    const instance = getInstance(instanceId);
    if (!instance) {
      logger.warn(
        ` instance-list-mods: Instance not found (ID: ${instanceId})`,
      );
      return { ok: false, error: "Instance not found", mods: [] };
    }

    const modsDir = path.join(instance.gameDirectory, "mods");
    let stats: fs.Stats;
    try {
      stats = await fs.promises.stat(modsDir);
      if (!stats.isDirectory()) return { ok: true, mods: [] };
    } catch {
      return { ok: true, mods: [] };
    }

    
    const cacheEntry = modListCache.get(instanceId);
    if (cacheEntry && cacheEntry.mtimeMs === stats.mtimeMs) {
      return { ok: true, mods: cacheEntry.mods, hasUncached: cacheEntry.hasUncached };
    }

    try {
      const jsModEntries = (await fs.promises.readdir(modsDir))
        .filter((f) => f.endsWith(".jar") || f.endsWith(".jar.disabled"))
        .map((filename) => ({ filename }));
      
      const native = getNativeModule() as any;
      const NATIVE_MOD_SCAN_MAX = 80;
      const allowNativeSyncModScan = jsModEntries.length <= NATIVE_MOD_SCAN_MAX;
      const nativeModMap = new Map<string, any>();

      if (allowNativeSyncModScan && typeof native.listInstanceMods === "function") {
        try {
          const nativeMods = (native.listInstanceMods(getInstancesDir(), instanceId) || []) as any[];
          for (const item of nativeMods) {
            if (item?.filename) nativeModMap.set(item.filename, item);
          }
        } catch (nativeError) {
          logger.warn("[Mods] Native listInstanceMods failed, fallback to JS", {
            message: String((nativeError as Error)?.message || nativeError),
          });
        }
      }

      const modEntryByFilename = new Map<string, { filename: string }>();
      for (const filename of nativeModMap.keys()) {
        modEntryByFilename.set(filename, { filename });
      }
      for (const entry of jsModEntries) {
        if (!modEntryByFilename.has(entry.filename)) {
          modEntryByFilename.set(entry.filename, entry);
        }
      }
      const modEntries = Array.from(modEntryByFilename.values());

      const CONCURRENCY = 8;
      const LOOKUP_BATCH_PER_CALL = modEntries.length > 120 ? 4 : 10;
      const mods: (any | null)[] = new Array(modEntries.length).fill(null);
      let cursor = 0;
      let hasUncached = false;
      let scheduledLookups = 0;
      let cacheTouched = false;

      const isMetadataResolved = (meta?: ModMetadataCache): boolean => {
        if (!meta) return false;
        return Boolean(meta.icon || meta.modrinthId);
      };

      const worker = async () => {
        while (true) {
          const idx = cursor++;
          if (idx >= modEntries.length) break;
          const file = modEntries[idx]?.filename;
          if (!file) continue;
          const filePath = path.join(modsDir, file);
          try {
            const fStats = await fs.promises.stat(filePath);
            const mtime = fStats.mtime.toISOString();
            const cacheKey = getModCacheKey(filePath, fStats.size, mtime);
            const seeded = modMetadataCache.get(cacheKey) || {};
            const nativeMeta = nativeModMap.get(file);

            let name = file;
            let enabled = true;
            if (file.endsWith(".jar.disabled")) {
              name = file.replace(".jar.disabled", "");
              enabled = false;
            } else if (file.endsWith(".jar")) {
              name = file.replace(".jar", "");
            }

            const metadata: ModMetadataCache = {
              ...seeded,
              id: seeded.id || nativeMeta?.modId,
              displayName: seeded.displayName || (typeof nativeMeta?.name === "string" ? nativeMeta.name : name),
              author: seeded.author || (Array.isArray(nativeMeta?.authors) ? nativeMeta?.authors.filter(Boolean).join(", ") : undefined),
              description: seeded.description || nativeMeta?.description,
              version: seeded.version || nativeMeta?.version,
              icon: seeded.icon || (typeof nativeMeta?.iconBase64 === "string" && nativeMeta.iconBase64.length > 0 ? `data:image/png;base64,${nativeMeta.iconBase64}` : undefined),
            };

            if (!modMetadataCache.get(cacheKey)) {
              modMetadataCache.set(cacheKey, metadata);
              cacheTouched = true;
            }

            const hasUsefulLocalMetadata = Boolean(
              metadata.icon ||
                (metadata.displayName && metadata.displayName.toLowerCase() !== name.toLowerCase()) ||
                metadata.version ||
                metadata.description ||
                metadata.author,
            );
            const lookupPending = pendingModrinthLookups.has(cacheKey);
            const needsLookup = !isMetadataResolved(metadata) && !hasUsefulLocalMetadata;
            if (lookupPending || needsLookup) hasUncached = true;

            if (needsLookup && !lookupPending && scheduledLookups < LOOKUP_BATCH_PER_CALL) {
              scheduledLookups += 1;
              void ensureModMetadata(filePath, instanceId, fStats.size, mtime).catch(() => {});
            }

            mods[idx] = {
              filename: file,
              name,
              displayName: metadata?.displayName || name,
              author: metadata?.author || "",
              description: metadata?.description || "",
              icon: metadata?.icon || null,
              version: metadata?.version || "",
              enabled,
              size: fStats.size,
              modifiedAt: mtime,
              modrinthProjectId: metadata?.modrinthProjectId,
              curseforgeProjectId: metadata?.curseforgeProjectId,
            };
          } catch (e) {}
        }
      };

      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, modEntries.length) }, () => worker()));
      const validMods = mods.filter((m) => m !== null) as any[];
      validMods.sort((a, b) => a.displayName.localeCompare(b.displayName));
      if (cacheTouched) saveMetadataCache();

      modListCache.set(instanceId, { mtimeMs: stats.mtimeMs, mods: validMods, hasUncached });
      return { ok: true, mods: validMods, hasUncached };
    } catch (error: any) {
      return { ok: false, error: error.message, mods: [] };
    }
  });

  ipcMain.handle("instance-get-mod-metadata", async (_event, instanceId, filename) => {
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

  ipcMain.handle("instance-toggle-mod", async (_event, instanceId, filename) => {
    const instance = getInstance(instanceId);
    if (!instance) return { ok: false, error: "Instance not found" };
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
      } else return { ok: false, error: "Invalid mod file" };
      await fs.promises.rename(filePath, path.join(modsDir, newFilename));
      return { ok: true, newFilename, enabled };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle("instance-delete-mod", async (_event, instanceId, filename) => {
    const instance = getInstance(instanceId);
    if (!instance) return { ok: false, error: "Instance not found" };
    if (instance.lockedMods?.includes(filename)) return { ok: false, error: "Mod is locked" };
    const filePath = path.join(instance.gameDirectory, "mods", filename);
    if (!fs.existsSync(filePath)) return { ok: false, error: "Mod not found" };
    try {
      await fs.promises.rm(filePath, { force: true });
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle("instance-toggle-lock", async (_event, instanceId, filename) => {
    const instance = getInstance(instanceId);
    if (!instance) return { ok: false, error: "Instance not found" };
    const locked = instance.lockedMods || [];
    const isLocked = locked.includes(filename);
    const newLocked = isLocked ? locked.filter((f) => f !== filename) : [...locked, filename];
    updateInstance(instanceId, { lockedMods: newLocked });
    return { ok: true, locked: !isLocked, lockedMods: newLocked };
  });

  ipcMain.handle("instance-lock-mods", async (_event, instanceId, filenames, lock) => {
    const instance = getInstance(instanceId);
    if (!instance) return { ok: false, error: "Instance not found" };
    const locked = new Set(instance.lockedMods || []);
    filenames.forEach((f: string) => {
      if (lock) locked.add(f);
      else locked.delete(f);
    });
    const newLocked = Array.from(locked);
    updateInstance(instanceId, { lockedMods: newLocked });
    return { ok: true, lockedMods: newLocked };
  });

  ipcMain.handle("instance-check-integrity", async (_event, instanceId) => {
    const instance = getInstance(instanceId);
    if (!instance) return { ok: false, error: "Instance not found" };
    if (!instance.cloudId) return { ok: true, message: "Local instance check skipped" };
    if (activeOperations.has(instanceId)) return { ok: false, error: "Operation in progress" };
    const sendInstallProgress = createThrottledProgressSender("install-progress");
    try {
      const { syncServerMods } = await import("../cloud-instances.js");
      let session = getSession();
      if (!session || !session.apiToken) {
        const refreshed = await refreshMicrosoftTokenIfNeeded(logger);
        if (refreshed.ok) session = getSession() || session;
      }
      if (!session?.apiToken) return { ok: false, error: "Not logged in" };
      const abortController = new AbortController();
      activeOperations.set(instanceId, abortController);
      const syncTimeout = setTimeout(() => abortController.abort(), 10 * 60 * 1000);
      try {
        await syncServerMods(instanceId, session.apiToken, (p) => {
          sendInstallProgress({ type: p.type, task: p.task, current: p.current, total: p.total, percent: p.percent, filename: p.filename }, p?.type === "sync-complete" || p?.type === "sync-error" || p?.type === "cancelled");
        }, abortController.signal);
      } finally {
        clearTimeout(syncTimeout);
        activeOperations.delete(instanceId);
      }
      const wins = BrowserWindow.getAllWindows();
      if (wins.length > 0) wins[0].webContents.send("instances-updated");
      return { ok: true, message: "Sync complete" };
    } catch (error: any) {
      if (String(error?.message || "").includes("Cancelled")) sendInstallProgress({ type: "cancelled", task: "Cancelled", percent: 0 }, true);
      return { ok: false, error: error.message };
    }
  });
}
