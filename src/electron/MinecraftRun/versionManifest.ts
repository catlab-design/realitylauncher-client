import path from "path";
import fs from "fs";
import { readJsonFileSafe } from "./fsUtils.js";

const VERSION_MANIFEST_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let versionManifestCache: { manifest: any; cachedAt: number } | null = null;

function getManifestCachePath(minecraftRoot: string): string {
  return path.join(minecraftRoot, "cache", "version_manifest_v2.json");
}

async function getVersionManifestCached(
  native: any,
  minecraftRoot: string,
): Promise<any> {
  const now = Date.now();
  if (
    versionManifestCache &&
    now - versionManifestCache.cachedAt < VERSION_MANIFEST_CACHE_TTL_MS
  ) {
    return versionManifestCache.manifest;
  }

  const manifestCachePath = getManifestCachePath(minecraftRoot);
  try {
    if (fs.existsSync(manifestCachePath)) {
      const stats = fs.statSync(manifestCachePath);
      if (now - stats.mtimeMs < VERSION_MANIFEST_CACHE_TTL_MS) {
        const manifestFromDisk = readJsonFileSafe<any>(manifestCachePath);
        if (manifestFromDisk?.versions) {
          versionManifestCache = { manifest: manifestFromDisk, cachedAt: now };
          return manifestFromDisk;
        }
      }
    }
  } catch {
    
  }

  try {
    const manifest = await native.fetchVersionManifest();
    const cacheDir = path.dirname(manifestCachePath);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(manifestCachePath, JSON.stringify(manifest));
    versionManifestCache = { manifest, cachedAt: now };
    return manifest;
  } catch (error) {
    const staleManifest = readJsonFileSafe<any>(manifestCachePath);
    if (staleManifest?.versions) {
      console.warn(
        "[RustLauncher] Failed to refresh version manifest, using stale cache",
      );
      versionManifestCache = { manifest: staleManifest, cachedAt: now };
      return staleManifest;
    }
    throw error;
  }
}

export async function loadVersionJson(
  versionId: string,
  versionsDir: string,
  minecraftRoot: string,
  native: any,
  manifest: any | null,
): Promise<{ versionJson: string; manifest: any | null }> {
  const versionJsonPath = path.join(
    versionsDir,
    versionId,
    `${versionId}.json`,
  );
  if (fs.existsSync(versionJsonPath)) {
    return { versionJson: fs.readFileSync(versionJsonPath, "utf-8"), manifest };
  }

  const resolvedManifest =
    manifest ?? (await getVersionManifestCached(native, minecraftRoot));
  const versionInfo = resolvedManifest.versions.find(
    (v: any) => v.id === versionId,
  );
  if (!versionInfo) {
    throw new Error(`ไม่พบเวอร์ชัน ${versionId}`);
  }

  const versionJson = await native.fetchVersionDetail(versionInfo.url);
  fs.mkdirSync(path.dirname(versionJsonPath), { recursive: true });
  fs.writeFileSync(versionJsonPath, versionJson);
  return { versionJson, manifest: resolvedManifest };
}
