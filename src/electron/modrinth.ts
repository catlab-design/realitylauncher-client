

import https from "node:https";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { getMinecraftDir } from "./config.js";
import crypto from "node:crypto";
import { getNativeModule } from "./native.js";





const MODRINTH_API = "https://api.modrinth.com/v2";

const USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) RealityLauncher/${app?.getVersion?.() || "1.0.0"} Chrome/120.0.0.0 Electron/28.1.0 Safari/537.36`;


const HTTP_AGENT = new http.Agent({
  keepAlive: true,
  maxSockets: 48,
  maxFreeSockets: 12,
});
const HTTPS_AGENT = new https.Agent({
  keepAlive: true,
  maxSockets: 48,
  maxFreeSockets: 12,
});

function getRequestClient(url: string): {
  protocol: typeof https | typeof http;
  agent: http.Agent | https.Agent;
} {
  if (url.startsWith("https")) {
    return { protocol: https, agent: HTTPS_AGENT };
  }
  return { protocol: http, agent: HTTP_AGENT };
}





export interface ModrinthProject {
  slug: string;
  title: string;
  description: string;
  categories: string[];
  client_side: "required" | "optional" | "unsupported";
  server_side: "required" | "optional" | "unsupported";
  project_type: "mod" | "modpack" | "resourcepack" | "shader";
  downloads: number;
  icon_url: string | null;
  color: number | null;
  project_id: string;
  author: string;
  display_categories: string[];
  versions: string[];
  follows: number;
  date_created: string;
  date_modified: string;
  latest_version: string;
  license: string;
  gallery: string[];
  featured_gallery: string | null;
}

export interface ModrinthSearchResult {
  hits: ModrinthProject[];
  offset: number;
  limit: number;
  total_hits: number;
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  author_id: string;
  featured: boolean;
  name: string;
  version_number: string;
  changelog: string;
  date_published: string;
  downloads: number;
  version_type: "release" | "beta" | "alpha";
  status: string;
  files: ModrinthFile[];
  dependencies: ModrinthDependency[];
  game_versions: string[];
  loaders: string[];
}

export interface ModrinthFile {
  hashes: {
    sha512: string;
    sha1: string;
  };
  url: string;
  filename: string;
  primary: boolean;
  size: number;
  file_type: string | null;
}

export interface ModrinthDependency {
  version_id: string | null;
  project_id: string | null;
  file_name: string | null;
  dependency_type: "required" | "optional" | "incompatible" | "embedded";
}

export interface ModrinthProjectFull {
  id: string;
  slug: string;
  project_type: string;
  team: string;
  title: string;
  description: string;
  body: string;
  body_url: string | null;
  published: string;
  updated: string;
  approved: string | null;
  status: string;
  license: {
    id: string;
    name: string;
    url: string | null;
  };
  client_side: string;
  server_side: string;
  downloads: number;
  followers: number;
  categories: string[];
  additional_categories: string[];
  game_versions: string[];
  loaders: string[];
  versions: string[];
  icon_url: string | null;
  issues_url: string | null;
  source_url: string | null;
  wiki_url: string | null;
  discord_url: string | null;
  donation_urls: { id: string; platform: string; url: string }[];
  gallery: {
    url: string;
    raw_url?: string;
    featured: boolean;
    title: string | null;
    description: string | null;
    created: string;
    ordering: number;
  }[];
}

export interface SearchFilters {
  query?: string;
  projectType?: "mod" | "modpack" | "resourcepack" | "shader" | "datapack";
  gameVersion?: string;
  loader?: string;
  limit?: number;
  offset?: number;
  sortBy?: "relevance" | "downloads" | "follows" | "newest" | "updated";
}





function fetchJSON<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const { protocol, agent } = getRequestClient(url);
    const request = protocol.get(
      url,
      {
        agent,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
      },
      (response) => {
        
        if (
          response.statusCode === 301 ||
          response.statusCode === 302 ||
          response.statusCode === 307 ||
          response.statusCode === 308
        ) {
          if (response.headers.location) {
            const nextUrl = new URL(response.headers.location, url).toString();
            console.log(
              `[Modrinth] Following redirect: ${url} -> ${nextUrl}`,
            );
            fetchJSON<T>(nextUrl).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(
            new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`),
          );
          return;
        }

        let data = "";
        response.on("data", (chunk) => (data += chunk));
        response.on("end", () => {
          try {
            resolve(JSON.parse(data) as T);
          } catch (e) {
            reject(new Error("Failed to parse JSON response"));
          }
        });
      },
    );

    request.on("error", reject);
    request.setTimeout(60000, () => {
      request.destroy();
      reject(new Error("Request timeout (60s)"));
    });
  });
}






export async function searchModpacks(
  filters: SearchFilters = {},
): Promise<ModrinthSearchResult> {
  const {
    query = "",
    projectType = "modpack",
    gameVersion,
    loader,
    limit = 20,
    offset = 0,
    sortBy = "relevance",
  } = filters;

  
  const facets: string[][] = [[`project_type:${projectType}`]];

  if (gameVersion) {
    facets.push([`versions:${gameVersion}`]);
  }

  if (loader) {
    facets.push([`categories:${loader}`]);
  }

  
  const params = new URLSearchParams({
    query,
    facets: JSON.stringify(facets),
    limit: String(limit),
    offset: String(offset),
    index: sortBy,
  });

  const url = `${MODRINTH_API}/search?${params.toString()}`;
  console.log("[Modrinth] Searching:", url);

  return fetchJSON<ModrinthSearchResult>(url);
}


export async function getProject(
  idOrSlug: string,
): Promise<ModrinthProjectFull> {
  const url = `${MODRINTH_API}/project/${encodeURIComponent(idOrSlug)}`;
  console.log("[Modrinth] Getting project:", url);

  return fetchJSON<ModrinthProjectFull>(url);
}


export async function getProjectVersions(
  idOrSlug: string,
): Promise<ModrinthVersion[]> {
  const url = `${MODRINTH_API}/project/${encodeURIComponent(idOrSlug)}/version`;
  console.log("[Modrinth] Getting versions:", url);

  return fetchJSON<ModrinthVersion[]>(url);
}


export async function getVersion(versionId: string): Promise<ModrinthVersion> {
  const url = `${MODRINTH_API}/version/${encodeURIComponent(versionId)}`;
  console.log("[Modrinth] Getting version:", url);

  return fetchJSON<ModrinthVersion>(url);
}


export async function getGameVersions(): Promise<
  { version: string; version_type: string }[]
> {
  try {
    const url =
      "https://launchermeta.mojang.com/mc/game/version_manifest.json";
    const data = await fetchJSON<{ versions: any[] }>(url);

    return data.versions.map((v: any) => ({
      version: v.id, 
      version_type: v.type, 
    }));
  } catch (error) {
    console.error(
      "[Modrinth] Failed to fetch game versions from Mojang:",
      error,
    );
    
    
    
    
    return [];
  }
}


export async function getLoaders(): Promise<{ name: string; icon: string }[]> {
  const url = `${MODRINTH_API}/tag/loader`;
  return fetchJSON<{ name: string; icon: string }[]>(url);
}


export async function getLoaderVersions(
  loader: string,
  gameVersion: string,
): Promise<string[]> {
  if (!gameVersion) return [];

  try {
    if (loader === "fabric") {
      const url = `https://meta.fabricmc.net/v2/versions/loader/${gameVersion}`;
      const data = await fetchJSON<any[]>(url);
      return data.map((d: any) => d.version);
    } else if (loader === "quilt") {
      const url = `https://meta.quiltmc.org/v3/versions/loader/${gameVersion}`;
      const data = await fetchJSON<any[]>(url);
      return data.map((d: any) => d.version);
    } else if (loader === "forge") {
      const url = "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
      const data = await fetchJSON<{ versions: any[] }>(url);

      console.log(
        `[Modrinth] Fetched ${data?.versions?.length} Forge versions from Prism Meta`,
      );

      const versions: string[] = [];

      
      if (data && Array.isArray(data.versions)) {
        for (const v of data.versions) {
          
          if (v.requires && Array.isArray(v.requires)) {
            const mcReq = v.requires.find(
              (r: any) => r.uid === "net.minecraft",
            );
            if (mcReq && mcReq.equals === gameVersion) {
              versions.push(v.version);
            }
          }
        }
      }
      console.log(
        `[Modrinth] Found ${versions.length} Forge versions for ${gameVersion}`,
      );

      return versions; 
    } else if (loader === "neoforge") {
      const versions: string[] = [];

      try {
        
        const url = "https://maven.neoforged.net/api/maven/releases/releases/net/neoforged/neoforge/maven-metadata.xml";
        const data = await fetchJSON<{ versions: any[] }>(url);

        if (data && Array.isArray(data.versions)) {
          for (const v of data.versions) {
            if (v.requires && Array.isArray(v.requires)) {
              const mcReq = v.requires.find(
                (r: any) => r.uid === "net.minecraft",
              );
              if (mcReq && mcReq.equals === gameVersion) {
                versions.push(v.version);
              }
            }
          }
        }
        console.log(
          `[Modrinth] Found ${versions.length} NeoForge versions from Prism Meta for ${gameVersion}`,
        );
      } catch (err) {
        console.warn(
          "[Modrinth] Prism Meta for NeoForge failed, trying Maven fallback:",
          err,
        );
      }

      
      if (versions.length === 0) {
        console.log(
          `[Modrinth] NeoForge: No versions in Prism Meta for ${gameVersion}. Trying Maven...`,
        );
        try {
          const mavenUrl =
            "https://maven.neoforged.net/api/maven/releases/releases/net/neoforged/neoforge/maven-metadata.xml";
          const mavenData = await fetchJSON<{ versions: string[] }>(mavenUrl);

          if (mavenData && Array.isArray(mavenData.versions)) {
            
            
            
            

            const parts = gameVersion.split(".");
            if (parts.length >= 2) {
              
              const major = parts[0] === "1" ? parts[1] : parts[0];
              const minor = parts[2] || "0";

              
              const prefix = `${major}.${minor}.`;
              const modernMatches = mavenData.versions.filter((v) =>
                v.startsWith(prefix),
              );

              versions.push(...modernMatches.reverse()); 

              
              if (gameVersion === "1.20.1" && versions.length === 0) {
                const legacyMatches = mavenData.versions.filter((v) =>
                  v.startsWith("47."),
                );
                versions.push(...legacyMatches.reverse());
              }
            }
            console.log(
              `[Modrinth] Found ${versions.length} NeoForge versions from Maven for ${gameVersion}`,
            );
          }
        } catch (mavenErr) {
          console.error("[Modrinth] NeoForge Maven fallback failed:", mavenErr);
        }
      }

      console.log(
        `[Modrinth] Returning ${versions.length} NeoForge versions for ${gameVersion}`,
      );
      return versions;
    }

    return [];
  } catch (error) {
    console.error(
      `[Modrinth] Failed to fetch loader versions for ${loader} ${gameVersion}:`,
      error,
    );
    return [];
  }
}





export interface DownloadProgress {
  filename: string;
  downloaded: number;
  total: number;
  percent: number;
}

type ProgressCallback = (progress: DownloadProgress) => void;


export async function downloadFile(
  url: string,
  dest: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<void> {
  if (!signal) {
    try {
      const native = getNativeModule() as any;
      if (typeof native.downloadFile === "function") {
        const filename = path.basename(dest);
        if (onProgress) {
          onProgress({
            filename,
            downloaded: 0,
            total: 0,
            percent: 0,
          });
        }
        const result = (await native.downloadFile(
          url,
          dest,
          undefined,
          undefined,
        )) as { success?: boolean; error?: string };
        if (!result?.success) {
          throw new Error(result?.error || "Native download failed");
        }
        if (onProgress) {
          onProgress({
            filename,
            downloaded: 1,
            total: 1,
            percent: 100,
          });
        }
        return;
      }
    } catch (nativeError) {
      console.warn("[Modrinth] Native download failed, fallback to JS", {
        url,
        message: String((nativeError as Error)?.message || nativeError),
      });
    }
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error("Download cancelled"));
    }

    
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const file = fs.createWriteStream(dest);
    const filename = path.basename(dest);

    const { protocol, agent } = getRequestClient(url);

    let currentResponse: any = null;
    let dataTimeout: NodeJS.Timeout | null = null;
    let onAbort: (() => void) | null = null;
    const TIMEOUT_MS = 60000; 

    const cleanup = () => {
      if (dataTimeout) clearTimeout(dataTimeout);
      if (signal && onAbort) {
        signal.removeEventListener("abort", onAbort);
        onAbort = null;
      }
    };

    const resetTimeout = () => {
      if (dataTimeout) clearTimeout(dataTimeout);
      dataTimeout = setTimeout(() => {
        console.warn(
          `[Download] Stalled detected for ${filename} (no data for ${TIMEOUT_MS}ms)`,
        );
        request.destroy();
        if (currentResponse) currentResponse.destroy();
        file.close();
        try {
          if (fs.existsSync(dest)) fs.rmSync(dest, { force: true });
        } catch {}
        reject(new Error("Download stalled (timeout)"));
      }, TIMEOUT_MS);
    };

    
    
    const connectionTimeout = setTimeout(() => {
      console.warn(
        `[Download] Connection/Header timeout (60s limit) for ${filename}`,
      );
      cleanup();
      request.destroy();
      file.close();
      try {
        if (fs.existsSync(dest)) fs.rmSync(dest, { force: true });
      } catch {}
      reject(new Error("Connection timeout (no headers)"));
    }, 60000);

    const request = protocol.get(
      url,
      { agent, headers: { "User-Agent": USER_AGENT } },
      (response) => {
        
        clearTimeout(connectionTimeout);

        currentResponse = response;

        
        if (
          response.statusCode === 301 ||
          response.statusCode === 302 ||
          response.statusCode === 303 ||
          response.statusCode === 307 ||
          response.statusCode === 308
        ) {
          const redirectUrl = response.headers.location;
          cleanup();
          if (redirectUrl) {
            const resolvedRedirectUrl = new URL(redirectUrl, url).toString();
            response.destroy();
            file.close();
            if (fs.existsSync(dest)) fs.rmSync(dest, { force: true });
            downloadFile(resolvedRedirectUrl, dest, onProgress, signal)
              .then(resolve)
              .catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          cleanup();
          file.close();
          if (fs.existsSync(dest)) fs.rmSync(dest, { force: true });
          reject(
            new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`),
          );
          return;
        }

        const total = parseInt(response.headers["content-length"] || "0", 10);
        let downloaded = 0;

        
        resetTimeout();

        response.on("data", (chunk: Buffer) => {
          if (signal?.aborted) {
            cleanup();
            response.destroy();
            file.close();
            if (fs.existsSync(dest)) fs.rmSync(dest, { force: true });
            reject(new Error("Download cancelled"));
            return;
          }

          resetTimeout(); 

          downloaded += chunk.length;
          if (onProgress) {
            onProgress({
              filename,
              downloaded,
              total,
              percent: total > 0 ? Math.round((downloaded / total) * 100) : 0,
            });
          }
        });

        response.pipe(file);

        
        
        
        response.on("end", () => {
          cleanup();
        });

        file.on("finish", () => {
          cleanup();
          file.close();
          resolve();
        });
      },
    );

    request.on("error", (err) => {
      clearTimeout(connectionTimeout); 
      cleanup();
      file.close();
      try {
        if (fs.existsSync(dest)) fs.rmSync(dest, { force: true });
      } catch {}
      reject(err);
    });

    file.on("error", (err) => {
      cleanup();
      file.close();
      try {
        if (fs.existsSync(dest)) fs.rmSync(dest, { force: true });
      } catch {}
      reject(err);
    });

    if (signal) {
      onAbort = () => {
        console.log("[Modrinth] Download cancelled by user");
        cleanup();
        request.destroy();
        if (currentResponse) {
          currentResponse.destroy();
        }
        file.close();
        try {
          if (fs.existsSync(dest)) fs.rmSync(dest, { force: true });
        } catch {}
        reject(new Error("Download cancelled"));
      };

      signal.addEventListener("abort", onAbort);
    }
  });
}

function normalizeHashForNative(
  hash?: string | null,
): { sha1?: string; sha256?: string } | null {
  if (!hash) return null;
  let value = hash.trim().toLowerCase();
  if (!value) return null;
  if (value.startsWith("sha1:")) value = value.slice(5).trim();
  else if (value.startsWith("sha-1:")) value = value.slice(6).trim();
  else if (value.startsWith("sha256:")) value = value.slice(7).trim();
  else if (value.startsWith("sha-256:")) value = value.slice(8).trim();

  if (value.startsWith("0x")) value = value.slice(2).trim();
  if (!/^[a-f0-9]+$/.test(value)) return null;

  if (value.length === 40) return { sha1: value };
  if (value.length === 64) return { sha256: value };
  return null;
}

function toNativeDownloadHashArgs(
  hashes?: string | { sha1?: string; sha512?: string },
): { supported: boolean; sha1?: string; sha256?: string } {
  if (!hashes) return { supported: true };
  if (typeof hashes === "string") {
    const normalized = normalizeHashForNative(hashes);
    if (!normalized) return { supported: false };
    return { supported: true, ...normalized };
  }

  if (hashes.sha1) {
    const normalized = normalizeHashForNative(hashes.sha1);
    if (!normalized?.sha1) return { supported: false };
    return { supported: true, sha1: normalized.sha1 };
  }

  if (hashes.sha512) {
    return { supported: false };
  }

  return { supported: true };
}


export async function verifyFileHash(
  filePath: string,
  expectedHash?: string | { sha1?: string; sha512?: string },
): Promise<boolean> {
  if (!expectedHash) return true;

  if (!fs.existsSync(filePath)) {
    return false;
  }

  
  try {
    const native = getNativeModule();
    if (typeof expectedHash === "string") {
      if (expectedHash.length === 40) {
        return (await native.verifyFileHash(
          filePath,
          expectedHash,
          undefined,
        )) as boolean;
      }
      if (expectedHash.length === 64) {
        return (await native.verifyFileHash(
          filePath,
          undefined,
          expectedHash,
        )) as boolean;
      }
      
    } else if (expectedHash.sha1) {
      return (await native.verifyFileHash(
        filePath,
        expectedHash.sha1,
        undefined,
      )) as boolean;
    }
  } catch {
    
  }

  return new Promise((resolve) => {
    try {
      let hashType = "sha1";
      let targetHash = "";

      if (typeof expectedHash === "string") {
        
        
        if (expectedHash.length === 128) hashType = "sha512";
        else if (expectedHash.length === 64) hashType = "sha256";
        else hashType = "sha1";
        targetHash = expectedHash;
      } else {
        if (expectedHash.sha512) {
          hashType = "sha512";
          targetHash = expectedHash.sha512;
        } else if (expectedHash.sha1) {
          hashType = "sha1";
          targetHash = expectedHash.sha1;
        } else {
          return resolve(true);
        }
      }

      const hash = crypto.createHash(hashType);
      const stream = fs.createReadStream(filePath);

      stream.on("data", (data) => hash.update(data));
      stream.on("end", () => {
        const calculatedHash = hash.digest("hex");
        const match = calculatedHash.toLowerCase() === targetHash.toLowerCase();
        if (!match) {
          console.error(
            `[Download] Hash mismatch for ${path.basename(filePath)}! Calculated: ${calculatedHash}, Expected: ${targetHash}`,
          );
        }
        resolve(match);
      });
      stream.on("error", (err) => {
        console.error(
          `[Download] Error calculating hash for ${filePath}:`,
          err,
        );
        resolve(false);
      });
    } catch (error) {
      console.error(`[Download] Exception during hash verification:`, error);
      resolve(false);
    }
  });
}


export async function downloadFileAtomic(
  url: string,
  destPath: string,
  hashes?: string | { sha1?: string; sha512?: string },
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<void> {
  if (!onProgress && !signal) {
    const nativeHashArgs = toNativeDownloadHashArgs(hashes);
    if (nativeHashArgs.supported) {
      try {
        const native = getNativeModule() as any;
        if (typeof native.downloadFile === "function") {
          const result = (await native.downloadFile(
            url,
            destPath,
            nativeHashArgs.sha1,
            nativeHashArgs.sha256,
          )) as { success?: boolean; error?: string };
          if (!result?.success) {
            throw new Error(result?.error || "Native atomic download failed");
          }
          return;
        }
      } catch (nativeError) {
        console.warn(
          "[Modrinth] Native atomic download failed, fallback to JS implementation",
          {
            url,
            message: String((nativeError as Error)?.message || nativeError),
          },
        );
      }
    }
  }

  const tmpPath = `${destPath}.tmp`;
  const destDir = path.dirname(destPath);

  
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  try {
    await downloadFile(url, tmpPath, onProgress, signal);

    
    const isHashValid = await verifyFileHash(tmpPath, hashes);
    if (!isHashValid) {
      fs.rmSync(tmpPath, { force: true });
      throw new Error(
        `Hash verification failed for ${path.basename(destPath)}`,
      );
    }

    
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    
    if (!fs.existsSync(tmpPath)) {
      throw new Error(
        `Download failed: temporary file not found for ${path.basename(destPath)}`,
      );
    }

    
    fs.rmSync(destPath, { force: true });
    fs.renameSync(tmpPath, destPath);
  } catch (error) {
    try {
      if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath, { force: true });
    } catch {}
    throw error;
  }
}


export async function downloadModpack(
  version: ModrinthVersion,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<string> {
  
  const mrpackFile = version.files.find((f) => f.primary) || version.files[0];

  if (!mrpackFile) {
    throw new Error("No files found in this version");
  }

  
  const minecraftDir = getMinecraftDir();
  const instancesDir = path.join(minecraftDir, "instances");
  const modpackDir = path.join(instancesDir, version.project_id);

  if (!fs.existsSync(modpackDir)) {
    fs.mkdirSync(modpackDir, { recursive: true });
  }

  
  const mrpackPath = path.join(modpackDir, mrpackFile.filename);

  console.log("[Modrinth] Downloading modpack to:", mrpackPath);

  await downloadFile(mrpackFile.url, mrpackPath, onProgress, signal);

  console.log("[Modrinth] Download complete:", mrpackPath);

  return mrpackPath;
}


export async function getPopularModpacks(
  limit = 10,
): Promise<ModrinthSearchResult> {
  return searchModpacks({
    sortBy: "downloads",
    limit,
  });
}





export interface InstalledModpack {
  id: string;
  name: string;
  version: string;
  filename: string;
  path: string;
  projectId: string;
  size: number;
  downloadedAt: string;
}


export async function getInstalledModpacks(): Promise<InstalledModpack[]> {
  const minecraftDir = getMinecraftDir();
  const instancesDir = path.join(minecraftDir, "instances");

  console.log("[Modrinth] Scanning instances:", instancesDir);

  if (!fs.existsSync(instancesDir)) {
    return [];
  }

  const modpacks: InstalledModpack[] = [];

  try {
    const projectDirs = fs.readdirSync(instancesDir);

    for (const projectId of projectDirs) {
      const projectPath = path.join(instancesDir, projectId);
      const stat = fs.statSync(projectPath);

      if (!stat.isDirectory()) continue;

      const files = fs.readdirSync(projectPath);
      const mrpackFiles = files.filter((f) => f.endsWith(".mrpack"));

      for (const mrpackFile of mrpackFiles) {
        const mrpackPath = path.join(projectPath, mrpackFile);
        const mrpackStat = fs.statSync(mrpackPath);

        const nameMatch = mrpackFile.replace(".mrpack", "");
        const parts = nameMatch.split("-");
        const version = parts.length > 1 ? parts[parts.length - 1] : "unknown";
        const name =
          parts.slice(0, -1).join("-").replace(/\./g, " ") || nameMatch;

        modpacks.push({
          id: `${projectId}-${mrpackFile}`,
          name: name,
          version: version,
          filename: mrpackFile,
          path: mrpackPath,
          projectId: projectId,
          size: mrpackStat.size,
          downloadedAt: mrpackStat.mtime.toISOString(),
        });
      }
    }
  } catch (error) {
    console.error("[Modrinth] Error scanning instances:", error);
  }

  console.log("[Modrinth] Found", modpacks.length, "installed modpacks");
  return modpacks;
}


export async function deleteInstalledModpack(
  modpackPath: string,
): Promise<boolean> {
  try {
    if (fs.existsSync(modpackPath)) {
      fs.unlinkSync(modpackPath);
      console.log("[Modrinth] Deleted modpack:", modpackPath);
      return true;
    }
    return false;
  } catch (error) {
    console.error("[Modrinth] Error deleting modpack:", error);
    return false;
  }
}
