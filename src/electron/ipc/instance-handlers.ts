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

import { ipcMain, dialog, shell, app, BrowserWindow, session } from "electron";
import { join, basename, dirname } from "path";
import * as path from "path";

// Helper to get main window
function getMainWindow() {
  return BrowserWindow.getAllWindows()[0];
}

import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  mkdirSync,
  rmSync,
  copyFileSync,
} from "fs";
import * as fs from "fs-extra";
import crypto from "node:crypto";
import { net } from "electron";
import AdmZip from "adm-zip";
import { createIpcLogger } from "../lib/logger.js";
// ensureModMetadata is defined in this file, so no import needed.

// Create logger for instance handlers
const logger = createIpcLogger("Instance");
import { dedupeResourcepacks, dedupeShaders, dedupeDatapacks } from "./dedupe";
import {
  getInstances,
  getInstance,
  createInstance,
  updateInstance,
  deleteInstance,
  duplicateInstance,
  getInstancesDir,
  getInstanceDir,
  setInstanceIcon,
  type GameInstance,
  type CreateInstanceOptions,
  type UpdateInstanceOptions,
} from "../instances.js";
import { getConfig, getAppDataDir, getMinecraftDir } from "../config.js";
import { getSession, getApiToken } from "../auth.js";
import { refreshMicrosoftTokenIfNeeded } from "../auth-refresh.js";
import { API_URL } from "../lib/constants.js";
import {
  launchGame,
  isGameRunning,
  setProgressCallback,
  setGameLogCallback,
} from "../launcher.js";
import { downloadContentToInstance } from "../content.js";
import { updateRPC } from "../discord.js";
import { resolveTelemetryUserIdForSession } from "../telemetry.js";
import { getNativeModule } from "../native.js";
import { getLaunchPolicyForInstance } from "../../lib/launchPolicy";
import { registerInstancePackHandlers } from "./instance-pack-handlers.js";
import { registerInstanceCloudHandlers } from "./instance-cloud-handlers.js";
import { registerInstanceContentFileHandlers } from "./instance-content-file-handlers.js";
import { registerInstanceModHandlers } from "./instance-mod-handlers.js";

// Map to track active operations (e.g. content download)
const activeOperations = new Map<string, AbortController>();
const launchInProgress = new Set<string>();

function createThrottledProgressSender(
  channel: string,
  minIntervalMs = 120,
): (payload: any, force?: boolean) => void {
  let lastSentAt = 0;
  let lastKey = "";
  let lastType = "";

  return (payload: any, force = false) => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;

    const now = Date.now();
    const percent =
      typeof payload?.percent === "number"
        ? Math.round(payload.percent)
        : undefined;
    const current =
      typeof payload?.current === "number" ? payload.current : undefined;
    const total = typeof payload?.total === "number" ? payload.total : undefined;
    const type = String(payload?.type || "");
    const task = String(payload?.task || "");
    const file = String(payload?.filename || "");
    const key = `${type}|${task}|${percent ?? ""}|${current ?? ""}|${total ?? ""}|${file}`;

    const phaseChanged = !lastKey || type !== lastType;
    const milestone =
      percent === undefined ||
      percent === 0 ||
      percent === 100 ||
      percent % 5 === 0;
    const due = now - lastSentAt >= minIntervalMs;

    if (force || phaseChanged || (milestone && due) || (due && key !== lastKey)) {
      win.webContents.send(channel, payload);
      lastSentAt = now;
      lastKey = key;
      lastType = type;
    }
  };
}

import {
  LATEST_LOG_TAIL_MAX_BYTES,
  LATEST_LOG_TAIL_MAX_LINES,
  type ModMetadataCache,
  ModrinthAPI,
  calculateSha1,
  clearLauncherCaches,
  extractModInfo,
  fetchIconFromOnline,
  getIconFromCache,
  getModCacheKey,
  inspectPackMetadataWithNative,
  modMetadataCache,
  packFormatToVersion,
  pendingModrinthLookups,
  readUtf8LogTail,
  saveMetadataCache,
} from "./instance-handler-utils.js";

// Helper to ensure metadata is loaded (Local -> Hash -> Slug)
// Moved inside registerInstanceHandlers to access getMainWindow
export function registerInstanceHandlers(
  getMainWindow: () => BrowserWindow | null,
): void {
  logger.info("Registering instance IPC handlers...");
  // Use module-scope activeOperations (not shadowed) for cancellation

  async function ensureModMetadata(
    filePath: string,
    instanceId?: string,
    precalculatedSize?: number,
    precalculatedMtime?: string,
  ): Promise<ModMetadataCache> {
    const size =
      precalculatedSize !== undefined
        ? precalculatedSize
        : (await fs.promises.stat(filePath)).size;
    const mtime =
      precalculatedMtime !== undefined
        ? precalculatedMtime
        : (await fs.promises.stat(filePath)).mtime.toISOString();
    const cacheKey = getModCacheKey(filePath, size, mtime);
    let metadata = modMetadataCache.get(cacheKey);

    // 1. Check if complete
    if (metadata && (metadata.icon || metadata.modrinthId)) {
      return metadata;
    }

    // 2. Local Extraction
    if (!metadata) {
      metadata = await extractModInfo(filePath);
      modMetadataCache.set(cacheKey, metadata);
      saveMetadataCache(); // Save new local data
    }

    // 3. Modrinth Lookup (if no icon)
    // Note: We use "checked_missing" to distinguish from old "checked" status, forcing a re-check with new logic
    if (
      !metadata.icon &&
      metadata.modrinthId !== "checked_missing" &&
      metadata.modrinthId !== "found"
    ) {
      if (!pendingModrinthLookups.has(cacheKey)) {
        pendingModrinthLookups.add(cacheKey);

        // Fire and forget async lookup
        (async () => {
          try {
            // Need the mutable reference from the map to ensure we don't overwrite if it changed
            let currentMeta = modMetadataCache.get(cacheKey) || metadata;

            // Calculate Hash
            const hash = currentMeta.hash || (await calculateSha1(filePath));
            currentMeta.hash = hash;
            modMetadataCache.set(cacheKey, currentMeta);

            // Hash Lookup
            const modrinthResults = await ModrinthAPI.resolveHashes([hash]);
            if (modrinthResults[hash]) {
              currentMeta.modrinthIcon = modrinthResults[hash].icon;
              currentMeta.icon = modrinthResults[hash].icon;
              currentMeta.modrinthProjectId = modrinthResults[hash].projectId;
              currentMeta.modrinthId = "found";
              modMetadataCache.set(cacheKey, currentMeta);
              saveMetadataCache(); // Save found icon
              if (instanceId)
                getMainWindow()?.webContents.send(
                  "instance-mods-icons-updated",
                  instanceId,
                );
              return;
            }

            // Slug Lookup (Fallback)
            if (currentMeta.id) {
              const slugResults = await ModrinthAPI.resolveSlugs([
                currentMeta.id,
              ]);
              if (slugResults[currentMeta.id]) {
                currentMeta.modrinthIcon = slugResults[currentMeta.id].icon;
                currentMeta.icon = slugResults[currentMeta.id].icon;
                currentMeta.modrinthProjectId =
                  slugResults[currentMeta.id].projectId;
                currentMeta.modrinthId = "found";
                modMetadataCache.set(cacheKey, currentMeta);
                saveMetadataCache(); // Save found icon
                if (instanceId)
                  getMainWindow()?.webContents.send(
                    "instance-mods-icons-updated",
                    instanceId,
                  );
                return;
              }
            }

            // 4. Fallback: Search by Filename
            if (
              !currentMeta.icon ||
              currentMeta.modrinthId === "found_fuzzy" ||
              currentMeta.modrinthId === "checked"
            ) {
              const searchName =
                currentMeta.displayName || path.basename(filePath);

              if (currentMeta.modrinthId !== "found") {
                const foundData = await ModrinthAPI.searchByName(searchName);
                if (foundData) {
                  if (foundData.icon) currentMeta.icon = foundData.icon;
                  if (foundData.title)
                    currentMeta.displayName = foundData.title;
                  if (foundData.author) currentMeta.author = foundData.author;
                  if (foundData.description)
                    currentMeta.description = foundData.description;

                  currentMeta.modrinthId = "found_fuzzy";
                  modMetadataCache.set(cacheKey, currentMeta);
                  saveMetadataCache();
                  if (instanceId)
                    getMainWindow()?.webContents.send(
                      "instance-mods-icons-updated",
                      instanceId,
                    );
                  return;
                }
              }
            }

            // Mark checked (missing)
            currentMeta.modrinthId = "checked_missing";
            modMetadataCache.set(cacheKey, currentMeta);
            saveMetadataCache(); // Save checked status
          } catch (e) {
            logger.error(
              `[Mods] Failed async Modrinth lookup for ${filePath}:`,
              e,
            );
          } finally {
            pendingModrinthLookups.delete(cacheKey);
          }
        })();
      }
    }

    return metadata;
  }

  ipcMain.handle("launcher-clear-cache", async () => {
    try {
      const { deletedFiles } = clearLauncherCaches();

      try {
        await session.defaultSession.clearCache();
        await session.defaultSession.clearStorageData({
          storages: ["shadercache", "serviceworkers", "cachestorage"],
        });
      } catch (error) {
        logger.warn("[Cache] Failed to clear Electron session cache", {
          message: String(error),
        });
      }

      logger.info(
        `[Cache] Launcher cache cleared (files removed: ${deletedFiles.length})`,
      );
      return { ok: true, deletedFiles };
    } catch (error: any) {
      logger.error("Failed to clear launcher cache", error);
      return {
        ok: false,
        error: error?.message || "Failed to clear launcher cache",
      };
    }
  });

  // ----------------------------------------
  // Instance CRUD
  // ----------------------------------------

  ipcMain.handle(
    "instances-list",
    async (
      _event,
      offset?: number,
      limit?: number,
    ): Promise<GameInstance[]> => {
      return await getInstances(offset, limit);
    },
  );

  ipcMain.handle(
    "instances-create",
    async (_event, options: CreateInstanceOptions): Promise<GameInstance> => {
      return await createInstance(options);
    },
  );

  ipcMain.handle(
    "instances-get",
    async (_event, id: string): Promise<GameInstance | null> => {
      return getInstance(id);
    },
  );

  ipcMain.handle(
    "instances-update",
    async (
      _event,
      id: string,
      updates: UpdateInstanceOptions,
    ): Promise<GameInstance | null> => {
      const instance = getInstance(id);
      if (!instance) {
        logger.warn(` instances-update: Instance not found (ID: ${id})`);
        return null;
      }
      return await updateInstance(id, updates);
    },
  );

  ipcMain.handle(
    "instances-delete",
    async (_event, id: string): Promise<boolean> => {
      return await deleteInstance(id);
    },
  );


  ipcMain.handle(
    "instances-set-icon",
    async (_event, id: string, iconData: string) => {
      return await setInstanceIcon(id, iconData);
    },
  );

  ipcMain.handle(
    "instances-duplicate",
    async (_event, id: string): Promise<GameInstance | null> => {
      return duplicateInstance(id);
    },
  );

  ipcMain.handle(
    "instances-open-folder",
    async (_event, id: string): Promise<void> => {
      const dir = getInstanceDir(id);
      await shell.openPath(dir);
    },
  );

  // ----------------------------------------
  // Instance Launch
  // ----------------------------------------

  ipcMain.handle(
    "instance-cancel-action",
    async (_event, instanceId: string) => {
      if (activeOperations.has(instanceId)) {
        logger.info(` Cancelling operation for ${instanceId}`);
        activeOperations.get(instanceId)?.abort();
        return { ok: true };
      }
      return { ok: false, error: "No active operation found" };
    },
  );

  ipcMain.handle(
    "instances-launch",
    async (
      _event,
      id: string,
      options?: { skipServerModSync?: boolean },
    ) => {
    if (launchInProgress.has(id)) {
      return {
        ok: false,
        message: "Instance เธเธตเนเธเธณเธฅเธฑเธเน€เธ•เธฃเธตเธขเธกเน€เธเธดเธ”เธญเธขเธนเน เธเธฃเธธเธ“เธฒเธฃเธญเธชเธฑเธเธเธฃเธนเน",
      };
    }
    if (activeOperations.has(id)) {
      return {
        ok: false,
        message: "Instance เธเธตเนเธกเธตเธเธฒเธเธเธดเธเธเน/เธ•เธดเธ”เธ•เธฑเนเธเธเธณเธฅเธฑเธเธ—เธณเธเธฒเธเธญเธขเธนเน",
      };
    }

    launchInProgress.add(id);
    const sendLaunchProgress = createThrottledProgressSender("launch-progress");
    try {
    const mainWindow = getMainWindow();
    let instance = getInstance(id);
    if (!instance) {
      logger.warn(` instances-launch: Instance not found (ID: ${id})`);
      return { ok: false, message: "Instance เนเธกเนเธเธ" };
    }
    const launchPolicy = getLaunchPolicyForInstance(instance, options);

    let session = getSession();
    if (!session) return { ok: false, message: "เธเธฃเธธเธ“เธฒ login เธเนเธญเธ" };

    const refreshResult = await refreshMicrosoftTokenIfNeeded(logger);
    if (!refreshResult.ok) {
      return {
        ok: false,
        message:
          refreshResult.error ||
          "Microsoft session refresh failed. Please login again.",
      };
    }
    session = refreshResult.session || session;

    // Warning for CatID users on server modpacks
    if (
      launchPolicy.isServerBacked &&
      session?.type === "catid" &&
      !session.accessToken
    ) {
      sendLaunchProgress({
        type: "sync-warning",
        task: "เธเธธเธ“เธฅเนเธญเธเธญเธดเธเธ”เนเธงเธข CatID เธซเธฒเธเน€เธเธดเธฃเนเธเน€เธงเธญเธฃเนเน€เธเธดเธ”เนเธ—เน (online-mode) เธเธธเธ“เธญเธฒเธเธ–เธนเธเน€เธ•เธฐเธญเธญเธ (Invalid session)",
      }, true);
      await new Promise((r) => setTimeout(r, 3000));
    }

    if (isGameRunning(id))
      return { ok: false, message: "Instance เธเธตเนเธเธณเธฅเธฑเธเธ—เธณเธเธฒเธเธญเธขเธนเน" };

    void updateRPC("launching", instance.name, instance.icon);

    const config = getConfig();
    const ramMB = instance.ramMB || config.ramMB || 4096;

    // ----------------------------------------
    // Auto-Sync Server Mods
    // ----------------------------------------
    if (launchPolicy.shouldSyncServerMods) {
      let syncSession = getSession();
      let syncApiToken = syncSession?.apiToken;

      // If apiToken is expired/missing, try refreshing before giving up
      if (syncSession && !syncApiToken) {
        logger.info(
          "[Launch] apiToken expired/missing, attempting refresh before sync...",
        );
        const tokenRefresh = await refreshMicrosoftTokenIfNeeded(logger);
        if (tokenRefresh.ok) {
          syncSession = getSession();
          syncApiToken = syncSession?.apiToken;
        }
      }

      if (syncSession && syncApiToken) {
        try {
          const { syncServerMods } = await import("../cloud-instances.js");

          // Create cancel controller
          const controller = new AbortController();
          activeOperations.set(id, controller);

          // Initial Status
          sendLaunchProgress({
            type: "sync-start",
            task: "เธเธณเธฅเธฑเธเธ•เธฃเธงเธเธชเธญเธเธญเธฑเธเน€เธ”เธ•...",
          }, true);

          let syncTimeout: NodeJS.Timeout | null = null;
          try {
            syncTimeout = setTimeout(
              () => controller.abort(),
              10 * 60 * 1000,
            );
            await syncServerMods(
              id,
              syncApiToken,
              (progress) => {
                sendLaunchProgress(progress);
              },
              controller.signal,
            );
          } finally {
            if (syncTimeout) clearTimeout(syncTimeout);
            activeOperations.delete(id);
          }

          // Reload instance data after sync (in case loader/version changed)
          // Re-fetch fresh reference since updateInstance() replaces the object in the array
          const updatedInstance = getInstance(id);
          if (updatedInstance) {
            logger.info(
              `[Launch] Reloading instance data after sync for ${updatedInstance.name}`,
            );
            instance = updatedInstance;
          }

          // Notify frontend that instance data has changed (loader, version, etc.)
          mainWindow?.webContents.send("instances-updated");
        } catch (error: any) {
          if (error.message === "Cancelled") {
            sendLaunchProgress({
              type: "sync-error",
              task: "เธขเธเน€เธฅเธดเธเธเธฒเธฃเน€เธเนเธฒเน€เธฅเนเธเนเธฅเนเธง",
            }, true);
            return { ok: false, message: "Game launch cancelled" };
          }
          console.error("[Launch] Auto-sync failed:", error);
          // Decide strategy: Fail or Warn?
          // For now, let's log and continue (Offline mode support)
          // Optionally notify frontend of warning?
          sendLaunchProgress({
            type: "sync-warning",
            task: "เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธญเธฑเธเน€เธ”เธ•เนเธ”เน (เน€เธฅเนเธเนเธเธ Offline)",
          }, true);
          await new Promise((r) => setTimeout(r, 1000)); // Show warning briefly
        }
      } else if (syncSession && launchPolicy.isServerBacked) {
        // apiToken still missing after refresh โ€” warn user
        logger.warn(
          "[Launch] Cannot sync mods: apiToken unavailable after refresh attempt",
        );
        sendLaunchProgress({
          type: "sync-warning",
          task: "เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธ•เธฃเธงเธเธชเธญเธเธญเธฑเธเน€เธ”เธ•เนเธ”เน (เธเธฃเธธเธ“เธฒ login เนเธซเธกเน)",
        }, true);
        await new Promise((r) => setTimeout(r, 2000));
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
      sendLaunchProgress(progress);
    });

    setGameLogCallback((level, message) => {
      mainWindow?.webContents.send("game-log", { level, message });
    });

    // Use minecraftUuid if available (for CatID linked with Microsoft)
    const gameUuid = session.minecraftUuid || session.uuid;
    const telemetryUserId = await resolveTelemetryUserIdForSession(session);

    // Pass instanceId to launchGame (options cast to any in launcher.ts allows this)
    logger.info(
      `[Launch] Preparing to launch instance: ${instance.name} (${id})`,
    );
    logger.info(
      `[Launch] Type: ${launchPolicy.isServerBacked ? "Cloud/Server" : "Local"}`,
    );
    logger.info(
      `[Launch] Loader: ${instance.loader} Version: ${instance.loaderVersion}`,
    );
    logger.info(
      `[Launch] Mods Sync: ${launchPolicy.shouldSyncServerMods ? "Enabled" : "Disabled"}`,
    );

    // Validate loaderVersion for Forge/NeoForge
    // Valid formats: "47.4.0", "1.20.1-47.4.0"
    // Invalid: "1.20.1" (minecraft version only)
    let loaderBuild = instance.loaderVersion || "latest";
    if (
      (instance.loader === "forge" || instance.loader === "neoforge") &&
      loaderBuild !== "latest"
    ) {
      // If loaderVersion is EXACTLY the minecraft version (no forge version appended), it's wrong
      // Valid: "47.4.0" or "1.20.1-47.4.0"
      // Invalid: "1.20.1" (same as MC version)
      if (loaderBuild === instance.minecraftVersion) {
        logger.warn(
          `[Launch] Invalid loaderVersion "${loaderBuild}" for ${instance.loader}, using "latest"`,
        );
        loaderBuild = "latest";
      }
    }

    const launchOptions = {
      version: instance.minecraftVersion,
      username: session.username,
      uuid: gameUuid,
      accessToken: session.accessToken,
      telemetryUserId,
      ramMB,
      javaPath: instance.javaPath || config.javaPath,
      gameDirectory: instance.gameDirectory,
      loader:
        instance.loader !== "vanilla"
          ? {
              type: instance.loader,
              build: loaderBuild,
              enable: true,
            }
          : undefined,
      instanceId: id, // Pass ID for tracking
    };

    logger.info(`[Launch] Launch Options:`, { options: launchOptions });

    const result = await launchGame(launchOptions as any);

    setProgressCallback(null);

    if (result.ok) {
      void updateRPC("playing", instance.name, instance.icon);
      // Notify renderer that game has started (also sent from rustLauncher)
      mainWindow?.webContents.send("game-started", { instanceId: id });

      // Close/Hide launcher on successful game start based on config
      if (config.closeOnLaunch === "hide-reopen" && mainWindow) {
        mainWindow.hide();
      } else if (config.closeOnLaunch === "close" && mainWindow) {
        mainWindow.close();
      }
      // 'keep-open': do nothing

      // Track play time when game stops
      const startTime2 = Date.now();

      // Listen for game-stopped to update play time
      const updatePlayTime = () => {
        const mins = Math.round((Date.now() - startTime2) / 60000);
        if (mins > 0) {
          const curr = getInstance(id);
          if (curr)
            updateInstance(id, { totalPlayTime: curr.totalPlayTime + mins });
        }
      };

      // The game-stopped event is now sent from rustLauncher.ts via ipcMain.emit
      // We just need to track play time here
      const handler = (_e: any, data: { instanceId: string }) => {
        if (data && data.instanceId === id) {
          updatePlayTime();
          if (!isGameRunning()) {
            void updateRPC("idle");
          }
          ipcMain.removeListener("game-stopped", handler);
          clearTimeout(cleanupTimeout);
        }
      };

      ipcMain.on("game-stopped", handler);

      // Safety cleanup: remove listener after 24 hours to prevent leak
      const cleanupTimeout = setTimeout(
        () => {
          ipcMain.removeListener("game-stopped", handler);
        },
        24 * 60 * 60 * 1000,
      );
    } else if (!isGameRunning()) {
      void updateRPC("idle");
    }

    return result;
    } finally {
      setProgressCallback(null);
      launchInProgress.delete(id);
    }
  });

  ipcMain.handle("instance-join", async (_event, key: string) => {
    const { joinInstanceByKey } = await import("../cloud-instances.js");
    const { importCloudInstance } = await import("../instances.js");
    const { getApiToken } = await import("../auth.js");
    const session = getSession();

    if (!session) {
      return { ok: false, error: "เธเธฃเธธเธ“เธฒ login เธเนเธญเธ" };
    }

    const apiToken = getApiToken();
    if (!apiToken) {
      return { ok: false, error: "เนเธกเนเธกเธต API token - เธเธฃเธธเธ“เธฒ login เนเธซเธกเน" };
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
  registerInstanceModHandlers({
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
  });

  // ----------------------------------------
  // Resource Packs / Shaders / Datapacks / Logs
  // ----------------------------------------
  registerInstancePackHandlers({
    ipcMain,
    logger,
    getInstance,
    getInstancesDir,
    getNativeModule,
    dedupeResourcepacks,
    dedupeShaders,
    dedupeDatapacks,
    getIconFromCache,
    packFormatToVersion,
    inspectPackMetadataWithNative,
    fetchIconFromOnline,
    readUtf8LogTail,
    latestLogTailMaxLines: LATEST_LOG_TAIL_MAX_LINES,
    latestLogTailMaxBytes: LATEST_LOG_TAIL_MAX_BYTES,
  });

  // ----------------------------------------
  // Cloud Sync
  // ----------------------------------------
  registerInstanceCloudHandlers({
    ipcMain,
    getSession,
    getMainWindow,
    activeOperations,
  });

  // ----------------------------------------
  // Add Content File (Drag & Drop)
  // ----------------------------------------
  registerInstanceContentFileHandlers({
    ipcMain,
    logger,
    getInstance,
    getInstanceDir,
    getMainWindow,
    downloadContentToInstance,
  });
  logger.info(" Instance handlers registered");
}


