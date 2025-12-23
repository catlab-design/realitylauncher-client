/**
 * ========================================
 * Modrinth API Client
 * ========================================
 * 
 * API client สำหรับค้นหาและดาวน์โหลด modpacks จาก Modrinth
 * 
 * API Docs: https://docs.modrinth.com/api
 */

import https from "node:https";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { getMinecraftDir } from "./config.js";

// ========================================
// Constants
// ========================================

const MODRINTH_API = "https://api.modrinth.com/v2";
const USER_AGENT = "RealityLauncher/1.0.0 (contact@catlab.net)";

// ========================================
// Types
// ========================================

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

// ========================================
// HTTP Helper
// ========================================

function fetchJSON<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const request = https.get(
            url,
            {
                headers: {
                    "User-Agent": USER_AGENT,
                    Accept: "application/json",
                },
            },
            (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
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
            }
        );

        request.on("error", reject);
        request.setTimeout(30000, () => {
            request.destroy();
            reject(new Error("Request timeout"));
        });
    });
}

// ========================================
// API Functions
// ========================================

/**
 * Search for projects on Modrinth
 */
export async function searchModpacks(filters: SearchFilters = {}): Promise<ModrinthSearchResult> {
    const { query = "", projectType = "modpack", gameVersion, loader, limit = 20, offset = 0, sortBy = "relevance" } = filters;

    // Build facets array
    const facets: string[][] = [[`project_type:${projectType}`]];

    if (gameVersion) {
        facets.push([`versions:${gameVersion}`]);
    }

    if (loader) {
        facets.push([`categories:${loader}`]);
    }

    // Build URL
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

/**
 * Get full project details
 */
export async function getProject(idOrSlug: string): Promise<ModrinthProjectFull> {
    const url = `${MODRINTH_API}/project/${encodeURIComponent(idOrSlug)}`;
    console.log("[Modrinth] Getting project:", url);

    return fetchJSON<ModrinthProjectFull>(url);
}

/**
 * Get all versions of a project
 */
export async function getProjectVersions(idOrSlug: string): Promise<ModrinthVersion[]> {
    const url = `${MODRINTH_API}/project/${encodeURIComponent(idOrSlug)}/version`;
    console.log("[Modrinth] Getting versions:", url);

    return fetchJSON<ModrinthVersion[]>(url);
}

/**
 * Get a specific version
 */
export async function getVersion(versionId: string): Promise<ModrinthVersion> {
    const url = `${MODRINTH_API}/version/${encodeURIComponent(versionId)}`;
    console.log("[Modrinth] Getting version:", url);

    return fetchJSON<ModrinthVersion>(url);
}

/**
 * Get available Minecraft versions from Modrinth
 */
export async function getGameVersions(): Promise<{ version: string; version_type: string }[]> {
    const url = `${MODRINTH_API}/tag/game_version`;
    return fetchJSON<{ version: string; version_type: string }[]>(url);
}

/**
 * Get available loaders from Modrinth
 */
export async function getLoaders(): Promise<{ name: string; icon: string }[]> {
    const url = `${MODRINTH_API}/tag/loader`;
    return fetchJSON<{ name: string; icon: string }[]>(url);
}

// ========================================
// Download Functions
// ========================================

export interface DownloadProgress {
    filename: string;
    downloaded: number;
    total: number;
    percent: number;
}

type ProgressCallback = (progress: DownloadProgress) => void;

/**
 * Download a file from URL to destination
 */
export function downloadFile(
    url: string,
    dest: string,
    onProgress?: ProgressCallback
): Promise<void> {
    return new Promise((resolve, reject) => {
        // Ensure directory exists
        const dir = path.dirname(dest);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const file = fs.createWriteStream(dest);
        const filename = path.basename(dest);

        const protocol = url.startsWith("https") ? https : http;

        const request = protocol.get(url, { headers: { "User-Agent": USER_AGENT } }, (response) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                const redirectUrl = response.headers.location;
                if (redirectUrl) {
                    file.close();
                    fs.unlinkSync(dest);
                    downloadFile(redirectUrl, dest, onProgress).then(resolve).catch(reject);
                    return;
                }
            }

            if (response.statusCode !== 200) {
                file.close();
                fs.unlinkSync(dest);
                reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                return;
            }

            const total = parseInt(response.headers["content-length"] || "0", 10);
            let downloaded = 0;

            response.on("data", (chunk: Buffer) => {
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

            file.on("finish", () => {
                file.close();
                resolve();
            });
        });

        request.on("error", (err) => {
            file.close();
            fs.unlink(dest, () => { }); // Delete incomplete file
            reject(err);
        });

        file.on("error", (err) => {
            file.close();
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
}

/**
 * Download and install a modpack version
 */
export async function downloadModpack(
    version: ModrinthVersion,
    onProgress?: ProgressCallback
): Promise<string> {
    // Find the primary .mrpack file
    const mrpackFile = version.files.find((f) => f.primary) || version.files[0];

    if (!mrpackFile) {
        throw new Error("No files found in this version");
    }

    // Create instances directory
    const minecraftDir = getMinecraftDir();
    const instancesDir = path.join(minecraftDir, "instances");
    const modpackDir = path.join(instancesDir, version.project_id);

    if (!fs.existsSync(modpackDir)) {
        fs.mkdirSync(modpackDir, { recursive: true });
    }

    // Download the .mrpack file
    const mrpackPath = path.join(modpackDir, mrpackFile.filename);

    console.log("[Modrinth] Downloading modpack to:", mrpackPath);

    await downloadFile(mrpackFile.url, mrpackPath, onProgress);

    console.log("[Modrinth] Download complete:", mrpackPath);

    return mrpackPath;
}

/**
 * Get popular modpacks (featured/trending)
 */
export async function getPopularModpacks(limit = 10): Promise<ModrinthSearchResult> {
    return searchModpacks({
        sortBy: "downloads",
        limit,
    });
}

// ========================================
// Installed Modpacks
// ========================================

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

/**
 * Scan instances folder for downloaded modpacks
 */
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
                const name = parts.slice(0, -1).join("-").replace(/\./g, " ") || nameMatch;

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

/**
 * Delete an installed modpack
 */
export async function deleteInstalledModpack(modpackPath: string): Promise<boolean> {
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
