import {
  downloadFile,
  verifyFileHash as verifyFileHashJs,
} from "./modrinth.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { getNativeModule } from "./native.js";

import { API_URL } from "./lib/constants.js";

/**
 * Verify that a JAR/ZIP file is valid (not corrupted)
 */
export function isValidZipFile(filePath: string): boolean {
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

export function normalizeExpectedHash(
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

export async function detectBatchSha256Support(
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

export async function logHashMismatchDiagnostic(
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

export async function verifyFileHashNative(
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

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Cancelled");
  }
}

export async function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
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

export async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

export async function runWithConcurrency<T>(
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

export type ServerSyncMod = {
  filename: string;
  url?: string;
  size?: number;
  hash?: string;
};

export type SyncProgressData = {
  type: string;
  task: string;
  current?: number;
  total?: number;
  percent?: number;
  filename?: string;
};

export type ServerContentPayload = {
  manifestRevision?: string;
  urlsIncluded?: boolean;
  mods?: ServerSyncMod[];
};

export type FastModListSnapshot = {
  manifestRevision: string;
  serverModsSignature: string;
  lockedModsSignature: string;
  localModsSignature: string;
};

export const MANIFEST_CACHE_TTL_MS = 5 * 60 * 1000;
export const instanceManifestCache = new Map<
  string,
  {
    revision: string;
    cachedAt: number;
    mods: ServerSyncMod[];
  }
>();
export const joinedServersInFlight = new Map<
  string,
  Promise<{ owned: any[]; member: any[] }>
>();
export const fastModListSyncCache = new Map<string, FastModListSnapshot>();
const FRESH_CLOUD_INSTANCE_ALLOWED_FILES = new Set(["instance.json"]);
const FRESH_CLOUD_INSTANCE_ALLOWED_DIRS = new Set([
  "mods",
  "config",
  "saves",
  "resourcepacks",
  "shaderpacks",
  "datapacks",
  "logs",
  "crash-reports",
]);

export function normalizeServerMods(mods?: ServerSyncMod[]): ServerSyncMod[] {
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

export function buildServerModsListSignature(mods: ServerSyncMod[]): string {
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

export function buildLockedModsListSignature(lockedMods: string[]): string {
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

export async function buildLocalModsListSignature(modsDir: string): Promise<string> {
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

export async function isFreshCloudInstanceSync(gameDirectory: string): Promise<boolean> {
  const entries = await fs.promises.readdir(gameDirectory, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const entryPath = path.join(gameDirectory, entry.name);
    if (entry.isDirectory()) {
      if (!FRESH_CLOUD_INSTANCE_ALLOWED_DIRS.has(entry.name)) {
        return false;
      }

      const childEntries = await fs.promises.readdir(entryPath);
      if (childEntries.length > 0) {
        return false;
      }
      continue;
    }

    if (entry.isFile() && FRESH_CLOUD_INSTANCE_ALLOWED_FILES.has(entry.name)) {
      continue;
    }

    return false;
  }

  return true;
}

export async function tryDownloadQueueWithNativeBatch(
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

export async function fetchServerContentPayload(
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
export async function downloadFileWithSoftHashCheck(
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
