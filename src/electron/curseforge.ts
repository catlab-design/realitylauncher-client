/**
 * ========================================
 * CurseForge Modpack Installer
 * ========================================
 * 
 * Install modpacks from CurseForge .zip files:
 * - Parse manifest.json
 * - Resolve file IDs to URLs using api.curse.tools (proxy)
 * - Download files
 * - Extract overrides
 */

import fs from "node:fs";
import path from "node:path";
import { createInstance, type GameInstance } from "./instances.js";
import { downloadFile } from "./modrinth.js";
import { type InstallProgress, type InstallResult, deduplicateMods, moveResourcePacks } from "./modpack-installer.js";
import AdmZip from "adm-zip";

// ========================================
// Types
// ========================================

interface CurseForgeManifest {
    minecraft: {
        version: string;
        modLoaders: {
            id: string; // e.g. "forge-47.2.0"
            primary: boolean;
        }[];
    };
    manifestType: string;
    manifestVersion: number;
    name: string;
    version: string;
    author: string;
    files: {
        projectID: number;
        fileID: number;
        required: boolean;
    }[];
    overrides: string;
}

// ========================================
// API Utils (using api.curse.tools proxy)
// ========================================

const PROXY_API = "https://api.curse.tools/v1/cf";

async function resolveFileUrl(projectId: number, fileId: number): Promise<string | null> {
    try {
        const response = await fetch(`${PROXY_API}/mods/${projectId}/files/${fileId}`);
        if (!response.ok) {
            console.warn(`[CurseForge] Failed to resolve file ${fileId} for project ${projectId}: ${response.status}`);
            // Try fallback URL construction
            return constructFallbackUrl(fileId);
        }
        const json = await response.json();

        // API returns { data: { downloadUrl: "..." } } structure
        const fileData = json.data || json;
        let downloadUrl = fileData.downloadUrl;

        // If downloadUrl is null (mod author restricted downloads), try fallback
        if (!downloadUrl) {
            console.warn(`[CurseForge] No downloadUrl for file ${fileId}, trying fallback...`);

            // Try to construct URL from fileName if available
            if (fileData.fileName) {
                downloadUrl = constructCdnUrl(fileId, fileData.fileName);
                console.log(`[CurseForge] Using CDN URL for ${fileData.fileName}`);
            } else {
                downloadUrl = constructFallbackUrl(fileId);
            }
        }

        return downloadUrl || null;
    } catch (error) {
        console.error(`[CurseForge] Error resolving file ${fileId}:`, error);
        // Try fallback on error
        return constructFallbackUrl(fileId);
    }
}

/**
 * Construct CurseForge CDN URL from file ID and filename
 * URL pattern: https://edge.forgecdn.net/files/{fileId/1000}/{fileId%1000}/{filename}
 */
function constructCdnUrl(fileId: number, fileName: string): string {
    const firstPart = Math.floor(fileId / 1000);
    const secondPart = fileId % 1000;
    return `https://edge.forgecdn.net/files/${firstPart}/${secondPart}/${encodeURIComponent(fileName)}`;
}

/**
 * Fallback URL using CurseForge download API (may redirect)
 */
function constructFallbackUrl(fileId: number): string | null {
    // This endpoint sometimes works as a redirect
    // Return null to skip - we can't reliably construct URL without filename
    return null;
}

// ========================================
// Installer Logic
// ========================================

export async function installCurseForgeModpack(
    zipPath: string,
    onProgress?: (progress: InstallProgress) => void,
    signal?: AbortSignal
): Promise<InstallResult> {
    console.log("[CurseForge] Installing modpack:", zipPath);
    let createdInstance: GameInstance | null = null;

    try {
        if (signal?.aborted) throw new Error("Installation cancelled");

        const zip = new AdmZip(zipPath);
        const manifestEntry = zip.getEntry("manifest.json");

        if (!manifestEntry) {
            throw new Error("ไม่พบไฟล์ manifest.json ใน Modpack (ไม่ใช่รูปแบบ CurseForge ที่ถูกต้อง)");
        }

        const manifest = JSON.parse(manifestEntry.getData().toString("utf-8")) as CurseForgeManifest;
        console.log("[CurseForge] Parsed manifest:", manifest.name, manifest.version);

        // Step 1: Create Instance
        if (onProgress) {
            onProgress({
                stage: "creating",
                message: `กำลังสร้าง instance: ${manifest.name}`
            });
        }

        // Determine loader
        const primaryLoader = manifest.minecraft.modLoaders.find(l => l.primary);
        let loaderType: "forge" | "fabric" | "neoforge" | "quilt" | "vanilla" = "vanilla";
        let loaderVersion = undefined;

        if (primaryLoader) {
            const loaderId = primaryLoader.id.toLowerCase();
            if (loaderId.startsWith("forge")) {
                loaderType = "forge";
                const v = loaderId.replace("forge-", "");
                // Ensure version starts with mc version for minecraft-java-core
                if (!v.startsWith(manifest.minecraft.version)) {
                    loaderVersion = `${manifest.minecraft.version}-${v}`;
                } else {
                    loaderVersion = v;
                }
            } else if (loaderId.startsWith("fabric")) {
                loaderType = "fabric";
                loaderVersion = loaderId.replace("fabric-", "");
            } else if (loaderId.startsWith("neoforge")) {
                loaderType = "neoforge";
                loaderVersion = loaderId.replace("neoforge-", "");
            } else if (loaderId.startsWith("quilt")) {
                loaderType = "quilt";
                loaderVersion = loaderId.replace("quilt-", "");
            }
        }

        const instance = await createInstance({
            name: manifest.name,
            minecraftVersion: manifest.minecraft.version,
            loader: loaderType,
            loaderVersion,
        });

        createdInstance = instance;
        console.log("[CurseForge] Created instance:", instance.id, instance.name);

        // Step 2: Download Mods
        if (signal?.aborted) throw new Error("Installation cancelled");

        const files = manifest.files;
        let completed = 0;
        const total = files.length;

        // Download in batches
        const batchSize = 5; // Smaller batch size for API usage

        for (let i = 0; i < files.length; i += batchSize) {
            if (signal?.aborted) throw new Error("Installation cancelled");

            const batch = files.slice(i, i + batchSize);

            await Promise.all(batch.map(async (fileInfo) => {
                if (signal?.aborted) return;

                try {
                    // Resolve URL
                    const downloadUrl = await resolveFileUrl(fileInfo.projectID, fileInfo.fileID);

                    if (!downloadUrl) {
                        console.warn(`[CurseForge] Skipping file ${fileInfo.fileID} (no URL found)`);
                        return;
                    }

                    // Determine filename from URL
                    const filename = decodeURIComponent(downloadUrl.split('/').pop() || `file-${fileInfo.fileID}.jar`);
                    const destPath = path.join(instance.gameDirectory, "mods", filename);

                    // Ensure mods dir exists
                    if (!fs.existsSync(path.dirname(destPath))) {
                        fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    }

                    // Download
                    await downloadFile(downloadUrl, destPath, undefined, signal);
                    completed++;

                    if (onProgress) {
                        onProgress({
                            stage: "downloading",
                            message: `กำลังดาวน์โหลด: ${filename}`,
                            current: completed,
                            total,
                            percent: Math.round((completed / total) * 100)
                        });
                    }

                } catch (error: any) {
                    if (error.message === "Download cancelled") throw error;
                    console.error(`[CurseForge] Failed to process file ${fileInfo.fileID}:`, error);
                }
            }));
        }

        // Step 3: Extract Overrides
        const overridesDir = manifest.overrides || "overrides";
        if (onProgress) {
            onProgress({
                stage: "copying",
                message: "กำลังคัดลอกไฟล์ config..."
            });
        }

        const entries = zip.getEntries();
        for (const entry of entries) {
            if (entry.entryName.startsWith(overridesDir + "/") && !entry.isDirectory) {
                const relativePath = entry.entryName.substring(overridesDir.length + 1);
                const destPath = path.join(instance.gameDirectory, relativePath);

                // Create dir if needed
                const destDir = path.dirname(destPath);
                if (!fs.existsSync(destDir)) {
                    fs.mkdirSync(destDir, { recursive: true });
                }

                fs.writeFileSync(destPath, entry.getData());
            }
        }

        // Step 4: Deduplicate mods (remove duplicates from downloaded + overrides)
        const modsDir = path.join(instance.gameDirectory, "mods");
        deduplicateMods(modsDir);

        // Step 5: Move .zip files from mods to resourcepacks folder
        moveResourcePacks(instance.gameDirectory);

        if (onProgress) {
            onProgress({
                stage: "creating",
                message: "ติดตั้งเสร็จสิ้น!",
                percent: 100
            });
        }

        return {
            ok: true,
            instance
        };

    } catch (error: any) {
        // Cleanup: Delete the instance if installation was cancelled or failed
        if (createdInstance) {
            console.log("[CurseForge] Installation failed or cancelled, cleaning up instance:", createdInstance.id);
            try {
                const { deleteInstance } = await import("./instances.js");
                await deleteInstance(createdInstance.id);
                console.log("[CurseForge] Cleanup complete");
            } catch (cleanupError) {
                console.error("[CurseForge] Failed to cleanup instance:", cleanupError);
            }
        }

        console.error("[CurseForge] Install error:", error);
        return {
            ok: false,
            error: error.message
        };
    }
}
