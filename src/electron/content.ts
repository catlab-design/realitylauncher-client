/**
 * ========================================
 * Content Download Module
 * ========================================
 * 
 * Download and install mods, shaders, resourcepacks to instances
 */

import path from "node:path";
import { getInstanceDir, getInstance } from "./instances.js";
import { downloadFile, getVersion, type ModrinthVersion, type DownloadProgress } from "./modrinth.js";

// ========================================
// Types
// ========================================

export type ContentType = "mod" | "shader" | "resourcepack" | "datapack";

export interface DownloadToInstanceOptions {
    projectId: string;
    versionId: string;
    instanceId: string;
    contentType: ContentType;
    contentSource?: "modrinth" | "curseforge";
}

export interface DownloadResult {
    ok: boolean;
    filepath?: string;
    filename?: string;
    error?: string;
}

// ========================================
// Content Folder Mapping
// ========================================

function getContentFolder(contentType: ContentType): string {
    switch (contentType) {
        case "mod":
            return "mods";
        case "shader":
            return "shaderpacks";
        case "resourcepack":
            return "resourcepacks";
        case "datapack":
            return "datapacks";
        default:
            return "mods";
    }
}

/**
 * Get valid file extensions for each content type
 */
function getValidExtensions(contentType: ContentType): string[] {
    switch (contentType) {
        case "mod":
            return [".jar"];
        case "shader":
            return [".zip"];
        case "resourcepack":
            return [".zip"];
        case "datapack":
            return [".zip"];
        default:
            return [".jar", ".zip"];
    }
}

/**
 * Check if a file is valid for the content type
 */
function isValidFileForContentType(filename: string, contentType: ContentType): boolean {
    const validExtensions = getValidExtensions(contentType);
    const lowerFilename = filename.toLowerCase();
    return validExtensions.some(ext => lowerFilename.endsWith(ext));
}

// ========================================
// Download Functions
// ========================================

/**
 * Download content and install to instance
 */
export async function downloadContentToInstance(
    options: DownloadToInstanceOptions,
    onProgress?: (progress: DownloadProgress) => void
): Promise<DownloadResult> {
    const { projectId, versionId, instanceId, contentType, contentSource = "modrinth" } = options;

    console.log(`[Content] Downloading ${contentType} from ${contentSource} to instance:`, { projectId, versionId, instanceId });

    // Get instance
    const instance = getInstance(instanceId);
    if (!instance) {
        return { ok: false, error: "Instance not found" };
    }

    try {
        let fileUrl: string;
        let filename: string;

        if (contentSource === "curseforge") {
            // CurseForge download
            const { getCurseForgeFile, getCurseForgeDownloadUrl } = await import("./curseforge-api.js");

            // Get file info
            const fileResult = await getCurseForgeFile(projectId, versionId);
            if (!fileResult?.data) {
                return { ok: false, error: "Failed to get CurseForge file info" };
            }

            filename = fileResult.data.fileName;

            // Get download URL - CurseForge may have null downloadUrl for some mods
            if (fileResult.data.downloadUrl) {
                fileUrl = fileResult.data.downloadUrl;
            } else {
                // Use proxy API to get download URL
                const urlResult = await getCurseForgeDownloadUrl(projectId, versionId);
                if (!urlResult?.data) {
                    return { ok: false, error: "Failed to get CurseForge download URL" };
                }
                fileUrl = urlResult.data;
            }

            console.log(`[Content] CurseForge file: ${filename}, URL: ${fileUrl}`);
        } else {
            // Modrinth download (existing logic)
            const version = await getVersion(versionId);

            // Find appropriate file for content type
            let file = version.files.find(f => f.primary && isValidFileForContentType(f.filename, contentType));
            if (!file) {
                file = version.files.find(f => isValidFileForContentType(f.filename, contentType));
            }
            if (!file) {
                file = version.files.find(f => f.primary) || version.files[0];
            }
            if (!file) {
                return { ok: false, error: "No files found in version" };
            }

            if (!isValidFileForContentType(file.filename, contentType)) {
                console.warn(`[Content] Warning: File ${file.filename} may not be correct type for ${contentType}`);
            }

            fileUrl = file.url;
            filename = file.filename;
        }

        // Determine target folder
        const contentFolder = getContentFolder(contentType);
        const targetDir = path.join(instance.gameDirectory, contentFolder);
        const targetPath = path.join(targetDir, filename);

        console.log(`[Content] Downloading to:`, targetPath);

        // Download file
        await downloadFile(fileUrl, targetPath, onProgress);

        console.log(`[Content] Download complete:`, filename);

        return {
            ok: true,
            filepath: targetPath,
            filename: filename,
        };
    } catch (error: any) {
        console.error(`[Content] Download error:`, error);
        return {
            ok: false,
            error: error.message || "Download failed",
        };
    }
}

/**
 * Get versions for a project that are compatible with an instance
 */
export async function getCompatibleVersions(
    projectId: string,
    instanceId: string
): Promise<ModrinthVersion[]> {
    const instance = getInstance(instanceId);
    if (!instance) {
        return [];
    }

    try {
        const { getProjectVersions } = await import("./modrinth.js");
        const versions = await getProjectVersions(projectId);

        // Filter by Minecraft version compatibility
        return versions.filter(v =>
            v.game_versions.includes(instance.minecraftVersion)
        );
    } catch (error) {
        console.error(`[Content] Error getting compatible versions:`, error);
        return [];
    }
}
