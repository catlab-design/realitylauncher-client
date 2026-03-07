/**
 * Cloud Instances Module
 *
 * Handles instance management via cloud API
 * Including joining instances via Invite Key
 */

import {
  downloadFile,
  verifyFileHash as verifyFileHashJs,
} from "./modrinth.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { getNativeModule } from "./native.js";

// Use production API URL (process.env doesn't work in bundled Electron)
import { API_URL } from "./lib/constants.js";
import { clearApiToken } from "./auth.js";
import { getConfig } from "./config.js";
// const API_URL = 'http://localhost:8787'; // Dev URL

/**
 * Verify that a JAR/ZIP file is valid (not corrupted)
 */
function isValidZipFile(filePath: string): boolean {
  try {
    const native = getNativeModule();
    const entries = native.listZipContents(filePath) as string[];
    return Array.isArray(entries);
  } catch {
    return false;
  }
}

type NormalizedExpectedHash = {
  algorithm: "sha1" | "sha256";
  hex: string;
};

let batchSha256Support: boolean | null = null;

function decodeHashBase64(value: string): Buffer | undefined {
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  if (!normalized) return undefined;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) return undefined;

  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    const decoded = Buffer.from(padded, "base64");
    if (decoded.length === 0) return undefined;
    const roundTrip = decoded.toString("base64").replace(/=+$/, "");
    const normalizedInput = padded.replace(/=+$/, "");
    if (roundTrip !== normalizedInput) return undefined;
    return decoded;
  } catch {
    return undefined;
  }
}

function normalizeExpectedHash(
  expectedHash?: string,
): NormalizedExpectedHash | undefined {
  if (!expectedHash) return undefined;
  let value = expectedHash.trim();
  if (!value) return undefined;

  const lower = value.toLowerCase();
  if (lower.startsWith("sha256:")) value = value.slice(7).trim();
  else if (lower.startsWith("sha-256:")) value = value.slice(8).trim();
  else if (lower.startsWith("sha1:")) value = value.slice(5).trim();
  else if (lower.startsWith("sha-1:")) value = value.slice(6).trim();

  if (value.startsWith("0x") || value.startsWith("0X")) {
    value = value.slice(2).trim();
  }

  if (/^[a-fA-F0-9]+$/.test(value)) {
    const hex = value.toLowerCase();
    if (hex.length === 64) return { algorithm: "sha256", hex };
    if (hex.length === 40) return { algorithm: "sha1", hex };
    return undefined;
  }

  const decoded = decodeHashBase64(value);
  if (!decoded) return undefined;
  if (decoded.length === 32) {
    return { algorithm: "sha256", hex: decoded.toString("hex") };
  }
  if (decoded.length === 20) {
    return { algorithm: "sha1", hex: decoded.toString("hex") };
  }
  return undefined;
}

async function detectBatchSha256Support(
  nativeModule: any,
): Promise<boolean> {
  if (batchSha256Support !== null) {
    return batchSha256Support;
  }

  if (typeof nativeModule?.verifyMultipleFileHashes !== "function") {
    batchSha256Support = false;
    return false;
  }

  const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "ml-batch-probe-"));
  const probeFile = path.join(probeDir, "sha256.txt");
  try {
    fs.writeFileSync(probeFile, "mlauncher-batch-sha256-probe");
    const impossibleHash = "0".repeat(64);
    const probeResults = (await nativeModule.verifyMultipleFileHashes([
      {
        filePath: probeFile,
        expectedSha256: impossibleHash,
      },
    ])) as Array<{ filePath: string; isValid: boolean }> | undefined;

    const probe = Array.isArray(probeResults)
      ? probeResults.find((row) => row.filePath === probeFile)
      : undefined;
    batchSha256Support = probe?.isValid === false;
  } catch (error) {
    console.warn(
      "[Cloud Sync] Failed to probe SHA-256 support in native batch verifier:",
      error,
    );
    batchSha256Support = false;
  } finally {
    try {
      fs.rmSync(probeDir, { recursive: true, force: true });
    } catch {}
  }

  return batchSha256Support;
}

async function logHashMismatchDiagnostic(
  filePath: string,
  filename: string,
  expectedHash?: string,
): Promise<void> {
  const normalized = normalizeExpectedHash(expectedHash);
  const algorithm = normalized?.algorithm || "unknown";
  const expected = normalized?.hex || expectedHash?.trim() || "n/a";
  let actual = "n/a";

  try {
    const native = getNativeModule() as any;
    if (algorithm === "sha256" && typeof native.calculateSha256 === "function") {
      actual = String((await native.calculateSha256(filePath)) || "n/a");
    } else if (
      algorithm === "sha1" &&
      typeof native.calculateSha1 === "function"
    ) {
      actual = String((await native.calculateSha1(filePath)) || "n/a");
    }
  } catch {
    // Keep n/a if debug hash calculation fails.
  }

  let bytes = "n/a";
  try {
    const stat = await fs.promises.stat(filePath);
    bytes = String(stat.size);
  } catch {
    // Ignore stat failures in debug logging path.
  }

  console.warn(
    `[Cloud Sync][Hash Debug] file=${filename} algo=${algorithm} expected=${expected} actual=${actual} bytes=${bytes}`,
  );
}

async function verifyFileHashNative(
  filePath: string,
  expectedHash?: string,
): Promise<boolean> {
  if (!expectedHash) return true;
  const normalized = normalizeExpectedHash(expectedHash);
  if (!normalized) {
    return verifyFileHashJs(filePath, expectedHash);
  }

  try {
    const native = getNativeModule();
    if (normalized.algorithm === "sha256") {
      return (await native.verifyFileHash(
        filePath,
        undefined,
        normalized.hex,
      )) as boolean;
    }

    return (await native.verifyFileHash(
      filePath,
      normalized.hex,
      undefined,
    )) as boolean;
  } catch {
    // Fall back to JS hash verification below.
  }

  return verifyFileHashJs(filePath, normalized.hex);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Cancelled");
  }
}

async function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  if (!signal) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return;
  }
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Cancelled"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(new Error("Cancelled"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  if (items.length === 0) return;

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;
  let firstError: Error | null = null;

  const runWorker = async () => {
    while (!firstError) {
      throwIfAborted(signal);
      const idx = cursor++;
      if (idx >= items.length) return;
      try {
        await worker(items[idx] as T);
      } catch (error: any) {
        if (!firstError) {
          firstError =
            error instanceof Error ? error : new Error(String(error));
        }
        return;
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  if (firstError) throw firstError;
  throwIfAborted(signal);
}

type ServerSyncMod = {
  filename: string;
  url?: string;
  size?: number;
  hash?: string;
};

type SyncProgressData = {
  type: string;
  task: string;
  current?: number;
  total?: number;
  percent?: number;
  filename?: string;
};

type ServerContentPayload = {
  manifestRevision?: string;
  urlsIncluded?: boolean;
  mods?: ServerSyncMod[];
};

type FastModListSnapshot = {
  manifestRevision: string;
  serverModsSignature: string;
  lockedModsSignature: string;
  localModsSignature: string;
};

const MANIFEST_CACHE_TTL_MS = 5 * 60 * 1000;
const instanceManifestCache = new Map<
  string,
  {
    revision: string;
    cachedAt: number;
    mods: ServerSyncMod[];
  }
>();
const joinedServersInFlight = new Map<
  string,
  Promise<{ owned: any[]; member: any[] }>
>();
const fastModListSyncCache = new Map<string, FastModListSnapshot>();

function normalizeServerMods(mods?: ServerSyncMod[]): ServerSyncMod[] {
  if (!mods || !Array.isArray(mods)) return [];
  const uniqueMods = new Map<string, ServerSyncMod>();
  for (const mod of mods) {
    if (!mod?.filename) continue;
    const normalizedUrl =
      typeof mod.url === "string" && mod.url.length > 0 ? mod.url : "";
    const normalizedSize =
      typeof mod.size === "number" && Number.isFinite(mod.size)
        ? mod.size
        : undefined;
    const normalizedHash =
      typeof mod.hash === "string" && mod.hash.trim().length > 0
        ? mod.hash.trim()
        : undefined;
    uniqueMods.set(mod.filename, {
      filename: mod.filename,
      url: normalizedUrl,
      size: normalizedSize,
      hash: normalizedHash,
    });
  }
  return Array.from(uniqueMods.values()).filter(
    (m) => !m.filename.endsWith(".keep"),
  );
}

function buildServerModsListSignature(mods: ServerSyncMod[]): string {
  const normalized = mods
    .map((mod) => mod.filename.replace(/\\/g, "/").trim().toLowerCase())
    .filter((filename) => filename.startsWith("mods/"))
    .map((filename) =>
      filename.endsWith(".jar.disabled")
        ? filename.slice(0, -".disabled".length)
        : filename,
    )
    .filter((filename) => filename.endsWith(".jar"))
    .sort();

  return normalized.join("|");
}

function buildLockedModsListSignature(lockedMods: string[]): string {
  return [...lockedMods]
    .map((name) => name.replace(/\\/g, "/").trim().toLowerCase())
    .map((name) => name.replace(/^mods\//, ""))
    .map((name) =>
      name.endsWith(".jar.disabled")
        ? name.slice(0, -".disabled".length)
        : name,
    )
    .sort()
    .join("|");
}

async function buildLocalModsListSignature(modsDir: string): Promise<string> {
  if (!fs.existsSync(modsDir)) {
    return "";
  }

  const files = await fs.promises.readdir(modsDir).catch(() => []);
  return files
    .filter((file) => file.endsWith(".jar") || file.endsWith(".jar.disabled"))
    .map((file) => file.replace(/\\/g, "/").trim().toLowerCase())
    .map((file) =>
      file.endsWith(".jar.disabled")
        ? file.slice(0, -".disabled".length)
        : file,
    )
    .map((file) => `mods/${file}`)
    .sort()
    .join("|");
}

async function tryDownloadQueueWithNativeBatch(
  nativeModule: any,
  gameDirectory: string,
  queue: ServerSyncMod[],
  downloadConcurrency: number,
  signal: AbortSignal | undefined,
  emitProgress: (data: SyncProgressData, force?: boolean) => void,
): Promise<boolean> {
  if (!Array.isArray(queue) || queue.length === 0) {
    return true;
  }
  if (typeof nativeModule?.downloadFiles !== "function") {
    return false;
  }

  const chunkSize = Math.max(
    1,
    Math.min(queue.length, Math.max(downloadConcurrency * 3, 18)),
  );
  let completedCount = 0;

  emitProgress(
    {
      type: "sync-download",
      task: "",
      current: 0,
      total: queue.length,
      percent: 0,
    },
    true,
  );

  for (let index = 0; index < queue.length; index += chunkSize) {
    throwIfAborted(signal);
    const chunk = queue.slice(index, index + chunkSize);
    const tasks = chunk.map((mod) => {
      const resolvedHash = normalizeExpectedHash(mod.hash);
      const task: {
        url: string;
        path: string;
        sha1?: string;
        sha256?: string;
        size?: number;
      } = {
        url: String(mod.url || ""),
        path: path.join(gameDirectory, mod.filename),
      };
      if (typeof mod.size === "number" && Number.isFinite(mod.size)) {
        task.size = Math.max(0, Math.floor(mod.size));
      }

      if (resolvedHash?.algorithm === "sha256") {
        task.sha256 = resolvedHash.hex;
      } else if (resolvedHash?.algorithm === "sha1") {
        task.sha1 = resolvedHash.hex;
      } else if (mod.hash) {
        task.sha1 = mod.hash;
      }

      return task;
    });

    if (tasks.some((task) => !task.url)) {
      return false;
    }

    const result = (await nativeModule.downloadFiles(
      tasks,
      downloadConcurrency,
    )) as
      | {
          success?: boolean;
          failed?: number;
          errors?: string[];
        }
      | undefined;

    if (!result?.success || Number(result.failed || 0) > 0) {
      console.warn(
        `[Cloud Sync] Native batch download failed for chunk ${
          index / chunkSize + 1
        }:`,
        result?.errors?.slice(0, 3) || result,
      );
      return false;
    }

    completedCount += chunk.length;
    emitProgress(
      {
        type: "sync-download",
        task: "",
        current: completedCount,
        total: queue.length,
        percent: Math.round((completedCount / queue.length) * 100),
      },
      true,
    );

    await yieldToEventLoop();
  }

  return true;
}

async function fetchServerContentPayload(
  cloudId: string,
  authToken: string,
  signal: AbortSignal | undefined,
  options?: { manifestOnly?: boolean; ifNoneMatch?: string },
): Promise<{ notModified: boolean; data: ServerContentPayload }> {
  const manifestOnly = options?.manifestOnly === true;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${authToken}`,
  };
  if (options?.ifNoneMatch) {
    headers["If-None-Match"] = `"${options.ifNoneMatch}"`;
  }

  const endpoint = manifestOnly
    ? `${API_URL}/instances/${cloudId}/content?manifest=1`
    : `${API_URL}/instances/${cloudId}/content`;
  const response = await fetch(endpoint, {
    headers,
    signal,
  });

  if (response.status === 304) {
    return { notModified: true, data: {} };
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Failed to fetch server content: ${response.statusText} (${response.status}) ${errText}`,
    );
  }

  const data = (await response.json()) as ServerContentPayload;
  return { notModified: false, data };
}

/**
 * Download file with soft hash check - warns on mismatch but doesn't fail
 * Used for cloud sync where hash in DB might be stale
 */
async function downloadFileWithSoftHashCheck(
  url: string,
  destPath: string,
  expectedHash?: string,
  signal?: AbortSignal,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const tmpPath = `${destPath}.tmp`;
  const destDir = path.dirname(destPath);
  throwIfAborted(signal);

  // Ensure directory exists before download
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  try {
    await downloadFile(
      url,
      tmpPath,
      (p) => {
        if (onProgress) onProgress(p.percent);
      },
      signal,
    );
    throwIfAborted(signal);

    // Verify hash but only warn on mismatch
    if (expectedHash) {
      const isValid = await verifyFileHashNative(tmpPath, expectedHash);
      throwIfAborted(signal);
      if (!isValid) {
        console.warn(
          `[Cloud Sync] Hash mismatch for ${path.basename(destPath)} - file may have been updated on server`,
        );
        // Don't throw - just warn and continue
      }
    }

    // For JAR files, verify the ZIP structure is valid
    if (destPath.endsWith(".jar")) {
      throwIfAborted(signal);
      if (!isValidZipFile(tmpPath)) {
        console.error(
          `[Cloud Sync] Downloaded file ${path.basename(destPath)} is corrupted (invalid ZIP structure)`,
        );
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        throw new Error(
          `Downloaded file is corrupted: ${path.basename(destPath)}`,
        );
      }
    }

    // Ensure directory still exists before rename (may have been deleted during download)
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    throwIfAborted(signal);

    // Verify tmp file exists before rename
    if (!fs.existsSync(tmpPath)) {
      throw new Error(
        `Download failed: temporary file not found for ${path.basename(destPath)}`,
      );
    }

    // Atomic rename
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    fs.renameSync(tmpPath, destPath);
  } catch (error) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    throw error;
  }
}

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

    if (manifestRes.notModified && fastCheck && fastCheck.canSkip) {
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

    let plannedByNative = false;
    if (
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

    const jsScanMods = plannedByNative ? [] : validServerMods;
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
