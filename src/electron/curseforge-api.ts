/**
 * ========================================
 * CurseForge API Client
 * ========================================
 * 
 * API client สำหรับค้นหาและดาวน์โหลดจาก CurseForge
 * ใช้ proxy ผ่าน ml-api เพื่อซ่อน API Key
 */

const ML_API_URL = process.env.ML_API_URL || "https://api.reality.notpumpkins.com";

// ========================================
// Types
// ========================================

export interface CurseForgeCategory {
    id: number;
    gameId: number;
    name: string;
    slug: string;
    url: string;
    iconUrl: string;
    parentCategoryId: number;
    classId: number | null;
    isClass: boolean;
}

export interface CurseForgeAuthor {
    id: number;
    name: string;
    url: string;
}

export interface CurseForgeLogo {
    id: number;
    modId: number;
    title: string;
    description: string;
    thumbnailUrl: string;
    url: string;
}

export interface CurseForgeFileHash {
    value: string;
    algo: number;
}

export interface CurseForgeFile {
    id: number;
    gameId: number;
    modId: number;
    isAvailable: boolean;
    displayName: string;
    fileName: string;
    releaseType: number; // 1=release, 2=beta, 3=alpha
    fileStatus: number;
    hashes: CurseForgeFileHash[];
    fileDate: string;
    fileLength: number;
    downloadCount: number;
    downloadUrl: string | null;
    gameVersions: string[];
    sortableGameVersions: { gameVersionName: string; gameVersion: string }[];
    dependencies: { modId: number; relationType: number }[];
    alternateFileId: number;
    isServerPack: boolean;
}

export interface CurseForgeProject {
    id: number;
    gameId: number;
    name: string;
    slug: string;
    links: {
        websiteUrl: string;
        wikiUrl: string | null;
        issuesUrl: string | null;
        sourceUrl: string | null;
    };
    summary: string;
    status: number;
    downloadCount: number;
    isFeatured: boolean;
    primaryCategoryId: number;
    categories: CurseForgeCategory[];
    classId: number;
    authors: CurseForgeAuthor[];
    logo: CurseForgeLogo | null;
    screenshots: CurseForgeLogo[];
    mainFileId: number;
    latestFiles: CurseForgeFile[];
    latestFilesIndexes: { gameVersion: string; fileId: number; filename: string; releaseType: number }[];
    dateCreated: string;
    dateModified: string;
    dateReleased: string;
    allowModDistribution: boolean | null;
    gamePopularityRank: number;
    isAvailable: boolean;
    thumbsUpCount: number;
}

export interface CurseForgeSearchResult {
    data: CurseForgeProject[];
    pagination: {
        index: number;
        pageSize: number;
        resultCount: number;
        totalCount: number;
    };
}

export interface CurseForgeSearchFilters {
    query?: string;
    projectType?: "mod" | "modpack" | "resourcepack" | "shader" | "datapack";
    gameVersion?: string;
    sortBy?: "relevance" | "downloads" | "follows" | "newest" | "updated";
    pageSize?: number;
    index?: number;
}

// ========================================
// Constants
// ========================================

const API_TIMEOUT_MS = 30000; // 30 seconds timeout

// ========================================
// HTTP Helper
// ========================================

async function fetchJSON<T>(url: string): Promise<T> {
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            headers: {
                "Accept": "application/json",
            },
            signal: controller.signal,
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`CurseForge API error: ${response.status} - ${text}`);
        }

        return response.json() as Promise<T>;
    } catch (error: any) {
        if (error.name === "AbortError") {
            throw new Error("CurseForge API request timeout");
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

// ========================================
// API Functions
// ========================================

/**
 * Search for projects on CurseForge
 */
export async function searchCurseForge(filters: CurseForgeSearchFilters = {}): Promise<CurseForgeSearchResult> {
    const params = new URLSearchParams();

    if (filters.query) params.set("query", filters.query);
    if (filters.projectType) params.set("projectType", filters.projectType);
    if (filters.gameVersion) params.set("gameVersion", filters.gameVersion);
    if (filters.sortBy) params.set("sortBy", filters.sortBy);
    if (filters.pageSize) params.set("pageSize", filters.pageSize.toString());
    if (filters.index !== undefined) params.set("index", filters.index.toString());

    const url = `${ML_API_URL}/curseforge/search?${params}`;
    return fetchJSON<CurseForgeSearchResult>(url);
}

/**
 * Get full project details
 */
export async function getCurseForgeProject(projectId: number | string): Promise<{ data: CurseForgeProject }> {
    const url = `${ML_API_URL}/curseforge/project/${projectId}`;
    return fetchJSON<{ data: CurseForgeProject }>(url);
}

/**
 * Get project files/versions
 */
export async function getCurseForgeFiles(
    projectId: number | string,
    gameVersion?: string
): Promise<{ data: CurseForgeFile[] }> {
    const params = new URLSearchParams();
    if (gameVersion) params.set("gameVersion", gameVersion);

    const queryStr = params.toString();
    const url = `${ML_API_URL}/curseforge/project/${projectId}/files${queryStr ? `?${queryStr}` : ""}`;
    return fetchJSON<{ data: CurseForgeFile[] }>(url);
}

/**
 * Get specific file details
 */
export async function getCurseForgeFile(
    projectId: number | string,
    fileId: number | string
): Promise<{ data: CurseForgeFile }> {
    const url = `${ML_API_URL}/curseforge/file/${projectId}/${fileId}`;
    return fetchJSON<{ data: CurseForgeFile }>(url);
}

/**
 * Get download URL for a file
 */
export async function getCurseForgeDownloadUrl(
    projectId: number | string,
    fileId: number | string
): Promise<{ data: string }> {
    const url = `${ML_API_URL}/curseforge/download/${projectId}/${fileId}`;
    return fetchJSON<{ data: string }>(url);
}

/**
 * Get CurseForge categories
 */
export async function getCurseForgeCategories(): Promise<{ data: CurseForgeCategory[] }> {
    const url = `${ML_API_URL}/curseforge/categories`;
    return fetchJSON<{ data: CurseForgeCategory[] }>(url);
}

/**
 * Get available Minecraft versions from CurseForge
 */
export async function getCurseForgeVersions(): Promise<{ data: { version: string; versionString: string }[] }> {
    const url = `${ML_API_URL}/curseforge/versions`;
    return fetchJSON<{ data: { version: string; versionString: string }[] }>(url);
}
