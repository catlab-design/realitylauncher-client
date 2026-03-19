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


  ipcMain.handle("instance-list-mods", async (_event, instanceId: string) => {
    const instance = getInstance(instanceId);
    if (!instance) {
      logger.warn(
        ` instance-list-mods: Instance not found (ID: ${instanceId})`,
      );
      return { ok: false, error: "Instance not found", mods: [] };
    }

    const modsDir = path.join(instance.gameDirectory, "mods");
    // Check mods dir existence async (avoid blocking main thread)
    try {
      await fs.promises.access(modsDir);
    } catch {
      return { ok: true, mods: [] };
    }

    try {
      // Keep the first pass lightweight: just list files.
      // Metadata and icons are hydrated progressively from cache/background lookup.
      const jsModEntries = (await fs.promises.readdir(modsDir))
        .filter((f) => f.endsWith(".jar") || f.endsWith(".jar.disabled"))
        .map((filename) => ({ filename }));
      const native = getNativeModule() as any;
      const NATIVE_MOD_SCAN_MAX = 80;
      const allowNativeSyncModScan = jsModEntries.length <= NATIVE_MOD_SCAN_MAX;
      const nativeModMap = new Map<
        string,
        {
          filename: string;
          name?: string;
          version?: string;
          description?: string;
          authors?: string[];
          modId?: string;
          iconBase64?: string | null;
          enabled?: boolean;
          size?: number;
        }
      >();
      if (
        allowNativeSyncModScan &&
        typeof native.listInstanceMods === "function"
      ) {
        try {
          const nativeMods = (native.listInstanceMods(
            getInstancesDir(),
            instanceId,
          ) || []) as Array<{
            filename: string;
            name?: string;
            version?: string;
            description?: string;
            authors?: string[];
            modId?: string;
            iconBase64?: string | null;
            enabled?: boolean;
            size?: number;
          }>;

          for (const item of nativeMods) {
            if (!item?.filename) continue;
            nativeModMap.set(item.filename, item);
          }
        } catch (nativeError) {
          logger.warn("[Mods] Native listInstanceMods failed, fallback to JS", {
            message: String((nativeError as Error)?.message || nativeError),
          });
        }
      } else if (!allowNativeSyncModScan) {
        logger.info(
          `[Mods] Skip synchronous native listInstanceMods for large mod set (${jsModEntries.length} entries)`,
        );
      }

      const nativeModsPrimary = nativeModMap.size > 0;
      const modEntryByFilename = new Map<string, { filename: string }>();
      if (nativeModsPrimary) {
        for (const filename of nativeModMap.keys()) {
          modEntryByFilename.set(filename, { filename });
        }
      }
      for (const entry of jsModEntries) {
        if (!modEntryByFilename.has(entry.filename)) {
          modEntryByFilename.set(entry.filename, entry);
        }
      }
      const modEntries = Array.from(modEntryByFilename.values());

      // Return quickly using cached/native metadata, then hydrate in background.
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
            const stats = await fs.promises.stat(filePath);
            const mtime = stats.mtime.toISOString();
            const cacheKey = getModCacheKey(filePath, stats.size, mtime);
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
              displayName:
                seeded.displayName ||
                (typeof nativeMeta?.name === "string" ? nativeMeta.name : name),
              author:
                seeded.author ||
                (Array.isArray(nativeMeta?.authors)
                  ? nativeMeta?.authors.filter(Boolean).join(", ")
                  : undefined),
              description: seeded.description || nativeMeta?.description,
              version: seeded.version || nativeMeta?.version,
              icon:
                seeded.icon ||
                (typeof nativeMeta?.iconBase64 === "string" &&
                nativeMeta.iconBase64.length > 0
                  ? `data:image/png;base64,${nativeMeta.iconBase64}`
                  : undefined),
            };

            if (!modMetadataCache.has(cacheKey)) {
              modMetadataCache.set(cacheKey, metadata);
              cacheTouched = true;
            }

            const hasUsefulLocalMetadata = Boolean(
              metadata.icon ||
                (metadata.displayName &&
                  metadata.displayName.toLowerCase() !== name.toLowerCase()) ||
                metadata.version ||
                metadata.description ||
                metadata.author,
            );
            const lookupPending = pendingModrinthLookups.has(cacheKey);
            const needsLookup =
              !isMetadataResolved(metadata) && !hasUsefulLocalMetadata;
            if (lookupPending || needsLookup) {
              hasUncached = true;
            }

            // Batch background hydration to avoid UI stalls on large mod lists.
            if (
              needsLookup &&
              !lookupPending &&
              scheduledLookups < LOOKUP_BATCH_PER_CALL
            ) {
              scheduledLookups += 1;
              void ensureModMetadata(filePath, instanceId, stats.size, mtime)
                .catch((error) => {
                  logger.warn(
                    `[Mods] Background metadata lookup failed for ${filePath}: ${String(error)}`,
                  );
                });
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
              size: stats.size,
              modifiedAt: mtime,
              modrinthProjectId: metadata?.modrinthProjectId,
              curseforgeProjectId: metadata?.curseforgeProjectId,
            };
          } catch (e) {
            // skip failed files
          }
        }
      };

      // Run workers in parallel (limited concurrency)
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, modEntries.length) }, () =>
          worker(),
        ),
      );

      // Filter out failed stats
      const validMods = mods.filter((m) => m !== null) as any[];

      // logical sort
      validMods.sort((a, b) => a.displayName.localeCompare(b.displayName));
      if (cacheTouched) {
        saveMetadataCache();
      }
      return { ok: true, mods: validMods, hasUncached };
    } catch (error: any) {
      return { ok: false, error: error.message, mods: [] };
    }
  });

  ipcMain.handle(
    "instance-get-mod-metadata",
    async (_event, instanceId: string, filename: string) => {
      const instance = getInstance(instanceId);
      if (!instance) return { ok: false, error: "Instance not found" };

      const filePath = path.join(instance.gameDirectory, "mods", filename);
      if (!fs.existsSync(filePath))
        return { ok: false, error: "Mod not found" };

      try {
        // ensureModMetadata is defined in this file
        const metadata = await ensureModMetadata(filePath, instanceId);
        return { ok: true, metadata };
      } catch (error: any) {
        return { ok: false, error: error.message };
      }
    },
  );

  ipcMain.handle(
    "instance-toggle-mod",
    async (_event, instanceId: string, filename: string) => {
      const instance = getInstance(instanceId);
      if (!instance) {
        logger.warn(
          ` instance-toggle-mod: Instance not found (ID: ${instanceId})`,
        );
        return { ok: false, error: "Instance not found" };
      }

      const modsDir = path.join(instance.gameDirectory, "mods");
      const filePath = path.join(modsDir, filename);

      if (!fs.existsSync(filePath))
        return { ok: false, error: "Mod not found" };

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

        await fs.promises.rename(filePath, path.join(modsDir, newFilename));
        return { ok: true, newFilename, enabled };
      } catch (error: any) {
        return { ok: false, error: error.message };
      }
    },
  );

  ipcMain.handle(
    "instance-delete-mod",
    async (_event, instanceId: string, filename: string) => {
      const instance = getInstance(instanceId);
      if (!instance) return { ok: false, error: "Instance not found" };

      // Check if locked
      if (instance.lockedMods?.includes(filename)) {
        return { ok: false, error: "Mod is locked (Cannot delete)" };
      }

      const filePath = path.join(instance.gameDirectory, "mods", filename);
      if (!fs.existsSync(filePath))
        return { ok: false, error: "Mod not found" };

      try {
        await fs.promises.rm(filePath, { force: true });
        return { ok: true };
      } catch (error: any) {
        return { ok: false, error: error.message };
      }
    },
  );

  ipcMain.handle(
    "instance-toggle-lock",
    async (_event, instanceId: string, filename: string) => {
      const instance = getInstance(instanceId);
      if (!instance) {
        logger.warn(
          ` instance-toggle-lock: Instance not found (ID: ${instanceId})`,
        );
        return { ok: false, error: "Instance not found" };
      }

      const locked = instance.lockedMods || [];
      const isLocked = locked.includes(filename);

      let newLocked: string[];
      if (isLocked) {
        newLocked = locked.filter((f) => f !== filename);
      } else {
        newLocked = [...locked, filename];
      }

      updateInstance(instanceId, { lockedMods: newLocked });
      return { ok: true, locked: !isLocked, lockedMods: newLocked };
    },
  );

  ipcMain.handle(
    "instance-lock-mods",
    async (_event, instanceId: string, filenames: string[], lock: boolean) => {
      const instance = getInstance(instanceId);
      if (!instance) {
        logger.warn(
          ` instance-lock-mods: Instance not found (ID: ${instanceId})`,
        );
        return { ok: false, error: "Instance not found" };
      }

      const locked = new Set(instance.lockedMods || []);

      filenames.forEach((filename) => {
        if (lock) {
          locked.add(filename);
        } else {
          locked.delete(filename);
        }
      });

      const newLocked = Array.from(locked);
      updateInstance(instanceId, { lockedMods: newLocked });
      return { ok: true, lockedMods: newLocked };
    },
  );

  ipcMain.handle(
    "instance-check-integrity",
    async (_event, instanceId: string) => {
      const instance = getInstance(instanceId);
      if (!instance) return { ok: false, error: "Instance not found" };

      if (!instance.cloudId) {
        return { ok: true, message: "Local instance integrity check skipped" };
      }

      if (activeOperations.has(instanceId)) {
        return { ok: false, error: "Another operation is already running" };
      }

      const sendInstallProgress =
        createThrottledProgressSender("install-progress");

      try {
        const { syncServerMods } = await import("../cloud-instances.js");
        let session = getSession();
        if (!session) {
          return { ok: false, error: "Not logged in" };
        }

        let apiToken = session.apiToken;
        if (!apiToken) {
          const refreshed = await refreshMicrosoftTokenIfNeeded(logger);
          if (refreshed.ok) {
            session = getSession() || session;
            apiToken = session.apiToken;
          }
        }
        if (!apiToken) {
          return { ok: false, error: "Not logged in or no API token" };
        }

        // Create AbortController for cancellation support
        const abortController = new AbortController();
        activeOperations.set(instanceId, abortController);
        const syncTimeout = setTimeout(
          () => abortController.abort(),
          10 * 60 * 1000,
        );

        // Send progress updates to frontend
        try {
          await syncServerMods(
            instanceId,
            apiToken,
            (progress) => {
              sendInstallProgress(
                {
                  type: progress.type,
                  task: progress.task,
                  current: progress.current,
                  total: progress.total,
                  percent: progress.percent,
                  filename: progress.filename,
                },
                progress?.type === "sync-complete" ||
                  progress?.type === "sync-error" ||
                  progress?.type === "cancelled",
              );
            },
            abortController.signal,
          );
        } finally {
          clearTimeout(syncTimeout);
          activeOperations.delete(instanceId);
        }

        // Notify frontend that instance data might have changed (loader, version)
        const wins = BrowserWindow.getAllWindows();
        if (wins.length > 0) {
          wins[0].webContents.send("instances-updated");
        }

        return { ok: true, message: "Sync complete" };
      } catch (error: any) {
        if (String(error?.message || "").includes("Cancelled")) {
          sendInstallProgress(
            { type: "cancelled", task: "Cancelled", percent: 0 },
            true,
          );
        }
        return { ok: false, error: error.message };
      }
    },
  );
}
