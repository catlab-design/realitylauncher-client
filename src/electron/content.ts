

import path from "node:path";
import { getInstanceDir, getInstance } from "./instances.js";
import { downloadFile, getVersion, type ModrinthVersion, type DownloadProgress } from "./modrinth.js";





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


function isValidFileForContentType(filename: string, contentType: ContentType): boolean {
    const validExtensions = getValidExtensions(contentType);
    const lowerFilename = filename.toLowerCase();
    return validExtensions.some(ext => lowerFilename.endsWith(ext));
}






export async function downloadContentToInstance(
    options: DownloadToInstanceOptions,
    onProgress?: (progress: DownloadProgress) => void
): Promise<DownloadResult> {
    const { projectId, versionId, instanceId, contentType, contentSource = "modrinth" } = options;

    console.log(`[Content] Downloading ${contentType} from ${contentSource} to instance:`, { projectId, versionId, instanceId });

    
    const instance = getInstance(instanceId);
    if (!instance) {
        return { ok: false, error: "Instance not found" };
    }

    try {
        let fileUrl: string;
        let filename: string;

        if (contentSource === "curseforge") {
            
            const { getCurseForgeFile, getCurseForgeDownloadUrl } = await import("./curseforge-api.js");

            
            const fileResult = await getCurseForgeFile(projectId, versionId);
            if (!fileResult?.data) {
                return { ok: false, error: "Failed to get CurseForge file info" };
            }

            filename = fileResult.data.fileName;

            
            if (fileResult.data.downloadUrl) {
                fileUrl = fileResult.data.downloadUrl;
            } else {
                
                const urlResult = await getCurseForgeDownloadUrl(projectId, versionId);
                if (!urlResult?.data) {
                    return { ok: false, error: "Failed to get CurseForge download URL" };
                }
                fileUrl = urlResult.data;
            }

            console.log(`[Content] CurseForge file: ${filename}, URL: ${fileUrl}`);
        } else {
            
            const version = await getVersion(versionId);

            
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

        
        const contentFolder = getContentFolder(contentType);
        const targetDir = path.join(instance.gameDirectory, contentFolder);
        const targetPath = path.join(targetDir, filename);

        console.log(`[Content] Downloading to:`, targetPath);

        
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

        
        return versions.filter(v =>
            v.game_versions.includes(instance.minecraftVersion)
        );
    } catch (error) {
        console.error(`[Content] Error getting compatible versions:`, error);
        return [];
    }
}
