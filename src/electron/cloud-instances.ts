/**
 * Cloud Instances Module
 *
 * Handles instance management via cloud API
 * Including joining instances via Invite Key
 */

import { getNativeModule } from "./native.js";

// Use production API URL (process.env doesn't work in bundled Electron)
import { API_URL } from "./lib/constants.js";
import { clearApiToken } from "./auth.js";
import { getConfig } from "./config.js";
import {
  type FastModListSnapshot,
  type ServerContentPayload,
  type ServerSyncMod,
  type SyncProgressData,
  MANIFEST_CACHE_TTL_MS,
  buildLocalModsListSignature,
  buildLockedModsListSignature,
  buildServerModsListSignature,
  detectBatchSha256Support,
  downloadFileWithSoftHashCheck,
  fastModListSyncCache,
  fetchServerContentPayload,
  instanceManifestCache,
  isFreshCloudInstanceSync,
  isValidZipFile,
  joinedServersInFlight,
  logHashMismatchDiagnostic,
  normalizeExpectedHash,
  normalizeServerMods,
  runWithConcurrency,
  sleepWithAbort,
  throwIfAborted,
  tryDownloadQueueWithNativeBatch,
  verifyFileHashNative,
  yieldToEventLoop,
} from "./cloud-sync-utils.js";
// const API_URL = 'http://localhost:8787'; // Dev URL

interface JoinInstanceResult {
  ok: boolean;
  error?: string;
  message?: string;
  instance?: any;
}

/**
 * Join an instance using Invite Key
 *
 * @param key - Invite Key (e.g., "7TKM-3F7D-WDSW-8T2L")
 * @param authToken - User's authentication token
 * @returns Result object with instance data if successful
 */
export async function joinInstanceByKey(
  key: string,
  authToken: string,
): Promise<JoinInstanceResult> {
  try {
    // Format key: trim and uppercase only (preserve dashes/custom format)
    const formattedKey = key.trim().toUpperCase();

    console.log("[Cloud Instances] API_URL:", API_URL);
    console.log("[Cloud Instances] Joining instance with key:", formattedKey);
    console.log("[Cloud Instances] Auth token present:", !!authToken);

    const response = await fetch(`${API_URL}/instances/join`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ key: formattedKey }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log(
        "[Cloud Instances] Successfully joined instance:",
        data.instance?.name,
      );
      return {
        ok: true,
        message: data.message || "เข้าร่วม instance สำเร็จ",
        instance: data.instance,
      };
    } else {
      let errorMsg = "ไม่สามารถเข้าร่วม instance ได้";
      if (typeof data.error === "string") {
        errorMsg = data.error;
      } else if (
        data.error &&
        typeof data.error === "object" &&
        data.error.message
      ) {
        errorMsg = data.error.message;
      }

      console.error("[Cloud Instances] Failed to join:", data.error);
      return {
        ok: false,
        error: errorMsg,
      };
    }
  } catch (error: any) {
    console.error("[Cloud Instances] Network error:", error);
    return {
      ok: false,
      error: error.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ",
    };
  }
}

/**
 * Join a PUBLIC instance by ID (no key required)
 */
export async function joinPublicInstance(
  instanceId: string,
  authToken: string,
): Promise<JoinInstanceResult> {
  try {
    console.log("[Cloud Instances] Joining public instance:", instanceId);

    const response = await fetch(`${API_URL}/instances/${instanceId}/join`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (response.ok) {
      console.log("[Cloud Instances] Successfully joined public instance");
      return {
        ok: true,
        message: data.message || "เข้าร่วม instance สำเร็จ",
        instance: data.instance,
      };
    } else {
      let errorMsg = "ไม่สามารถเข้าร่วม instance ได้";
      if (typeof data.error === "string") {
        errorMsg = data.error;
      } else if (
        data.error &&
        typeof data.error === "object" &&
        data.error.message
      ) {
        errorMsg = data.error.message;
      }

      console.error("[Cloud Instances] Failed to join:", data.error);
      return {
        ok: false,
        error: errorMsg,
      };
    }
  } catch (error: any) {
    console.error("[Cloud Instances] Network error:", error);
    return {
      ok: false,
      error: error.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ",
    };
  }
}

/**
 * Leave an instance (remove from members)
 */
export async function leaveInstance(
  instanceId: string,
  authToken: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    console.log("[Cloud Instances] Leaving instance:", instanceId);

    const response = await fetch(`${API_URL}/instances/${instanceId}/leave`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (response.ok) {
      console.log("[Cloud Instances] Left instance successfully");
      return { ok: true };
    } else {
      console.error("[Cloud Instances] Failed to leave:", data.error);

      let errorMsg = "ไม่สามารถออกจาก instance ได้";
      if (typeof data.error === "string") {
        errorMsg = data.error;
      } else if (
        data.error &&
        typeof data.error === "object" &&
        data.error.message
      ) {
        errorMsg = data.error.message;
      }

      return { ok: false, error: errorMsg };
    }
  } catch (error: any) {
    console.error("[Cloud Instances] Network error:", error);
    return { ok: false, error: error.message };
  }
}

/**
 * Fetch all cloud instances (Owned & Member)
 */
export async function fetchJoinedServers(
  authToken: string,
  signal?: AbortSignal,
): Promise<{ owned: any[]; member: any[] }> {
  const fetchTask = async (): Promise<{ owned: any[]; member: any[] }> => {
    try {
      console.log("[Cloud Instances] Fetching instances...");
      console.log("[Cloud Instances] Auth token present:", !!authToken);
      const response = await fetch(`${API_URL}/instances`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        signal,
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error(
          "[Cloud Instances] Failed to fetch:",
          response.status,
          response.statusText,
          errBody,
        );
        if (response.status === 401) {
          clearApiToken();
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: any = await response.json();
      return {
        owned: data.owned || [],
        member: data.member || [],
      };
    } catch (error) {
      console.error("[Cloud Instances] Fetch error:", error);
      throw error;
    }
  };

  if (signal) {
    return fetchTask();
  }

  const inFlight = joinedServersInFlight.get(authToken);
  if (inFlight) {
    return inFlight;
  }

  const task = fetchTask().finally(() => {
    joinedServersInFlight.delete(authToken);
  });
  joinedServersInFlight.set(authToken, task);
  return task;
}

/**
 * Sync all cloud instances (Owned & Member) to local
 */
export async function syncCloudInstances(authToken: string): Promise<void> {
  try {
    const { importCloudInstance, getInstance } = await import("./instances.js");

    const data = await fetchJoinedServers(authToken);

    let count = 0;
    const allInstances = [...data.owned, ...data.member];

    // Only update EXISTING instances
    // New instances will stay "Available" (in cloud) but "Not Installed" (locally)
    // User must click "Install" to create them (via instances-cloud-install)

    for (const instance of allInstances) {
      const id = instance.storagePath || instance.id; // Correct ID derivation
      const existing = getInstance(id);

      if (existing) {
        // Instance exists locally - Update metadata
        await importCloudInstance(instance);
        count++;
      } else {
        // Instance does not exist locally - Skip
        // console.log(`[Cloud Instances] New instance found: ${instance.name}. Skipping auto-install.`);
      }
    }

    console.log(`[Cloud Instances] Synced (Updated) ${count} instances`);
  } catch (error) {
    console.error("[Cloud Instances] Sync error:", error);
  }
}

/**
 * Sync server mods (download updates, remove unknown)
 * Respects lockedMods to prevent deletion
 */
export async function syncServerMods(
  instanceId: string,
  authToken: string,
  onProgress?: (data: {
    type: string;
    task: string;
    current?: number;
    total?: number;
    percent?: number;
    filename?: string;
  }) => void,
  signal?: AbortSignal,
): Promise<void> {
  const { getInstance } = await import("./instances.js");
  // const { downloadFile } = await import("./modrinth.js"); // Removed, using top-level import
  const fs = await import("node:fs");
  const path = await import("node:path");

  const instance = getInstance(instanceId);
  if (!instance) {
    console.error(
      `[Cloud Sync] Instance ${instanceId} not found in local client.`,
    );
    throw new Error(`Instance ${instanceId} not found locally.`);
  }

  if (!instance.cloudId) {
    console.error(
      `[Cloud Sync] Instance ${instanceId} is not a cloud instance (missing cloudId).`,
      instance,
    );
    throw new Error(`Instance ${instanceId} is not linked to a cloud server.`);
  }

  // Reuse API_URL from top of file scope
  // Note: This relies on API_URL being available in module scope

  console.log(
    `[Cloud Sync] Syncing mods for ${instance.name} (${instance.id})...`,
  );
  let lastProgressSentAt = 0;
  let lastProgressKey = "";
  const emitProgress = (
    data: {
      type: string;
      task: string;
      current?: number;
      total?: number;
      percent?: number;
      filename?: string;
    },
    force = false,
  ) => {
    if (!onProgress) return;
    const now = Date.now();
    const percent =
      typeof data.percent === "number" ? Math.round(data.percent) : undefined;
    const current =
      typeof data.current === "number" ? Math.round(data.current) : undefined;
    const total =
      typeof data.total === "number" ? Math.round(data.total) : undefined;
    const key = `${data.type}|${data.task}|${percent ?? ""}|${current ?? ""}|${total ?? ""}|${data.filename || ""}`;

    const criticalType =
      data.type === "sync-start" ||
      data.type === "sync-complete" ||
      data.type === "sync-error" ||
      data.type === "cancelled";
    const due = now - lastProgressSentAt >= 120;
    const milestone =
      percent === undefined ||
      percent === 0 ||
      percent === 100 ||
      percent % 5 === 0;

    if (
      force ||
      criticalType ||
      (due && (milestone || key !== lastProgressKey))
    ) {
      lastProgressSentAt = now;
      lastProgressKey = key;
      onProgress(data);
    }
  };

  emitProgress({ type: "sync-start", task: "" }, true);

  if (signal?.aborted) throw new Error("Cancelled");

  try {
    // 1. Fetch Server Content Manifest (without signed URLs)
    // and metadata in parallel. This avoids heavy URL signing when no download is needed.
    const manifestCacheKey = instance.cloudId;
    const cachedManifest = instanceManifestCache.get(manifestCacheKey);
    const manifestCacheValid =
      !!cachedManifest &&
      Date.now() - cachedManifest.cachedAt <= MANIFEST_CACHE_TTL_MS;
    if (!manifestCacheValid && cachedManifest) {
      instanceManifestCache.delete(manifestCacheKey);
    }

    const [manifestRes, metaRes] = await Promise.all([
      fetchServerContentPayload(instance.cloudId, authToken, signal, {
        manifestOnly: true,
        ifNoneMatch: manifestCacheValid ? cachedManifest?.revision : undefined,
      }),
      fetch(`${API_URL}/instances/${instance.cloudId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
        signal,
      }),
    ]);

    // Process Metadata if available
    if (metaRes.ok) {
      try {
        const metaData = await metaRes.json();
        if (metaData && metaData.id) {
          const { importCloudInstance } = await import("./instances.js");
          await importCloudInstance(metaData);
          console.log(
            `[Cloud Sync] Updated instance metadata for ${instance.name}`,
          );
        }
      } catch (e) {
        console.error("[Cloud Sync] Failed to process metadata update:", e);
        // Continue with content sync even if metadata update fails
      }
    }

    let manifestData: ServerContentPayload;
    if (manifestRes.notModified && manifestCacheValid && cachedManifest) {
      manifestData = {
        manifestRevision: cachedManifest.revision,
        urlsIncluded: false,
        mods: cachedManifest.mods,
      };
    } else {
      manifestData = manifestRes.data;
      if (
        manifestData?.manifestRevision &&
        Array.isArray(manifestData?.mods)
      ) {
        instanceManifestCache.set(manifestCacheKey, {
          revision: manifestData.manifestRevision,
          cachedAt: Date.now(),
          mods: normalizeServerMods(manifestData.mods),
        });
      }
    }

    const validServerMods = normalizeServerMods(manifestData.mods);
    const nativeModule = getNativeModule() as any;
    const serverModFilenames = validServerMods.map((mod) => mod.filename);

    // Limit cleanup to mods directory ONLY to prevent deleting saves/configs/options
    const modsDir = path.join(instance.gameDirectory, "mods");
    if (!fs.existsSync(modsDir)) {
      await fs.promises.mkdir(modsDir, { recursive: true });
    }
    const isFreshCloudInstance = await isFreshCloudInstanceSync(
      instance.gameDirectory,
    );
    const serverModsSignature = buildServerModsListSignature(validServerMods);
    const lockedModsSignature = buildLockedModsListSignature(
      instance.lockedMods || [],
    );
    let fastCheck:
      | {
          canSkip?: boolean;
          snapshot?: {
            manifestRevision?: string;
            serverModsSignature?: string;
            lockedModsSignature?: string;
            localModsSignature?: string;
          };
        }
      | null = null;

    if (
      !isFreshCloudInstance &&
      typeof nativeModule.checkFastModListSync === "function" &&
      typeof manifestData?.manifestRevision === "string" &&
      manifestData.manifestRevision.length > 0
    ) {
      try {
        fastCheck = (await nativeModule.checkFastModListSync(
          instance.gameDirectory,
          manifestData.manifestRevision,
          serverModFilenames,
          instance.lockedMods || [],
        )) as {
          canSkip?: boolean;
          snapshot?: {
            manifestRevision?: string;
            serverModsSignature?: string;
            lockedModsSignature?: string;
            localModsSignature?: string;
          };
        };
      } catch (fastCheckError) {
        console.warn(
          "[Cloud Sync] Native fast mod list check failed, fallback to JS list compare:",
          fastCheckError,
        );
      }
    }

    if (
      !isFreshCloudInstance &&
      manifestRes.notModified &&
      fastCheck &&
      fastCheck.canSkip
    ) {
      console.log(
        `[Cloud Sync] Fast list match for ${instance.id}; skip deep file verification.`,
      );
      emitProgress(
        {
          type: "sync-check",
          task: "เธ•เธฃเธงเธเธชเธญเธเน€เธชเธฃเนเธเธชเธดเนเธ",
          current: 1,
          total: 1,
          percent: 100,
        },
        true,
      );
      emitProgress(
        {
          type: "sync-complete",
          task: "เธเธดเธเธเนเธเนเธญเธกเธนเธฅเธชเธณเน€เธฃเนเธ",
          percent: 100,
        },
        true,
      );
      return;
    }

    if (
      !isFreshCloudInstance &&
      manifestRes.notModified &&
      typeof manifestData?.manifestRevision === "string" &&
      manifestData.manifestRevision.length > 0 &&
      serverModsSignature.length > 0
    ) {
      const fastSnapshot = fastModListSyncCache.get(instance.id);
      if (
        fastSnapshot &&
        fastSnapshot.manifestRevision === manifestData.manifestRevision &&
        fastSnapshot.serverModsSignature === serverModsSignature &&
        fastSnapshot.lockedModsSignature === lockedModsSignature
      ) {
        const localModsSignature = await buildLocalModsListSignature(modsDir);
        if (localModsSignature === fastSnapshot.localModsSignature) {
          console.log(
            `[Cloud Sync] Fast list match for ${instance.id}; skip deep file verification.`,
          );
          emitProgress(
            {
              type: "sync-check",
              task: "ตรวจสอบเสร็จสิ้น",
              current: 1,
              total: 1,
              percent: 100,
            },
            true,
          );
          emitProgress(
            {
              type: "sync-complete",
              task: "ซิงค์ข้อมูลสำเร็จ",
              percent: 100,
            },
            true,
          );
          return;
        }
      }
    }

    emitProgress({ type: "sync-check", task: "" });

    // 2. Download missing/updated files (ANY file in the instance)
    // Path traversal protection: ensure all files stay within game directory
    const gameDirResolved = path.resolve(instance.gameDirectory);

    const launcherConfig = getConfig();
    const configuredConcurrency = Number(
      launcherConfig.maxConcurrentDownloads || 8,
    );
    const downloadConcurrency = Math.max(
      1,
      Math.min(16, configuredConcurrency),
    );
    const hashConcurrency = Math.max(1, Math.min(8, downloadConcurrency));

    const finalQueue: Array<{
      filename: string;
      url?: string;
      size?: number;
      hash?: string;
    }> = [];
    const hashCheckQueue: Array<{
      mod: { filename: string; url?: string; size?: number; hash?: string };
      filePath: string;
    }> = [];

    if (isFreshCloudInstance) {
      console.log(
        `[Cloud Sync] Skipping deep verification for fresh cloud instance ${instance.id}; queueing ${validServerMods.length} files directly.`,
      );
      finalQueue.push(...validServerMods);
    }

    let plannedByNative = false;
    if (
      !isFreshCloudInstance &&
      typeof nativeModule.planServerSyncDownloads === "function" &&
      validServerMods.length > 0
    ) {
      try {
        emitProgress(
          {
            type: "sync-check",
            task: "กำลังตรวจสอบไฟล์ทั้งหมด...",
            current: 0,
            total: validServerMods.length,
            percent: 0,
          },
          true,
        );

        const planned = await nativeModule.planServerSyncDownloads(
          instance.gameDirectory,
          validServerMods,
        );
        if (planned?.downloadQueue && Array.isArray(planned.downloadQueue)) {
          finalQueue.push(...planned.downloadQueue);
          plannedByNative = true;
          if (
            typeof planned.inspected === "number" &&
            planned.inspected > 0 &&
            planned.downloadQueue.length === planned.inspected
          ) {
            console.warn(
              `[Cloud Sync] Native planner queued all files (${planned.downloadQueue.length}/${planned.inspected}). Possible hash algorithm/format mismatch.`,
            );
          }
          emitProgress(
            {
              type: "sync-check",
              task: "ตรวจสอบเสร็จสิ้น",
              current:
                typeof planned.inspected === "number"
                  ? planned.inspected
                  : validServerMods.length,
              total: validServerMods.length,
              percent: 100,
            },
            true,
          );
        }
      } catch (plannerError) {
        console.warn(
          "[Cloud Sync] Native sync planner failed, falling back to JS path:",
          plannerError,
        );
      }
    }

    const jsScanMods =
      isFreshCloudInstance || plannedByNative ? [] : validServerMods;
    if (jsScanMods.length > 0) {
      let inspectedMods = 0;
      for (const mod of jsScanMods) {
      inspectedMods += 1;
      if (inspectedMods % 25 === 0) {
        await yieldToEventLoop();
      }
      throwIfAborted(signal);
      const filePath = path.resolve(instance.gameDirectory, mod.filename);

      if (
        !filePath.startsWith(gameDirResolved + path.sep) &&
        filePath !== gameDirResolved
      ) {
        console.warn(
          `[Cloud Sync] BLOCKED path traversal attempt: ${mod.filename}`,
        );
        continue;
      }

      const dir = path.dirname(filePath);
      try {
        const dirExists = await fs.promises
          .access(dir)
          .then(() => true)
          .catch(() => false);
        if (!dirExists) await fs.promises.mkdir(dir, { recursive: true });
      } catch (err) {
        console.error(`[Cloud Sync] Failed to create directory ${dir}:`, err);
      }

      const fileExists = await fs.promises
        .access(filePath)
        .then(() => true)
        .catch(() => false);
      if (!fileExists) {
        finalQueue.push(mod);
        continue;
      }

      if (filePath.endsWith(".jar") && !isValidZipFile(filePath)) {
        console.warn(
          `[Cloud Sync] ${mod.filename} is corrupted, will re-download`,
        );
        try {
          await fs.promises.unlink(filePath);
        } catch {}
        finalQueue.push(mod);
        continue;
      }

      if (mod.size) {
        try {
          const stats = await fs.promises.stat(filePath);
          if (stats.size !== mod.size) {
            finalQueue.push(mod);
            continue;
          }
        } catch (err) {
          console.error(`[Cloud Sync] Failed to stat ${filePath}:`, err);
          finalQueue.push(mod);
          continue;
        }
      }

      if (mod.hash) {
        hashCheckQueue.push({ mod, filePath });
        continue;
      }
    }

    if (hashCheckQueue.length > 0) {
      let hashDebugLogged = 0;
      emitProgress(
        {
          type: "sync-check",
          task: "กำลังตรวจสอบไฟล์ทั้งหมด...",
          current: 0,
          total: hashCheckQueue.length,
          percent: 0,
        },
        true,
      );

      try {
        const native = await import("./native.js");
        const nativeModule = native.getNativeModule();
        const hasSha256Tasks = hashCheckQueue.some(
          (item) => normalizeExpectedHash(item.mod.hash)?.algorithm === "sha256",
        );
        if (hasSha256Tasks) {
          const sha256Ready = await detectBatchSha256Support(nativeModule);
          if (!sha256Ready) {
            throw new Error("NATIVE_BATCH_SHA256_UNSUPPORTED");
          }
        }

        // Chunk the hashing tasks to prevent blocking the event loop
        const CHUNK_SIZE = 15;
        let validCount = 0;
        let invalidCount = 0;
        let hashProcessedCount = 0;
        const batchInvalidMods: Array<{
          filename: string;
          url?: string;
          size?: number;
          hash?: string;
        }> = [];

        for (let i = 0; i < hashCheckQueue.length; i += CHUNK_SIZE) {
          throwIfAborted(signal);
          const chunk = hashCheckQueue.slice(i, i + CHUNK_SIZE);
          const tasks = chunk.map((item) => {
            const normalized = normalizeExpectedHash(item.mod.hash);
            if (normalized?.algorithm === "sha256") {
              return {
                filePath: item.filePath,
                expectedSha256: normalized.hex,
              };
            }
            if (normalized?.algorithm === "sha1") {
              return {
                filePath: item.filePath,
                expectedSha1: normalized.hex,
              };
            }
            return {
              filePath: item.filePath,
              expectedSha1: item.mod.hash,
            };
          });

          const hashResults = await nativeModule.verifyMultipleFileHashes(
            tasks,
          ) as Array<{
            filePath: string;
            isValid: boolean;
          }>;
          const hashResultByPath = new Map(
            hashResults.map((result) => [result.filePath, result]),
          );

          for (const item of chunk) {
            const result = hashResultByPath.get(item.filePath);
            if (result && !result.isValid) {
              console.warn(
                `[Cloud Sync] Hash mismatch for ${item.mod.filename}, re-downloading.`,
              );
              if (hashDebugLogged < 3) {
                await logHashMismatchDiagnostic(
                  item.filePath,
                  item.mod.filename,
                  item.mod.hash,
                );
                hashDebugLogged += 1;
              }
              batchInvalidMods.push(item.mod);
              invalidCount++;
            } else {
              validCount++;
            }
          }

          hashProcessedCount += chunk.length;
          emitProgress(
            {
              type: "sync-check",
              task: "กำลังตรวจสอบไฟล์ทั้งหมด...",
              current: hashProcessedCount,
              total: hashCheckQueue.length,
              percent: Math.round(
                (hashProcessedCount / hashCheckQueue.length) * 100,
              ),
            },
            true,
          );

          // Give time for UI feedback and event loop processing
          await yieldToEventLoop();
        }

        if (invalidCount === hashCheckQueue.length && hashCheckQueue.length > 0) {
          const sample = hashCheckQueue.slice(0, Math.min(3, hashCheckQueue.length));
          let sampleDirectValid = 0;
          for (const sampleItem of sample) {
            throwIfAborted(signal);
            if (
              await verifyFileHashNative(sampleItem.filePath, sampleItem.mod.hash)
            ) {
              sampleDirectValid += 1;
            }
          }

          if (sampleDirectValid > 0) {
            console.warn(
              `[Cloud Sync] Batch hash looked inconsistent (${sampleDirectValid}/${sample.length} sample valid via direct check). Rechecking in compatibility mode...`,
            );
            batchInvalidMods.length = 0;
            validCount = 0;
            invalidCount = 0;

            let compatibilityChecked = 0;
            for (const item of hashCheckQueue) {
              throwIfAborted(signal);
              const isValid = await verifyFileHashNative(
                item.filePath,
                item.mod.hash,
              );
              compatibilityChecked += 1;
              if (!isValid) {
                batchInvalidMods.push(item.mod);
                invalidCount += 1;
                if (hashDebugLogged < 3) {
                  await logHashMismatchDiagnostic(
                    item.filePath,
                    item.mod.filename,
                    item.mod.hash,
                  );
                  hashDebugLogged += 1;
                }
              } else {
                validCount += 1;
              }

              if (compatibilityChecked % 25 === 0) {
                await yieldToEventLoop();
              }
            }
          }
        }

        finalQueue.push(...batchInvalidMods);

        console.log(
          `[Cloud Sync] Batch hash complete. Checked: ${hashCheckQueue.length}, Valid: ${validCount}, Invalid: ${invalidCount}`,
        );

        emitProgress(
          {
            type: "sync-check",
            task: "ตรวจสอบเสร็จสิ้น",
            current: hashCheckQueue.length,
            total: hashCheckQueue.length,
            percent: 100,
          },
          true,
          );
      } catch (e) {
        const message = String((e as any)?.message || e || "");
        if (message.includes("NATIVE_BATCH_SHA256_UNSUPPORTED")) {
          console.warn(
            "[Cloud Sync] Native batch SHA-256 verifier is not reliable in this runtime. Using direct verifier for this sync.",
          );
        } else {
          console.error(
            "[Cloud Sync] Failed to use batch hasher, falling back to sequential:",
            e,
          );
        }
        // Fallback to sequential if the native batch fails
        let hashChecked = 0;
        await runWithConcurrency(
          hashCheckQueue,
          hashConcurrency,
          async ({ mod, filePath }) => {
            throwIfAborted(signal);
            const isValid = await verifyFileHashNative(filePath, mod.hash);
            throwIfAborted(signal);
            hashChecked += 1;
            if (!isValid) {
              console.warn(
                `[Cloud Sync] Hash mismatch for ${mod.filename}, re-downloading.`,
              );
              if (hashDebugLogged < 3) {
                await logHashMismatchDiagnostic(filePath, mod.filename, mod.hash);
                hashDebugLogged += 1;
              }
              finalQueue.push(mod);
            }
            emitProgress({
              type: "sync-check",
              task: "",
              current: hashChecked,
              total: hashCheckQueue.length,
              percent: Math.round((hashChecked / hashCheckQueue.length) * 100),
            });
          },
          signal,
        );
      }
    }

    }

    if (finalQueue.length > 0 && finalQueue.some((m) => !m.url)) {
      const fullContentRes = await fetchServerContentPayload(
        instance.cloudId,
        authToken,
        signal,
        { manifestOnly: false },
      );
      const fullContentMods = normalizeServerMods(fullContentRes.data?.mods);
      if (
        fullContentRes.data?.manifestRevision &&
        fullContentMods.length > 0
      ) {
        instanceManifestCache.set(manifestCacheKey, {
          revision: fullContentRes.data.manifestRevision,
          cachedAt: Date.now(),
          mods: fullContentMods,
        });
      }

      const fullByFilename = new Map<string, ServerSyncMod>(
        fullContentMods.map((mod) => [mod.filename, mod]),
      );
      const unresolved: string[] = [];
      for (const queuedMod of finalQueue) {
        if (queuedMod.url) continue;
        const full = fullByFilename.get(queuedMod.filename);
        if (!full?.url) {
          unresolved.push(queuedMod.filename);
          continue;
        }
        queuedMod.url = full.url;
        if (queuedMod.size === undefined) queuedMod.size = full.size;
        if (!queuedMod.hash && full.hash) queuedMod.hash = full.hash;
      }

      if (unresolved.length > 0) {
        throw new Error(
          `Missing download URLs for ${unresolved.length} files`,
        );
      }
    }

    console.log(
      `[Cloud Sync] Downloading ${finalQueue.length} files with concurrency=${downloadConcurrency}...`,
    );

    let downloadedByNative = false;
    if (finalQueue.length > 0) {
      try {
        downloadedByNative = await tryDownloadQueueWithNativeBatch(
          nativeModule,
          instance.gameDirectory,
          finalQueue,
          downloadConcurrency,
          signal,
          emitProgress,
        );
      } catch (nativeDownloadError) {
        console.warn(
          "[Cloud Sync] Native batch downloader failed, fallback to JS downloads:",
          nativeDownloadError,
        );
        downloadedByNative = false;
      }
    }

    if (!downloadedByNative) {
      let completedCount = 0;
      await runWithConcurrency(
        finalQueue,
        downloadConcurrency,
        async (mod) => {
          throwIfAborted(signal);
          const destPath = path.join(instance.gameDirectory, mod.filename);
          let attempts = 0;
          const maxAttempts = 3;

          while (attempts < maxAttempts) {
            throwIfAborted(signal);
            try {
              attempts++;
              const downloadUrl = mod.url;
              if (!downloadUrl) {
                throw new Error(`Missing URL for ${mod.filename}`);
              }
              await downloadFileWithSoftHashCheck(
                downloadUrl,
                destPath,
                mod.hash,
                signal,
                (percent) => {
                  if (finalQueue.length > 0) {
                    const blended = Math.round(
                      ((completedCount + percent / 100) / finalQueue.length) *
                        100,
                    );
                    emitProgress({
                      type: "sync-download",
                      task: "",
                      filename: mod.filename,
                      current: completedCount,
                      total: finalQueue.length,
                      percent: blended,
                    });
                  }
                },
              );

              completedCount++;
              const overallPercent =
                finalQueue.length > 0
                  ? Math.round((completedCount / finalQueue.length) * 100)
                  : 100;
              emitProgress({
                type: "sync-download",
                task: "",
                filename: mod.filename,
                current: completedCount,
                total: finalQueue.length,
                percent: overallPercent,
              });
              return;
            } catch (err: any) {
              throwIfAborted(signal);

              if (
                typeof err?.message === "string" &&
                err.message.includes("Cancelled")
              ) {
                throw err;
              }

              console.warn(
                `[Cloud Sync] Download failed for ${mod.filename} (Attempt ${attempts}/${maxAttempts}): ${err?.message || err} | URL=${mod.url}`,
              );

              if (attempts >= maxAttempts) {
                console.error(
                  `[Cloud Sync] Gave up on ${mod.filename} after ${maxAttempts} attempts.`,
                );
                throw err;
              }

              const delay = Math.random() * 1000 + attempts * 1000;
              await sleepWithAbort(delay, signal);
            }
          }
        },
        signal,
      );
    }
    throwIfAborted(signal);

    // 3. Delete extra mods (Respect Locked Mods, ONLY in mods folder)
    if (!isFreshCloudInstance) {
      throwIfAborted(signal);
    emitProgress({ type: "sync-clean", task: "กำลังลบไฟล์ส่วนเกิน..." }, true);

    let cleanedByNative = false;
    if (typeof nativeModule.cleanupExtraMods === "function") {
      try {
        const cleanupResult = await nativeModule.cleanupExtraMods(
          instance.gameDirectory,
          validServerMods.map((m) => m.filename),
          instance.lockedMods || [],
        );
        cleanedByNative = true;
        if (cleanupResult && typeof cleanupResult.deleted === "number") {
          console.log(
            `[Cloud Sync] Native cleanup complete. deleted=${cleanupResult.deleted}, keptLocked=${cleanupResult.keptLocked || 0}`,
          );
        }
      } catch (cleanupError) {
        console.warn(
          "[Cloud Sync] Native cleanup failed, falling back to JS cleanup:",
          cleanupError,
        );
      }
    }

    // Only scan mods folder for cleanup (fallback path)
    if (!cleanedByNative && fs.existsSync(modsDir)) {
      const localFiles = fs
        .readdirSync(modsDir)
        .filter((f) => f.endsWith(".jar") || f.endsWith(".jar.disabled"));
      // Server files that are in the mods/ directory
      // We expect server filename to be "mods/foo.jar".
      // We compare "mods/" + localName with serverFilename.
      const serverModPaths = new Set(
        validServerMods.map((m) => m.filename.replace(/\\/g, "/")),
      );
      const lockedMods = new Set(instance.lockedMods || []);

      let cleanedCount = 0;
      for (const file of localFiles) {
        cleanedCount += 1;
        if (cleanedCount % 25 === 0) {
          await yieldToEventLoop();
        }
        throwIfAborted(signal);
        const relativePath = `mods/${file}`; // Path relative to instance root
        const realName = file.replace(".jar.disabled", ".jar");
        const realRelativePath = `mods/${realName}`;

        // Check if this file (or its enabled version) is in the server list
        if (
          !serverModPaths.has(relativePath) &&
          !serverModPaths.has(realRelativePath)
        ) {
          if (lockedMods.has(file) || lockedMods.has(realName)) {
            console.log(`[Cloud Sync] Keeping locked mod: ${file}`);
            continue;
          }

          console.log(
            `[Cloud Sync] Removing extra mod: ${file} (Not in server list: ${Array.from(serverModPaths).slice(0, 3).join(", ")}...)`,
          );
          try {
            fs.unlinkSync(path.join(modsDir, file));
          } catch (unlinkErr: any) {
            // File may be locked by game process
            console.warn(
              `[Cloud Sync] Could not delete ${file}: ${unlinkErr.message}. File may be in use.`,
            );
          }
        } else {
          // console.log(`[Cloud Sync] Keeping server mod: ${file}`);
        }
      }
    }

    }

    if (
      typeof manifestData?.manifestRevision === "string" &&
      manifestData.manifestRevision.length > 0 &&
      serverModsSignature.length > 0
    ) {
      let savedByNative = false;
      if (
        typeof nativeModule.saveFastModListSyncSnapshot === "function" &&
        fastCheck?.snapshot
      ) {
        try {
          await nativeModule.saveFastModListSyncSnapshot(
            instance.gameDirectory,
            fastCheck.snapshot,
          );
          savedByNative = true;
        } catch (fastSaveError) {
          console.warn(
            "[Cloud Sync] Failed to persist native fast list snapshot, fallback to JS cache:",
            fastSaveError,
          );
        }
      }

      if (!savedByNative) {
        const localModsSignature = await buildLocalModsListSignature(modsDir);
        fastModListSyncCache.set(instance.id, {
          manifestRevision: manifestData.manifestRevision,
          serverModsSignature,
          lockedModsSignature,
          localModsSignature,
        });
      }
    }

    console.log("[Cloud Sync] Sync complete.");
    emitProgress(
      {
        type: "sync-complete",
        task: "ซิงค์ข้อมูลสำเร็จ",
        percent: 100,
      },
      true,
    );
  } catch (error: any) {
    const message = String(error?.message || "");
    const cancelled =
      signal?.aborted ||
      message.includes("Cancelled") ||
      message.includes("cancelled");
    if (cancelled) {
      emitProgress({ type: "cancelled", task: "ยกเลิกการดาวน์โหลดแล้ว" }, true);
      throw new Error("Cancelled");
    }
    console.error("[Cloud Sync] Error:", error);
    emitProgress(
      { type: "sync-error", task: "เกิดข้อผิดพลาดในการซิงค์" },
      true,
    );
    throw error;
  }
}
