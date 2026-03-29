import { app } from "electron";
import * as path from "path";
import { existsSync, readFileSync, writeFileSync, rmSync } from "fs";
import * as fs from "fs-extra";
import crypto from "node:crypto";
import { createIpcLogger } from "../lib/logger.js";
import { getConfig, getAppDataDir, getMinecraftDir } from "../config.js";
import { getNativeModule } from "../native.js";

const logger = createIpcLogger("Instance");

export const LATEST_LOG_TAIL_MAX_BYTES = 1024 * 1024; // 1MB
export const LATEST_LOG_TAIL_MAX_LINES = 500;

export async function readUtf8LogTail(
  filePath: string,
  maxLines: number,
  maxBytes: number,
): Promise<string> {
  const fileHandle = await fs.promises.open(filePath, "r");
  try {
    const stats = await fileHandle.stat();
    if (stats.size <= 0) {
      return "";
    }

    const bytesToRead = Math.min(Number(stats.size), maxBytes);
    const start = Math.max(0, Number(stats.size) - bytesToRead);
    const buffer = Buffer.alloc(bytesToRead);
    await fileHandle.read(buffer, 0, bytesToRead, start);

    let content = buffer.toString("utf-8");

    // When reading a tail chunk, trim the first partial line.
    if (start > 0) {
      const firstBreak = content.indexOf("\n");
      content = firstBreak >= 0 ? content.slice(firstBreak + 1) : "";
    }

    if (!content) {
      return "";
    }

    return content.split(/\r?\n/).slice(-maxLines).join("\n");
  } finally {
    await fileHandle.close();
  }
}

type NativePackKind = "resource" | "shader" | "datapack";

export async function inspectPackMetadataWithNative(
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
export interface ModMetadataCache {
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
export const modMetadataCache = new Map<string, ModMetadataCache>();
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

export function saveMetadataCache() {
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

export function clearLauncherCaches() {
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

export function getIconFromCache(
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
export function packFormatToVersion(
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
export async function fetchIconFromOnline(
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

export function getModCacheKey(filepath: string, size: number, mtime: string): string {
  // Strip .disabled suffix to maintain same cache key when toggled
  const cleanPath = filepath.endsWith(".disabled")
    ? filepath.slice(0, -".disabled".length)
    : filepath;
  return `${cleanPath}|${size}|${mtime}`;
}

export async function calculateSha1(filePath: string): Promise<string> {
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
export async function extractModInfo(
  jarPath: string,
): Promise<ModMetadataCache> {
  const native = getNativeModule();

  try {
    // Try Fabric mod (search for fabric.mod.json)
    const fabricContent = native.readFileFromZip(jarPath, "fabric.mod.json");
    if (fabricContent) {
      let json: any;
      try {
        json = JSON.parse(fabricContent.toString("utf8"));
      } catch (parseErr) {
        logger.warn(`[ModInfo] Failed to parse fabric.mod.json in ${jarPath}:`, {
          error: String(parseErr),
        });
        return {};
      }

      let icon: string | undefined;
      if (json.icon) {
        try {
          const iconData = native.readFileFromZip(jarPath, json.icon);
          if (iconData) {
            const mimeType = json.icon.endsWith(".png")
              ? "image/png"
              : "image/jpeg";
            icon = `data:${mimeType};base64,${iconData.toString("base64")}`;
          }
        } catch (e) {
          // Icon read failed, skip it
        }
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

    // Try Forge mod (search for META-INF/mods.toml)
    const forgeContent = native.readFileFromZip(jarPath, "META-INF/mods.toml");
    if (forgeContent) {
      const content = forgeContent.toString("utf8");
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
        try {
          const logoPath = logoMatch[1];
          const iconData = native.readFileFromZip(jarPath, logoPath);
          if (iconData) {
            icon = `data:image/png;base64,${iconData.toString("base64")}`;
          }
        } catch (e) {
          // Logo read failed, skip
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
export const ModrinthAPI = {
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
export const pendingModrinthLookups = new Set<string>();
