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
import archiver from "archiver";
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

// Map to track active exports for cancellation: instanceId -> { abort: () => void }
const activeExports = new Map<string, { abort: () => void }>();

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

type NativePackKind = "resource" | "shader" | "datapack";

async function inspectPackMetadataWithNative(
  filePath: string,
  kind: NativePackKind,
): Promise<{
  icon: string | null;
  version?: string;
  packFormat?: number;
}> {
  try {
    const native = getNativeModule() as any;
    if (typeof native.inspectPackMetadata !== "function") {
      return { icon: null };
    }

    const result = (await native.inspectPackMetadata(
      filePath,
      kind,
    )) as {
      iconBase64?: string | null;
      version?: string | null;
      packFormat?: number | null;
    };

    return {
      icon:
        typeof result?.iconBase64 === "string" && result.iconBase64.length > 0
          ? `data:image/png;base64,${result.iconBase64}`
          : null,
      version: result?.version || undefined,
      packFormat:
        typeof result?.packFormat === "number"
          ? result.packFormat
          : undefined,
    };
  } catch {
    return { icon: null };
  }
}

// Maximum cache sizes to prevent unbounded memory growth
const MAX_MOD_METADATA_CACHE = 5000;
const MAX_MODRINTH_PROJECT_CACHE = 2000;
const MAX_ICON_CACHE = 3000;

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
  version?: string;
  modrinthProjectId?: string;
  curseforgeProjectId?: string;
}
const modMetadataCache = new Map<string, ModMetadataCache>();
// Persistent Cache Logic
const METADATA_CACHE_FILE = "metadata-cache.json";
let metadataCacheLoaded = false;
let saveTimeout: NodeJS.Timeout | null = null;

function getMetadataCachePath() {
  return path.join(getAppDataDir(), METADATA_CACHE_FILE);
}

function loadMetadataCache() {
  if (metadataCacheLoaded) return;
  try {
    const cachePath = getMetadataCachePath();
    if (fs.existsSync(cachePath)) {
      const data = fs.readFileSync(cachePath, "utf-8");
      const json = JSON.parse(data);
      for (const [key, value] of Object.entries(json)) {
        modMetadataCache.set(key, value as ModMetadataCache);
      }
    }
  } catch (e) {
    logger.error("Failed to load metadata cache", e as Error);
  }
  metadataCacheLoaded = true;
}

function saveMetadataCache() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      evictMapIfNeeded(modMetadataCache, MAX_MOD_METADATA_CACHE);
      evictMapIfNeeded(modrinthProjectCache, MAX_MODRINTH_PROJECT_CACHE);
      const cachePath = getMetadataCachePath();
      const obj = Object.fromEntries(modMetadataCache);
      fs.writeFileSync(cachePath, JSON.stringify(obj));
    } catch (e) {
      logger.error("Failed to save metadata cache", e as Error);
    }
  }, 2000);
}

loadMetadataCache();

/**
 * Evict oldest entries from a Map when it exceeds maxSize.
 * Uses FIFO (first-inserted keys are deleted first).
 */
function evictMapIfNeeded<K, V>(map: Map<K, V>, maxSize: number): void {
  if (map.size <= maxSize) return;
  const keysToDelete = Array.from(map.keys()).slice(0, map.size - maxSize);
  for (const key of keysToDelete) {
    map.delete(key);
  }
}

// Cache for project info (ID/Slug -> icon URL & project ID)
const modrinthProjectCache = new Map<
  string,
  { icon: string | null; id: string }
>();

// Cache for content icon (shaders, resourcepacks) - name -> icon URL
// Cache expires after 24 hours to allow refresh while persisting across restarts
const contentIconCache = new Map<
  string,
  {
    url: string | null;
    modrinthId?: string;
    curseforgeId?: string;
    timestamp: number;
  }
>();
const ICON_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours (persistent cache)

// Persistent Icon Cache Logic
const ICON_CACHE_FILE = "icon-cache.json";
let iconCacheLoaded = false;
let iconSaveTimeout: NodeJS.Timeout | null = null;

function getIconCachePath() {
  return path.join(getAppDataDir(), ICON_CACHE_FILE);
}

function loadIconCache() {
  if (iconCacheLoaded) return;
  try {
    const cachePath = getIconCachePath();
    if (existsSync(cachePath)) {
      const data = readFileSync(cachePath, "utf-8");
      const json = JSON.parse(data);
      const now = Date.now();
      for (const [key, value] of Object.entries(json)) {
        const entry = value as { url: string | null; timestamp: number };
        // Only load entries that haven't expired
        if (now - entry.timestamp < ICON_CACHE_TTL) {
          contentIconCache.set(key, entry);
        }
      }
      logger.info(
        `[IconCache] Loaded ${contentIconCache.size} cached icons from disk`,
      );
    }
  } catch (e) {
    logger.error("Failed to load icon cache", e as Error);
  }
  iconCacheLoaded = true;
}

function saveIconCache() {
  if (iconSaveTimeout) clearTimeout(iconSaveTimeout);
  iconSaveTimeout = setTimeout(() => {
    try {
      evictMapIfNeeded(contentIconCache, MAX_ICON_CACHE);
      const cachePath = getIconCachePath();
      const obj = Object.fromEntries(contentIconCache);
      writeFileSync(cachePath, JSON.stringify(obj));
    } catch (e) {
      logger.error("Failed to save icon cache", e as Error);
    }
  }, 3000);
}

loadIconCache();

function clearLauncherCaches() {
  const config = getConfig();
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  if (iconSaveTimeout) {
    clearTimeout(iconSaveTimeout);
    iconSaveTimeout = null;
  }

  modMetadataCache.clear();
  modrinthProjectCache.clear();
  contentIconCache.clear();
  pendingModrinthLookups.clear();

  const deletedFiles: string[] = [];
  const cacheFiles = [getMetadataCachePath(), getIconCachePath()];
  for (const cachePath of cacheFiles) {
    try {
      if (existsSync(cachePath)) {
        rmSync(cachePath, { force: true });
        deletedFiles.push(cachePath);
      }
    } catch (error) {
      logger.warn(`[Cache] Failed to remove cache file: ${cachePath}`, {
        message: String(error),
      });
    }
  }

  const cacheDirs = [
    path.join(getAppDataDir(), "cache"),
    path.join(getAppDataDir(), "webcache"),
    path.join(getMinecraftDir(), "cache"),
    path.join(app.getPath("userData"), "Cache"),
    path.join(app.getPath("userData"), "Code Cache"),
    path.join(app.getPath("userData"), "GPUCache"),
    path.join(app.getPath("userData"), "DawnCache"),
    path.join(app.getPath("userData"), "GrShaderCache"),
    path.join(app.getPath("userData"), "GraphiteDawnCache"),
    path.join(app.getPath("userData"), "Service Worker", "CacheStorage"),
  ];
  if (config.cacheDir) {
    cacheDirs.push(config.cacheDir);
  }

  const protectedDirs = new Set(
    [getAppDataDir(), getMinecraftDir(), app.getPath("userData")].map((dir) =>
      path.resolve(dir),
    ),
  );

  for (const cacheDir of cacheDirs) {
    try {
      const resolved = path.resolve(cacheDir);
      if (protectedDirs.has(resolved)) {
        logger.warn(`[Cache] Skip protected dir: ${resolved}`);
        continue;
      }
      if (existsSync(resolved)) {
        rmSync(resolved, { recursive: true, force: true });
        deletedFiles.push(resolved);
      }
    } catch (error) {
      logger.warn(`[Cache] Failed to remove cache dir: ${cacheDir}`, {
        message: String(error),
      });
    }
  }

  return { deletedFiles };
}

// Periodically purge expired content icon cache entries
setInterval(
  () => {
    const now = Date.now();
    for (const [key, val] of contentIconCache) {
      if (now - val.timestamp > ICON_CACHE_TTL) {
        contentIconCache.delete(key);
      }
    }
  },
  60 * 60 * 1000,
); // Every 1 hour

function getIconFromCache(
  key: string,
):
  | { url: string | null; modrinthId?: string; curseforgeId?: string }
  | undefined {
  const cached = contentIconCache.get(key);
  if (!cached) return undefined; // Not in cache
  if (Date.now() - cached.timestamp > ICON_CACHE_TTL) {
    contentIconCache.delete(key);
    return undefined; // Expired
  }
  return {
    url: cached.url,
    modrinthId: cached.modrinthId,
    curseforgeId: cached.curseforgeId,
  };
}

function setIconCache(
  key: string,
  url: string | null,
  modrinthId?: string,
  curseforgeId?: string,
): void {
  contentIconCache.set(key, {
    url,
    modrinthId,
    curseforgeId,
    timestamp: Date.now(),
  });
  saveIconCache(); // Persist to disk
}

// ========================================
// Pack Format -> Minecraft Version Mapping
// ========================================
function packFormatToVersion(
  format: number,
  type: "resource" | "data" = "resource",
): string {
  if (type === "resource") {
    const resourcePackFormats: Record<number, string> = {
      1: "1.6.1 โ€“ 1.8.9",
      2: "1.9 โ€“ 1.10.2",
      3: "1.11 โ€“ 1.12.2",
      4: "1.13 โ€“ 1.14.4",
      5: "1.15 โ€“ 1.16.1",
      6: "1.16.2 โ€“ 1.16.5",
      7: "1.17 โ€“ 1.17.1",
      8: "1.18 โ€“ 1.18.2",
      9: "1.19 โ€“ 1.19.2",
      12: "1.19.3",
      13: "1.19.4",
      15: "1.20 โ€“ 1.20.1",
      18: "1.20.2",
      22: "1.20.3 โ€“ 1.20.4",
      32: "1.20.5 โ€“ 1.20.6",
      34: "1.21 โ€“ 1.21.1",
      42: "1.21.2 โ€“ 1.21.3",
      46: "1.21.4",
      48: "1.21.5",
    };
    return resourcePackFormats[format] || `Format ${format}`;
  } else {
    const dataPackFormats: Record<number, string> = {
      4: "1.13 โ€“ 1.14.4",
      5: "1.15 โ€“ 1.16.1",
      6: "1.16.2 โ€“ 1.16.5",
      7: "1.17 โ€“ 1.17.1",
      8: "1.18 โ€“ 1.18.1",
      9: "1.18.2",
      10: "1.19 โ€“ 1.19.3",
      12: "1.19.4",
      15: "1.20 โ€“ 1.20.1",
      18: "1.20.2",
      26: "1.20.3 โ€“ 1.20.4",
      41: "1.20.5 โ€“ 1.20.6",
      48: "1.21 โ€“ 1.21.1",
      57: "1.21.2 โ€“ 1.21.3",
      61: "1.21.4",
      71: "1.21.5",
    };
    return dataPackFormats[format] || `Format ${format}`;
  }
}

/**
 * Calculate similarity ratio between two strings (0-1)
 */
function stringSimilarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;

  // Check if one contains the other
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }

  // Simple word-based matching
  const words1 = s1.split(/\s+/).filter((w) => w.length > 2);
  const words2 = s2.split(/\s+/).filter((w) => w.length > 2);
  if (words1.length === 0 || words2.length === 0) return 0;

  let matches = 0;
  for (const w1 of words1) {
    for (const w2 of words2) {
      if (w1.includes(w2) || w2.includes(w1)) {
        matches++;
        break;
      }
    }
  }
  return matches / Math.max(words1.length, words2.length);
}

/**
 * Fetch icon from Modrinth first, then CurseForge if not found
 * Uses strict matching to avoid wrong icons
 * @param name - Content name to search for
 * @param contentType - "shader" | "resourcepack"
 * @returns Icon URL or null if not found
 */
async function fetchIconFromOnline(
  name: string,
  contentType: "shader" | "resourcepack",
): Promise<{ url: string | null; modrinthId?: string; curseforgeId?: string }> {
  // Check cache first
  const cacheKey = `${contentType}:${name.toLowerCase()}`;
  const cached = getIconFromCache(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  // Clean up name for search (remove version numbers, special chars)
  const cleanName = name
    .replace(/[-_]?v?\d+\.\d+(\.\d+)?[-_]?/gi, " ") // Remove version numbers like v2.0.4
    .replace(/\(.*?\)/g, " ") // Remove parentheses content
    .replace(/[-_+]/g, " ") // Replace separators with spaces
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .trim();

  // Extract main name (first significant part)
  const mainName = cleanName.split(/\s+/).slice(0, 3).join(" ");

  if (!mainName || mainName.length < 3) {
    setIconCache(cacheKey, null);
    return { url: null };
  }

  const projectType = contentType === "shader" ? "shader" : "resourcepack";
  const normalizedSearch = mainName.toLowerCase();

  try {
    // Try Modrinth first
    const modrinthUrl = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(mainName)}&facets=[["project_type:${projectType}"]]&limit=5`;
    const modrinthRes = await fetch(modrinthUrl, {
      headers: { "User-Agent": "Reality-Launcher/1.0" },
    });

    if (modrinthRes.ok) {
      const modrinthData = await modrinthRes.json();
      if (modrinthData.hits && modrinthData.hits.length > 0) {
        // Find best match with strict criteria
        let bestMatch: any = null;
        let bestScore = 0;

        for (const hit of modrinthData.hits) {
          const hitTitle = (hit.title || "").toLowerCase();
          const hitSlug = (hit.slug || "").toLowerCase().replace(/-/g, " ");

          // Calculate similarity scores
          const titleScore = stringSimilarity(normalizedSearch, hitTitle);
          const slugScore = stringSimilarity(normalizedSearch, hitSlug);
          const score = Math.max(titleScore, slugScore);

          // Require reasonable similarity (50%+) to use online icon
          if (score > bestScore && score >= 0.5 && hit.icon_url) {
            bestScore = score;
            bestMatch = hit;
          }
        }

        if (bestMatch) {
          logger.debug(
            `[IconFetch] Found Modrinth icon for "${name}" (score: ${bestScore.toFixed(2)}): ${bestMatch.icon_url}`,
          );
          setIconCache(cacheKey, bestMatch.icon_url, bestMatch.project_id);
          return { url: bestMatch.icon_url, modrinthId: bestMatch.project_id };
        }
      }
    }

    // Try CurseForge as fallback with same strict matching
    const cfClassId = contentType === "shader" ? 6552 : 12;
    const cfUrl = `https://api.curseforge.com/v1/mods/search?gameId=432&classId=${cfClassId}&searchFilter=${encodeURIComponent(mainName)}&pageSize=5`;
    const cfRes = await fetch(cfUrl, {
      headers: {
        "x-api-key":
          "$2a$10$bL4bIL5pUWqfcO7KQtnMReakwtfHbNKh6v1uTpKlzhwoueEJQnPnm",
        Accept: "application/json",
      },
    });

    if (cfRes.ok) {
      const cfData = await cfRes.json();
      if (cfData.data && cfData.data.length > 0) {
        let bestMatch: any = null;
        let bestScore = 0;

        for (const mod of cfData.data) {
          const modName = (mod.name || "").toLowerCase();
          const modSlug = (mod.slug || "").toLowerCase().replace(/-/g, " ");

          const nameScore = stringSimilarity(normalizedSearch, modName);
          const slugScore = stringSimilarity(normalizedSearch, modSlug);
          const score = Math.max(nameScore, slugScore);

          if (score > bestScore && score >= 0.5 && mod.logo?.url) {
            bestScore = score;
            bestMatch = mod;
          }
        }

        if (bestMatch) {
          logger.debug(
            `[IconFetch] Found CurseForge icon for "${name}" (score: ${bestScore.toFixed(2)}): ${bestMatch.logo.url}`,
          );
          setIconCache(
            cacheKey,
            bestMatch.logo.url,
            undefined,
            String(bestMatch.id),
          );
          return {
            url: bestMatch.logo.url,
            curseforgeId: String(bestMatch.id),
          };
        }
      }
    }
  } catch (error) {
    logger.warn(`[IconFetch] Failed to fetch icon for "${name}":`, {
      error: String(error),
    });
  }

  // Cache null to avoid re-fetching
  logger.debug(`[IconFetch] No match found for "${name}", using local icon`);
  setIconCache(cacheKey, null);
  return { url: null };
}

function getModCacheKey(filepath: string, size: number, mtime: string): string {
  // Strip .disabled suffix to maintain same cache key when toggled
  const cleanPath = filepath.endsWith(".disabled")
    ? filepath.slice(0, -".disabled".length)
    : filepath;
  return `${cleanPath}|${size}|${mtime}`;
}

async function calculateSha1(filePath: string): Promise<string> {
  try {
    const native = getNativeModule();
    const hash = (await native.calculateSha1(filePath)) as string | null;
    if (hash) return hash;
  } catch {
    // Fallback to JS hashing below.
  }

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
      let json: any;
      try {
        json = JSON.parse(content);
      } catch (parseErr) {
        logger.warn(
          `[ModInfo] Failed to parse fabric.mod.json in ${jarPath}:`,
          { error: String(parseErr) },
        );
        return {};
      }

      let icon: string | undefined;
      if (json.icon) {
        const iconEntry = zip.getEntry(json.icon);
        if (iconEntry) {
          const iconData = iconEntry.getData();
          const mimeType = json.icon.endsWith(".png")
            ? "image/png"
            : "image/jpeg";
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
          ? json.authors
              .map((a: any) => (typeof a === "string" ? a : a?.name || ""))
              .filter(Boolean)
              .join(", ")
          : json.authors || "Unknown",
        description: json.description,
        icon,
        version: json.version,
      };
    }

    // Try Forge mod
    const forgeEntry = zip.getEntry("META-INF/mods.toml");
    if (forgeEntry) {
      const content = forgeEntry.getData().toString("utf8");
      const modIdMatch = content.match(/modId\s*=\s*"([^"]+)"/);
      const displayNameMatch = content.match(/displayName\s*=\s*"([^"]+)"/);
      const authorsMatch = content.match(/authors\s*=\s*"([^"]+)"/);
      const versionMatch = content.match(/version\s*=\s*"([^"]+)"/);
      const descMatch =
        content.match(/description\s*=\s*'''([^']+)'''/s) ||
        content.match(/description\s*=\s*"([^"]+)"/);
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

      let version = versionMatch?.[1];
      if (version === "${file.jarVersion}") {
        version = undefined;
      }

      return {
        id: modIdMatch?.[1],
        displayName: displayNameMatch?.[1] || modIdMatch?.[1],
        author: authorsMatch?.[1],
        description: descMatch?.[1]?.trim(),
        version,
        icon,
      };
    }

    return {};
  } catch (e) {
    logger.error(`[ModInfo] Failed to extract info from ${jarPath}:`, e);
    return {};
  }
}

// ========================================
// Modrinth API Helper
// ========================================
const ModrinthAPI = {
  async resolveHashes(
    hashes: string[],
  ): Promise<Record<string, { icon: string; projectId: string }>> {
    if (hashes.length === 0) return {};

    const results: Record<string, { icon: string; projectId: string }> = {};
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
            "User-Agent":
              "RealityLauncher/0.0.1 (help@reality.catlabdesign.space)",
          },
          body: JSON.stringify({ hashes: chunk, algorithm: "sha1" }),
        });

        if (!resp.ok) continue;

        const versions = (await resp.json()) as Record<string, any>;
        const projectIdsToFetch = new Set<string>();
        const hashToProjectId: Record<string, string> = {};

        for (const [hash, version] of Object.entries(versions)) {
          if (version.project_id) {
            hashToProjectId[hash] = version.project_id;
            // check memory cache first
            if (!modrinthProjectCache.has(version.project_id)) {
              projectIdsToFetch.add(version.project_id);
            } else {
              const cached = modrinthProjectCache.get(version.project_id)!;
              results[hash] = { icon: cached.icon!, projectId: cached.id };
            }
          }
        }

        // 2. Fetch Project Info for unknown IDs
        const ids = Array.from(projectIdsToFetch);
        if (ids.length > 0) {
          const projectResp = await fetch(
            `https://api.modrinth.com/v2/projects?ids=${JSON.stringify(ids)}`,
            {
              headers: { "User-Agent": "RealityLauncher/0.0.1" },
            },
          );

          if (projectResp.ok) {
            const projects = (await projectResp.json()) as any[];
            for (const proj of projects) {
              modrinthProjectCache.set(proj.id, {
                icon: proj.icon_url,
                id: proj.id,
              });
            }
          }
        }

        // 3. Assemble results
        for (const [hash, pid] of Object.entries(hashToProjectId)) {
          const cached = modrinthProjectCache.get(pid);
          if (cached && cached.icon) {
            results[hash] = { icon: cached.icon, projectId: cached.id };
          }
        }
      } catch (err) {
        logger.error("[Modrinth] Failed to resolve batch:", err);
      }
    }
    return results;
  },

  async resolveSlugs(
    slugs: string[],
  ): Promise<Record<string, { icon: string; projectId: string }>> {
    if (slugs.length === 0) return {};
    const results: Record<string, { icon: string; projectId: string }> = {};

    // Chunk slugs (50 at a time)
    const chunks = [];
    for (let i = 0; i < slugs.length; i += 50) {
      chunks.push(slugs.slice(i, i + 50));
    }

    for (const chunk of chunks) {
      try {
        // Check cache first
        const toFetch = chunk.filter((id) => !modrinthProjectCache.has(id));
        chunk.forEach((id) => {
          const cached = modrinthProjectCache.get(id);
          if (cached && cached.icon)
            results[id] = { icon: cached.icon, projectId: cached.id };
        });

        if (toFetch.length === 0) continue;

        const resp = await fetch(
          `https://api.modrinth.com/v2/projects?ids=${JSON.stringify(toFetch)}`,
          {
            headers: { "User-Agent": "RealityLauncher/0.0.1" },
          },
        );

        if (resp.ok) {
          const projects = (await resp.json()) as any[];
          for (const proj of projects) {
            const data = { icon: proj.icon_url, id: proj.id };
            modrinthProjectCache.set(proj.id, data); // ID
            modrinthProjectCache.set(proj.slug, data); // Slug
            if (data.icon) {
              results[proj.slug] = { icon: data.icon, projectId: data.id };
              results[proj.id] = { icon: data.icon, projectId: data.id };
            }
          }
        }
      } catch (e) {
        logger.error("[Modrinth] Failed to resolve slugs:", e);
      }
    }
    return results;
  },

  async searchByName(name: string): Promise<any | null> {
    try {
      // Clean up name for search (improved v3)
      // Remove version patterns like: 1.0.0, v1.2.3, -beta.1, _1.20.1
      const versionRegex = /(?:v?[\d]+\.[\d]+(?:[\._-][\w\d]+)*)/g;

      const cleanName = name
        .replace(/\.jar(\.disabled)?$/, "")
        .replace(/[\(\[\{].*?[\)\]\}]/g, "") // Remove (...) content
        .replace(versionRegex, "") // Remove complex versions
        .replace(/([a-z])([A-Z])/g, "$1 $2") // CamelCase -> Camel Case
        .replace(/[-_]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (cleanName.length < 3) {
        logger.debug(
          `[Modrinth] Search skipped (too short): "${name}" -> "${cleanName}"`,
        );
        return null;
      }

      const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(cleanName)}&facets=[["project_type:mod"]]&limit=1`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "RealityLauncher/0.0.1" },
      });

      if (resp.ok) {
        const data = (await resp.json()) as any;
        if (data.hits && data.hits.length > 0) {
          const hit = data.hits[0];
          if (hit.title) {
            logger.debug(
              `[Modrinth] Search success: "${name}" -> Clean: "${cleanName}" -> Found: "${hit.title}"`,
            );
            return {
              icon: hit.icon_url,
              title: hit.title,
              author: hit.author,
              description: hit.description,
            };
          } else if (hit.icon_url) {
            return { icon: hit.icon_url };
          }
        } else {
          logger.debug(
            `[Modrinth] Search failed for "${name}" -> Clean: "${cleanName}"`,
          );
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  },
};

// Helper to ensure metadata is loaded (Local -> Hash -> Slug)
const pendingModrinthLookups = new Set<string>();

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
    "fetch-instance-agendas",
    async (_event, instanceId: string) => {
      console.log("[IPC] fetch-instance-agendas called for:", instanceId);
      const token = getApiToken();
      if (!token) return { ok: false, error: "Unauthorized" };

      // Resolve cloudId if possible
      const instance = getInstance(instanceId);
      const targetId = instance?.cloudId || instanceId;

      logger.info(
        `Fetching agendas for instance: ${instanceId} (Target: ${targetId})`,
      );

      try {
        const response = await fetch(
          `${API_URL}/instances/${targetId}/agendas`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const data = await response.json();
        if (response.ok) {
          return { ok: true, agendas: data.agendas || [] };
        } else {
          if (response.status === 401) {
            const { clearApiToken } = await import("../auth.js");
            clearApiToken();
          }
          return {
            ok: false,
            error: (data as any).error || "Failed to fetch agendas",
          };
        }
      } catch (error) {
        logger.error(
          `[Agendas] Failed to fetch agendas for ${instanceId}:`,
          error as Error,
        );
        return { ok: false, error: String(error) };
      }
    },
  );

  ipcMain.handle("fetch-all-agendas", async () => {
    const token = getApiToken();
    if (!token) return { ok: false, error: "Unauthorized" };

    logger.info("Fetching all agendas for current user");

    try {
      const response = await fetch(`${API_URL}/instances/all`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data: any = await response.json();
      if (response.ok) {
        logger.info(
          `Successfully fetched ${data.agendas?.length || 0} agendas globally`,
        );
        return { ok: true, agendas: data.agendas || [] };
      } else {
        logger.warn(`Global agenda fetch failed (${response.status}):`, data);
        return {
          ok: false,
          error: data.error || "Failed to fetch all agendas",
        };
      }
    } catch (error: any) {
      logger.error("Exception fetching all agendas:", error);
      return { ok: false, error: error.message };
    }
  });

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
      const modEntries = (await fs.promises.readdir(modsDir))
        .filter((f) => f.endsWith(".jar") || f.endsWith(".jar.disabled"))
        .map((filename) => ({ filename }));

      // Return quickly using cached/native metadata, then hydrate in background.
      const CONCURRENCY = 8;
      const LOOKUP_BATCH_PER_CALL = 10;
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

            let name = file;
            let enabled = true;
            if (file.endsWith(".jar.disabled")) {
              name = file.replace(".jar.disabled", "");
              enabled = false;
            } else if (file.endsWith(".jar")) {
              name = file.replace(".jar", "");
            }

            const metadata = seeded;
            const lookupPending = pendingModrinthLookups.has(cacheKey);
            const needsLookup = !isMetadataResolved(metadata);
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
    "instances-export-cancel",
    async (_event, instanceId: string) => {
      const exportTask = activeExports.get(instanceId);
      if (exportTask) {
        exportTask.abort();
        activeExports.delete(instanceId);
        logger.info(`Export cancelled for instance ${instanceId}`);
        return { ok: true };
      }
      return { ok: false, error: "No active export found" };
    },
  );

  ipcMain.handle(
    "instances-export",
    async (event, id: string, options: any) => {
      // Compatibility check: if options is string, treating it as format (old way)
      // unlikely if frontend is updated, but good for safety
      let format = "zip";
      let exportOptions: any = {};

      if (typeof options === "string") {
        format = options as any;
        exportOptions = {
          format,
          name: "",
          version: "1.0.0",
          includedPaths: ["mods", "config", "resourcepacks", "shaderpacks"],
        };
      } else {
        exportOptions = options;
        format = exportOptions.format;
      }

      const sender = event.sender;
      const instance = getInstance(id);
      if (!instance) {
        return { ok: false, error: "Instance not found" };
      }

      const mainWindow = BrowserWindow.fromWebContents(sender);
      if (!mainWindow) return { ok: false, error: "Window not found" };

      // Helper to check if file should be included
      const shouldInclude = (relativePath: string, isDir: boolean): boolean => {
        // Normalize to forward slashes for consistent comparison
        // (UI sends forward-slash paths, but path.relative() on Windows returns backslashes)
        const normalizedPath = relativePath.replace(/\\/g, "/");

        // Always exclude these
        const excludedPrefixes = [
          "session.lock",
          "logs",
          "cache",
          "webcache",
          "natives",
          "assets",
        ];
        for (const prefix of excludedPrefixes) {
          if (
            normalizedPath === prefix ||
            normalizedPath.startsWith(prefix + "/")
          ) {
            return false;
          }
        }

        // If includedPaths is defined, filter by it
        if (
          exportOptions.includedPaths &&
          exportOptions.includedPaths.length > 0
        ) {
          // includedPaths can contain EITHER:
          //   - Folder names like "mods", "config" (when file tree hasn't loaded yet)
          //   - Individual file paths like "mods/fabric-api.jar" (after file tree expansion)
          //
          // We need to handle both cases:
          //   1. normalizedPath matches an entry exactly (file or folder selected)
          //   2. normalizedPath starts with an entry + "/" (file is inside a selected folder)
          //   3. An entry starts with normalizedPath + "/" (selected files are inside this dir)

          const isIncluded = exportOptions.includedPaths.some((p: string) => {
            // Exact match (works for both files and folders)
            if (normalizedPath === p) return true;
            // This path is inside a selected folder (e.g. path="mods/x.jar", p="mods")
            if (normalizedPath.startsWith(p + "/")) return true;
            // A selected file is inside this directory (e.g. path="mods", p="mods/x.jar")
            if (p.startsWith(normalizedPath + "/")) return true;
            return false;
          });
          return isIncluded;
        }

        return true; // Default include if no filter
      };

      const calculateDirSize = (dir: string): number => {
        let size = 0;
        if (!fs.existsSync(dir)) return 0;
        try {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            const fullPath = path.join(dir, file);
            const relPath = path.relative(getInstanceDir(id), fullPath);

            // Check inclusion logic
            if (!shouldInclude(relPath, fs.statSync(fullPath).isDirectory())) {
              continue;
            }

            const stats = fs.statSync(fullPath);
            if (stats.isDirectory()) {
              size += calculateDirSize(fullPath);
            } else {
              size += stats.size;
            }
          }
        } catch (err) {
          logger.error("Error calculating directory size:", err);
        }
        return size;
      };

      const instanceDir = getInstanceDir(id);
      let totalSize = calculateDirSize(instanceDir);

      // User requested: .mrpack -> Modrinth, .zip -> CurseForge
      const filters =
        format === "mrpack"
          ? [{ name: "Modrinth Modpack", extensions: ["mrpack"] }]
          : [{ name: "CurseForge Modpack (Zip)", extensions: ["zip"] }];

      const defaultName = exportOptions.name || instance.name;
      const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
        title: `Export ${defaultName}`,
        defaultPath: `${defaultName}-${exportOptions.version || "1.0.0"}.${format}`,
        filters: filters,
      });

      if (canceled || !filePath) {
        return { ok: false, error: "Cancelled" };
      }

      // Check if already exporting
      if (activeExports.has(id)) {
        return { ok: false, error: "Export already in progress" };
      }

      return new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const output = fs.createWriteStream(filePath);
        const archive = archiver("zip", {
          zlib: { level: 9 }, // Sets the compression level.
        });

        let isCancelled = false;

        // Register cancellation
        activeExports.set(id, {
          abort: () => {
            isCancelled = true;
            archive.abort();
            output.destroy(); // Close file stream
            try {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            } catch (err) {
              logger.error("Failed to delete incomplete export file:", {
                message: String(err),
              });
            }
            resolve({ ok: false, error: "Cancelled" });
          },
        });

        output.on("close", () => {
          if (!isCancelled) {
            activeExports.delete(id);
            resolve({ ok: true });
          }
        });

        output.on("end", () => {
          // Data has been drained
        });

        archive.on("warning", (err) => {
          if (err.code === "ENOENT") {
            logger.warn("Archiver warning:", {
              message: err.message,
              code: err.code,
              data: err.data,
            });
          } else {
            activeExports.delete(id);
            resolve({ ok: false, error: err.message });
          }
        });

        archive.on("error", (err) => {
          if (!isCancelled) {
            logger.error("Archiver error:", {
              message: err.message,
              code: err.code,
              data: err.data,
            });
            activeExports.delete(id);
            resolve({ ok: false, error: err.message });
          }
        });

        // Progress listener
        archive.on("progress", (progress) => {
          if (isCancelled) return;

          const transferred = progress.fs.processedBytes;
          const percent =
            totalSize > 0
              ? Math.min(Math.round((transferred / totalSize) * 100), 100)
              : 0;

          sender.send("instance-export-progress", id, {
            transferred: transferred,
            total: totalSize,
            percent: percent,
          });
        });

        archive.pipe(output);

        try {
          // Recursive file adder with filter
          const addDirectory = (
            dir: string,
            base: string,
            targetPrefix: string,
          ) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
              const fullPath = path.join(dir, file);
              const relPath = path.relative(base, fullPath);
              const stats = fs.statSync(fullPath);

              if (!shouldInclude(relPath, stats.isDirectory())) continue;

              if (stats.isDirectory()) {
                addDirectory(fullPath, base, targetPrefix);
              } else {
                // Use forward slashes for ZIP entry names (cross-platform compat)
                const entryName = path
                  .join(targetPrefix, relPath)
                  .replace(/\\/g, "/");
                archive.file(fullPath, {
                  name: entryName,
                });
              }
            }
          };

          if (format === "zip") {
            // Standard ZIP (Filtered)
            // Just add files from instanceDir matching the filter
            addDirectory(instanceDir, instanceDir, "");
          } else {
            // MRPACK Export
            // 1. Create modrinth.index.json
            const index = {
              formatVersion: 1,
              game: "minecraft",
              versionId: instance.minecraftVersion,
              name: exportOptions.name || instance.name,
              summary:
                exportOptions.description || `Exported from Reality Launcher`,
              version: exportOptions.version || "1.0.0",
              files: [], // Loose mode
              dependencies: {
                minecraft: instance.minecraftVersion,
                ...(instance.loader && instance.loader !== "vanilla"
                  ? {
                      [(() => {
                        const l = instance.loader?.toLowerCase().trim();
                        if (l === "fabric") return "fabric-loader";
                        if (l === "quilt") return "quilt-loader";
                        if (l === "neo-forge") return "neoforge";
                        if (l === "forge") return "forge";
                        if (l === "neoforge") return "neoforge";
                        return l || "fabric-loader";
                      })()]: instance.loaderVersion || "*",
                    }
                  : {}),
              },
            };

            logger.info("Generated Modrinth index.json:", index);

            archive.append(JSON.stringify(index, null, 2), {
              name: "modrinth.index.json",
            });

            // 2. Add files to overrides folder with filter
            addDirectory(instanceDir, instanceDir, "overrides");
          }

          archive.finalize();
        } catch (error: any) {
          if (!isCancelled) {
            activeExports.delete(id);
            resolve({ ok: false, error: error.message });
          }
        }
      });
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

  // ----------------------------------------
  // Resource Packs
  // ----------------------------------------

  ipcMain.handle(
    "instance-list-resourcepacks",
    async (_event, instanceId: string) => {
      const instance = getInstance(instanceId);
      if (!instance) return { ok: false, error: "Instance not found" };

      const dir = path.join(instance.gameDirectory, "resourcepacks");
      if (!fs.existsSync(dir)) return { ok: true, items: [] };

      try {
        const native = getNativeModule();
        const nativePacks = (() => {
          try {
            return (native.listInstanceResourcepacks(
              getInstancesDir(),
              instanceId,
            ) || []) as Array<{
              filename: string;
              packFormat?: number;
              size?: number;
            }>;
          } catch {
            return [];
          }
        })();
        const nativePackMap = new Map(
          nativePacks.map((pack) => [pack.filename, pack]),
        );

        const files = await fs.promises.readdir(dir);

        // Get basic info without icons (fast) - icons will be loaded lazily
        const basicItems = await Promise.all(
          files.map(async (file) => {
            const filePath = path.join(dir, file);
            try {
              const stats = await fs.promises.stat(filePath);
              const isDirectory = stats.isDirectory();

              if (
                !file.endsWith(".zip") &&
                !file.endsWith(".zip.disabled") &&
                !isDirectory
              ) {
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
              const nativeInfo = nativePackMap.get(file);
              const nativeMetadata = await inspectPackMetadataWithNative(
                filePath,
                "resource",
              );

              const cacheKey = `resourcepack:${displayName.toLowerCase()}`;
              const cached = getIconFromCache(cacheKey);

              // Try native metadata first (background worker), then fallback reads.
              let icon: string | null =
                cached?.url || nativeMetadata.icon || null;
              let modrinthProjectId = cached?.modrinthId;
              let curseforgeProjectId = cached?.curseforgeId;
              let version: string | undefined =
                nativeMetadata.version || undefined;
              if (typeof nativeInfo?.packFormat === "number") {
                version = packFormatToVersion(nativeInfo.packFormat, "resource");
              } else if (typeof nativeMetadata.packFormat === "number") {
                version = packFormatToVersion(
                  nativeMetadata.packFormat,
                  "resource",
                );
              }
              if (
                (!icon || !version) &&
                (file.endsWith(".zip") || file.endsWith(".zip.disabled"))
              ) {
                try {
                  const buffer = await fs.promises.readFile(filePath);
                  const zip = new AdmZip(buffer);

                  // Extract icon
                  if (!icon) {
                    const packPng = zip.getEntry("pack.png");
                    if (packPng) {
                      icon = `data:image/png;base64,${packPng.getData().toString("base64")}`;
                    }
                  }
                } catch (e) {
                  // Ignore errors reading zip
                }
              } else if ((!icon || !version) && isDirectory) {
                // Directory-based resourcepack
                if (!icon) {
                  const packPngPath = path.join(filePath, "pack.png");
                  if (fs.existsSync(packPngPath)) {
                    try {
                      icon = `data:image/png;base64,${(await fs.promises.readFile(packPngPath)).toString("base64")}`;
                    } catch {
                      /* ignore */
                    }
                  }
                }
              }

              return {
                filename: file,
                name: displayName,
                isDirectory,
                size:
                  typeof nativeInfo?.size === "number"
                    ? nativeInfo.size
                    : stats.size,
                modifiedAt: stats.mtime.toISOString(),
                enabled,
                icon,
                version,
                modrinthProjectId,
                curseforgeProjectId,
              };
            } catch {
              return null;
            }
          }),
        );

        const validItems = basicItems.filter((i) => i !== null) as any[];

        // Use dedupe helper
        const rpItems = dedupeResourcepacks(validItems as any[]);
        return { ok: true, items: rpItems };
      } catch (error: any) {
        return { ok: false, error: error.message };
      }
    },
  );

  ipcMain.handle(
    "instance-toggle-resourcepack",
    async (_event, instanceId: string, filename: string) => {
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
    },
  );

  ipcMain.handle(
    "instance-delete-resourcepack",
    async (_event, instanceId: string, filename: string) => {
      const instance = getInstance(instanceId);
      if (!instance) return { ok: false, error: "Instance not found" };

      const filePath = path.join(
        instance.gameDirectory,
        "resourcepacks",
        filename,
      );
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
    },
  );

  // ----------------------------------------
  // Shaders
  // ----------------------------------------

  ipcMain.handle(
    "instance-list-shaders",
    async (_event, instanceId: string) => {
      const instance = getInstance(instanceId);
      if (!instance) return { ok: false, error: "Instance not found" };

      const dir = path.join(instance.gameDirectory, "shaderpacks");
      if (!fs.existsSync(dir)) return { ok: true, items: [] };

      try {
        const files = await fs.promises.readdir(dir);

        // First pass: get basic info without icons (fast)
        const basicItems = await Promise.all(
          files.map(async (file) => {
            const filePath = path.join(dir, file);
            try {
              const stats = await fs.promises.stat(filePath);
              const isDirectory = stats.isDirectory();

              if (
                !file.endsWith(".zip") &&
                !file.endsWith(".zip.disabled") &&
                !isDirectory
              ) {
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

              return {
                filename: file,
                name: displayName,
                isDirectory,
                size: stats.size,
                modifiedAt: stats.mtime.toISOString(),
                enabled,
                icon: null as string | null,
                filePath,
              };
            } catch {
              return null;
            }
          }),
        );

        const validItems = basicItems.filter((i) => i !== null) as any[];

        // Second pass: fetch icons in parallel (Modrinth/CurseForge first, then fallback to ZIP)
        const itemsWithIcons = await Promise.all(
          validItems.map(async (item) => {
            // 1. Try local ZIP/directory icon first (Fast & Accurate)
            const nativeInfo = await inspectPackMetadataWithNative(
              item.filePath,
              "shader",
            );
            let icon: string | null = nativeInfo.icon;
            let version: string | undefined = nativeInfo.version;

            if (!icon || !version) {
              try {
                if (
                  item.filename.endsWith(".zip") ||
                  item.filename.endsWith(".zip.disabled")
                ) {
                  const buffer = await fs.promises.readFile(item.filePath);
                  const zip = new AdmZip(buffer);
                  const possibleIcons = [
                    "shaders/logo.png",
                    "logo.png",
                    "pack.png",
                    "icon.png",
                  ];
                  for (const iconPath of possibleIcons) {
                    const iconEntry = zip.getEntry(iconPath);
                    if (iconEntry) {
                      icon = `data:image/png;base64,${iconEntry.getData().toString("base64")}`;
                      break;
                    }
                  }

                  // Extract version from shaders.properties
                  const propsEntry =
                    zip.getEntry("shaders/shaders.properties") ||
                    zip.getEntry("shaders.properties");
                  if (propsEntry) {
                    try {
                      const propsText = propsEntry.getData().toString("utf-8");
                      const versionMatch = propsText.match(
                        /^version\s*[=:]\s*(.+)$/m,
                      );
                      if (versionMatch) {
                        version = versionMatch[1].trim();
                      }
                    } catch {
                      /* ignore */
                    }
                  }
                } else if (item.isDirectory) {
                  const possiblePaths = [
                    path.join(item.filePath, "shaders", "logo.png"),
                    path.join(item.filePath, "logo.png"),
                    path.join(item.filePath, "pack.png"),
                    path.join(item.filePath, "icon.png"),
                  ];
                  for (const iconPath of possiblePaths) {
                    if (fs.existsSync(iconPath)) {
                      icon = `data:image/png;base64,${(await fs.promises.readFile(iconPath)).toString("base64")}`;
                      break;
                    }
                  }

                  // Extract version from shaders.properties (directory)
                  const propsPaths = [
                    path.join(item.filePath, "shaders", "shaders.properties"),
                    path.join(item.filePath, "shaders.properties"),
                  ];
                  for (const propsPath of propsPaths) {
                    if (fs.existsSync(propsPath)) {
                      try {
                        const propsText = await fs.promises.readFile(
                          propsPath,
                          "utf-8",
                        );
                        const versionMatch = (propsText as string).match(
                          /^version\s*[=:]\s*(.+)$/m,
                        );
                        if (versionMatch) {
                          version = versionMatch[1].trim();
                        }
                      } catch {
                        /* ignore */
                      }
                      break;
                    }
                  }
                }
              } catch {}
            }

            let modrinthProjectId: string | undefined;
            let curseforgeProjectId: string | undefined;

            // 2. Fallback to online icon if local not found (Slow / Heuristic)
            if (!icon) {
              const onlineResult = await fetchIconFromOnline(
                item.name,
                "shader",
              );
              icon = onlineResult.url;
              modrinthProjectId = onlineResult.modrinthId;
              curseforgeProjectId = onlineResult.curseforgeId;
            }

            // 3. Fallback: extract version from filename (e.g. "ComplementaryReimagined_r5.7.1")
            if (!version) {
              // Match patterns like _r5.7.1, _v2.0, -v1.2.3, _1.0.0, v1.2.3
              const nameMatch = item.name.match(
                /[_\-\s]([rv]?\d+(?:\.\d+)+(?:[._\-]\w+)*)$/i,
              );
              if (nameMatch) {
                version = nameMatch[1];
              }
            }

            return {
              filename: item.filename,
              name: item.name,
              isDirectory: item.isDirectory,
              size: item.size,
              modifiedAt: item.modifiedAt,
              enabled: item.enabled,
              icon,
              version,
              modrinthProjectId,
              curseforgeProjectId,
            };
          }),
        );

        // Use dedupe helper
        const resultItems = dedupeShaders(itemsWithIcons);
        return { ok: true, items: resultItems };
      } catch (error: any) {
        return { ok: false, error: error.message };
      }
    },
  );

  ipcMain.handle(
    "instance-toggle-shader",
    async (_event, instanceId: string, filename: string) => {
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
    },
  );

  ipcMain.handle(
    "instance-delete-shader",
    async (_event, instanceId: string, filename: string) => {
      const instance = getInstance(instanceId);
      if (!instance) return { ok: false, error: "Instance not found" };

      const filePath = path.join(
        instance.gameDirectory,
        "shaderpacks",
        filename,
      );
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
    },
  );

  // ----------------------------------------
  // Datapacks
  // ----------------------------------------

  ipcMain.handle(
    "instance-list-datapacks",
    async (_event, instanceId: string) => {
      const instance = getInstance(instanceId);
      if (!instance) return { ok: false, error: "Instance not found" };

      const items: any[] = [];

      const processDp = async (dpDir: string, worldName: string) => {
        if (!fs.existsSync(dpDir)) return;
        const files = await fs.promises.readdir(dpDir);

        const dpItems = await Promise.all(
          files.map(async (file) => {
            const filePath = path.join(dpDir, file);
            try {
              const stats = await fs.promises.stat(filePath);
              const isDir = stats.isDirectory();

              if (
                !file.endsWith(".zip") &&
                !file.endsWith(".zip.disabled") &&
                !file.endsWith(".jar") &&
                !file.endsWith(".jar.disabled") &&
                !isDir
              ) {
                return null;
              }

              let enabled = true;
              let displayName = file;

              if (
                file.endsWith(".zip.disabled") ||
                file.endsWith(".jar.disabled")
              ) {
                enabled = false;
                displayName = file
                  .replace(".zip.disabled", "")
                  .replace(".jar.disabled", "");
              } else if (file.endsWith(".zip")) {
                displayName = file.replace(".zip", "");
              } else if (file.endsWith(".jar")) {
                displayName = file.replace(".jar", "");
              }

              const nativeInfo = await inspectPackMetadataWithNative(
                filePath,
                "datapack",
              );
              let icon: string | null = nativeInfo.icon;
              let version: string | undefined = nativeInfo.version;
              if (!version && typeof nativeInfo.packFormat === "number") {
                version = packFormatToVersion(nativeInfo.packFormat, "data");
              }
              try {
                if (
                  (!icon || !version) &&
                  (file.endsWith(".zip") ||
                    file.endsWith(".zip.disabled") ||
                    file.endsWith(".jar") ||
                    file.endsWith(".jar.disabled"))
                ) {
                  const zip = new AdmZip(filePath);

                  // Try standard pack.png (root, assets/, or depth-1 subfolder)
                  let packPng =
                    zip.getEntry("pack.png") || zip.getEntry("assets/pack.png");

                  // Also check for pack.png inside a root subfolder (e.g. MyDataPack/pack.png)
                  if (!packPng) {
                    const entries = zip.getEntries();
                    for (const e of entries) {
                      if (
                        !e.isDirectory &&
                        /^[^/]+\/pack\.png$/i.test(e.entryName)
                      ) {
                        packPng = e;
                        break;
                      }
                    }
                  }

                  if (packPng) {
                    try {
                      icon = `data:image/png;base64,${packPng.getData().toString("base64")}`;
                    } catch {}
                  }

                  // Fallback: find first png file in zip root or assets
                  if (!icon) {
                    const entries = zip.getEntries();
                    for (const e of entries) {
                      if (
                        !e.isDirectory &&
                        /^[^/]*\/?[^/]+\.png$/i.test(e.entryName)
                      ) {
                        try {
                          const data = e.getData();
                          if (data && data.length > 0) {
                            icon = `data:image/png;base64,${data.toString("base64")}`;
                            break;
                          }
                        } catch {}
                      }
                    }
                  }

                  // Extract version from pack.mcmeta
                  let mcmeta = zip.getEntry("pack.mcmeta");
                  if (!mcmeta) {
                    // Check depth-1 subfolder
                    const entries = zip.getEntries();
                    for (const e of entries) {
                      if (
                        !e.isDirectory &&
                        /^[^/]+\/pack\.mcmeta$/i.test(e.entryName)
                      ) {
                        mcmeta = e;
                        break;
                      }
                    }
                  }
                  if (mcmeta) {
                    try {
                      const mcmetaData = JSON.parse(
                        mcmeta.getData().toString("utf-8"),
                      );
                      const packFormat = mcmetaData?.pack?.pack_format;
                      if (typeof packFormat === "number") {
                        version = packFormatToVersion(packFormat, "data");
                      }
                    } catch {
                      /* ignore parse errors */
                    }
                  }
                } else if ((!icon || !version) && isDir) {
                  const packPngPath = path.join(filePath, "pack.png");
                  if (fs.existsSync(packPngPath)) {
                    icon = `data:image/png;base64,${fs.readFileSync(packPngPath).toString("base64")}`;
                  } else {
                    // Fallback: search for first png inside directory (max depth 2)
                    const allFiles = await (async function walk(
                      dirPath: string,
                      depth = 0,
                    ) {
                      if (depth > 2) return [];
                      const acc: string[] = [];
                      const list = await fs.promises.readdir(dirPath);
                      for (const f of list) {
                        const p = path.join(dirPath, f);
                        try {
                          const st = await fs.promises.stat(p);
                          if (st.isDirectory())
                            acc.push(...(await walk(p, depth + 1)));
                          else if (/\.png$/i.test(f)) acc.push(p);
                        } catch {}
                      }
                      return acc;
                    })(filePath);
                    if (allFiles && allFiles.length > 0) {
                      try {
                        icon = `data:image/png;base64,${fs.readFileSync(allFiles[0]).toString("base64")}`;
                      } catch {}
                    }
                  }
                  // Read pack.mcmeta from directory
                  const mcmetaPath = path.join(filePath, "pack.mcmeta");
                  if (fs.existsSync(mcmetaPath)) {
                    try {
                      const mcmetaData = JSON.parse(
                        fs.readFileSync(mcmetaPath, "utf-8") as string,
                      );
                      const packFormat = mcmetaData?.pack?.pack_format;
                      if (typeof packFormat === "number") {
                        version = packFormatToVersion(packFormat, "data");
                      }
                    } catch {
                      /* ignore parse errors */
                    }
                  }
                }
              } catch {}

              return {
                filename: file,
                name: displayName,
                worldName,
                isDirectory: isDir,
                size: stats.size,
                modifiedAt: stats.mtime.toISOString(),
                enabled,
                icon,
                version,
              };
            } catch {
              return null;
            }
          }),
        );

        items.push(...dpItems.filter((i) => i !== null));
      };

      await processDp(
        path.join(instance.gameDirectory, "datapacks"),
        "(Global)",
      );

      const savesDir = path.join(instance.gameDirectory, "saves");
      if (fs.existsSync(savesDir)) {
        try {
          const worlds = await fs.promises.readdir(savesDir);
          await Promise.all(
            worlds.map(async (worldName) => {
              const worldPath = path.join(savesDir, worldName);
              try {
                const worldStats = await fs.promises.stat(worldPath);
                if (!worldStats.isDirectory()) return;
                await processDp(path.join(worldPath, "datapacks"), worldName);
              } catch {}
            }),
          );
        } catch {}
      }

      // Use dedupe helper
      const sorted = dedupeDatapacks(items);
      return { ok: true, items: sorted };
    },
  );

  ipcMain.handle(
    "instance-toggle-datapack",
    async (_event, instanceId: string, worldName: string, filename: string) => {
      const instance = getInstance(instanceId);
      if (!instance) return { ok: false, error: "Instance not found" };

      const dpDir =
        worldName === "(Global)"
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
    },
  );

  ipcMain.handle(
    "instance-delete-datapack",
    async (_event, instanceId: string, worldName: string, filename: string) => {
      const instance = getInstance(instanceId);
      if (!instance) return { ok: false, error: "Instance not found" };

      const filePath =
        worldName === "(Global)"
          ? path.join(instance.gameDirectory, "datapacks", filename)
          : path.join(
              instance.gameDirectory,
              "saves",
              worldName,
              "datapacks",
              filename,
            );

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
    },
  );

  // ----------------------------------------
  // Logs
  // ----------------------------------------

  ipcMain.handle(
    "instance-read-latest-log",
    async (_event, instanceId: string) => {
      const instance = getInstance(instanceId);
      if (!instance)
        return { ok: false, error: "Instance not found", content: "" };

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
    },
  );

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
    let mappedCancelId: string | null = null;
    const controller = new AbortController();
    const throwIfCancelled = () => {
      if (controller.signal.aborted) {
        throw new Error("Installation cancelled");
      }
    };

    // Register cancellable operation immediately to avoid early cancel race
    activeOperations.set(id, controller);

    try {
      const session = getSession();
      if (!session || !session.apiToken) {
        return { ok: false, error: "Not logged in or no API token" };
      }

      const { fetchJoinedServers, syncServerMods } =
        await import("../cloud-instances.js");
      const { importCloudInstance, deleteInstance } =
        await import("../instances.js");

      console.log(`[Instances] Manually installing cloud instance: ${id}`);
      getMainWindow()?.webContents.send("install-progress", {
        type: "start",
        task: "เธเธณเธฅเธฑเธเธ•เธฃเธงเธเธชเธญเธเธเนเธญเธกเธนเธฅ...",
      });
      throwIfCancelled();

      // 1. Fetch all joined servers
      const data = await fetchJoinedServers(session.apiToken, controller.signal);
      throwIfCancelled();
      const allInstances = [...data.owned, ...data.member];

      // 2. Find target
      const target = allInstances.find((i) => (i.storagePath || i.id) === id);

      if (target) {
        throwIfCancelled();
        const instance = await importCloudInstance(target);
        createdInstanceId = instance.id;
        getMainWindow()?.webContents.send("instances-updated");
        throwIfCancelled();

        // 3. Download Content
        // MUST match importCloudInstance logic: storagePath || id
        const targetId = target.storagePath || target.id;
        console.log(
          `[Instances] Downloading content for: ${target.name} (ID: ${targetId})`,
        );

        // Map both requested ID and resolved local storage ID to the same controller
        if (targetId !== id) {
          mappedCancelId = targetId;
          activeOperations.set(targetId, controller);
        }

        try {
          await syncServerMods(
            targetId,
            session.apiToken,
            (progress) => {
              getMainWindow()?.webContents.send("install-progress", progress);
            },
            controller.signal,
          );

          // Success - clear the cleanup flag
          createdInstanceId = null;
        } catch (syncError: any) {
          if (
            syncError.message === "Cancelled" ||
            syncError.message === "Download cancelled" ||
            syncError.message === "Installation cancelled"
          ) {
            throw new Error("Installation cancelled");
          }
          console.error("[Instances] Sync Error:", syncError);
          throw new Error(`Sync Failed: ${syncError?.message}`);
        }

        console.log(`[Instances] Installed successfully: ${target.name}`);
        getMainWindow()?.webContents.send("install-progress", {
          type: "complete",
          task: "เธ•เธดเธ”เธ•เธฑเนเธเน€เธชเธฃเนเธเธชเธดเนเธ",
          percent: 100,
        });
        return { ok: true };
      } else {
        return { ok: false, error: "Cloud Instance not found in your list." };
      }
    } catch (error: any) {
      // Cleanup: Delete the instance if installation was cancelled or failed
      if (createdInstanceId) {
        console.log(
          "[Instances] Installation failed or cancelled, cleaning up instance:",
          createdInstanceId,
        );
        try {
          const { deleteInstance } = await import("../instances.js");
          await deleteInstance(createdInstanceId);
          getMainWindow()?.webContents.send("instances-updated");
          console.log("[Instances] Cleanup complete");
        } catch (cleanupError) {
          console.error(
            "[Instances] Failed to cleanup instance:",
            cleanupError,
          );
        }
      }

      const cancelMsg = String(error?.message || "").toLowerCase();
      if (
        controller.signal.aborted ||
        cancelMsg.includes("cancelled") ||
        cancelMsg.includes("canceled")
      ) {
        getMainWindow()?.webContents.send("install-progress", {
          type: "cancelled",
          task: "ยกเลิกการดาวน์โหลดแล้ว",
          percent: 0,
        });
        return { ok: false, error: "Installation cancelled" };
      }

      console.error("[IPC] Cloud install failed:", error);
      return { ok: false, error: error?.message || "เธเธฒเธฃเธ•เธดเธ”เธ•เธฑเนเธเธฅเนเธกเน€เธซเธฅเธง" };
    } finally {
      activeOperations.delete(id);
      if (mappedCancelId && mappedCancelId !== id) {
        activeOperations.delete(mappedCancelId);
      }
    }
  },
  );

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

  ipcMain.handle(
    "instance-add-content-file",
    async (
      _event,
      instanceId: string,
      filePath: string,
      contentType: string,
    ) => {
      logger.info(" instance-add-content-file called:", {
        instanceId,
        filePath,
        contentType,
      });

      const instance = getInstance(instanceId);
      if (!instance) {
        logger.info(" Instance not found:", { instanceId });
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
          error: `เนเธเธฅเน ${ext} เนเธกเนเธฃเธญเธเธฃเธฑเธเธชเธณเธซเธฃเธฑเธ ${contentType}\nเธฃเธญเธเธฃเธฑเธ: ${allowed.join(", ")}`,
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
          return { ok: false, error: `เนเธเธฅเน ${fileName} เธกเธตเธญเธขเธนเนเนเธฅเนเธง` };
        }

        // Copy file
        fs.copyFileSync(filePath, targetPath);
        return { ok: true, filename: fileName };
      } catch (error: any) {
        return { ok: false, error: error.message };
      }
    },
  );

  // List files in instance directory recursively
  ipcMain.handle("instances-list-files", async (_event, instanceId: string) => {
    try {
      const instance = getInstance(instanceId);
      if (!instance) {
        throw new Error(`Instance not found: ${instanceId}`);
      }

      const instancePath = getInstanceDir(instanceId);

      // Recursive function to build file tree
      const buildFileTree = (dir: string, relativePath: string = ""): any[] => {
        const items = fs.readdirSync(dir);
        const result: any[] = [];

        for (const item of items) {
          // Skip hidden files/folders and system folders that shouldn't be exported
          if (item.startsWith(".")) continue;
          // Skip folders that are always excluded from export
          if (
            [
              "logs",
              "crash-reports",
              "cache",
              "webcache",
              "natives",
              "assets",
            ].includes(item)
          )
            continue;

          const fullPath = path.join(dir, item);
          const itemRelativePath = path
            .join(relativePath, item)
            .replace(/\\/g, "/");
          const stats = fs.statSync(fullPath);

          if (stats.isDirectory()) {
            const children = buildFileTree(fullPath, itemRelativePath);
            result.push({
              name: item,
              path: itemRelativePath,
              type: "directory",
              children: children,
            });
          } else {
            result.push({
              name: item,
              path: itemRelativePath,
              type: "file",
              size: stats.size,
            });
          }
        }

        // Sort: Directories first, then files
        return result.sort((a, b) => {
          if (a.type === b.type) return a.name.localeCompare(b.name);
          return a.type === "directory" ? -1 : 1;
        });
      };

      const files = buildFileTree(instancePath);
      return { ok: true, files };
    } catch (error) {
      logger.error("Failed to list instance files:", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle(
    "instance-change-content-version",
    async (
      _event,
      options: {
        instanceId: string;
        oldFilename: string;
        projectId: string;
        newVersionId: string;
        contentType: string;
        contentSource?: "modrinth" | "curseforge";
      },
    ) => {
      const {
        instanceId,
        oldFilename,
        projectId,
        newVersionId,
        contentType,
        contentSource = "modrinth",
      } = options;
      logger.info(
        `Changing version for ${contentType}: ${oldFilename} -> project ${projectId}, version ${newVersionId}`,
      );

      const instance = getInstance(instanceId);
      if (!instance) return { ok: false, error: "Instance not found" };

      // 1. Map content type to folder
      const folderMap: Record<string, string> = {
        mod: "mods",
        mods: "mods",
        resourcepack: "resourcepacks",
        resourcepacks: "resourcepacks",
        shader: "shaderpacks",
        shaders: "shaderpacks",
        datapack: "datapacks",
        datapacks: "datapacks",
      };

      const folder = folderMap[contentType];
      if (!folder) return { ok: false, error: "Invalid content type" };

      // 2. Delete old file
      const oldPath = path.join(instance.gameDirectory, folder, oldFilename);
      try {
        if (fs.existsSync(oldPath)) {
          const stats = fs.statSync(oldPath);
          if (stats.isDirectory()) {
            fs.rmSync(oldPath, { recursive: true });
          } else {
            fs.rmSync(oldPath, { force: true });
          }
          logger.info(`Deleted old version: ${oldFilename}`);
        }
      } catch (err: any) {
        logger.error(`Failed to delete old version ${oldFilename}:`, err);
        return {
          ok: false,
          error: `Failed to remove old version: ${err.message}`,
        };
      }

      // 3. Download new version
      try {
        const mainWindow = getMainWindow();
        const result = await downloadContentToInstance(
          {
            projectId,
            versionId: newVersionId,
            instanceId,
            contentType: (contentType.endsWith("s")
              ? contentType.slice(0, -1)
              : contentType) as any,
            contentSource,
          },
          (progress) => {
            mainWindow?.webContents.send("content-download-progress", progress);
          },
        );

        if (result.ok) {
          logger.info(`Successfully changed version to ${result.filename}`);
        }
        return result;
      } catch (err: any) {
        logger.error(`Failed to download new version:`, err);
        return { ok: false, error: `Download failed: ${err.message}` };
      }
    },
  );

  logger.info(" Instance handlers registered");
}
