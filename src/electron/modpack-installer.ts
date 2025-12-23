/**
 * ========================================
 * Modpack Installer Module
 * ========================================
 * 
 * Install modpacks from .mrpack files:
 * - Parse modrinth.index.json
 * - Download all mods in parallel
 * - Extract overrides folder
 * - Create new instance with correct loader
 */

import fs from "node:fs";
import path from "node:path";
import { createInstance, type GameInstance, type LoaderType } from "./instances.js";
import { downloadFile, type DownloadProgress } from "./modrinth.js";
import AdmZip from "adm-zip";

// ========================================
// Types
// ========================================

export interface ModpackIndex {
    formatVersion: number;
    game: string;
    versionId: string;
    name: string;
    summary?: string;
    files: ModpackFile[];
    dependencies: ModpackDependencies;
}

export interface ModpackFile {
    path: string;
    downloads: string[];
    fileSize: number;
    hashes: {
        sha1?: string;
        sha512?: string;
    };
    env?: {
        client?: "required" | "optional" | "unsupported";
        server?: "required" | "optional" | "unsupported";
    };
}

export interface ModpackDependencies {
    minecraft: string;
    "fabric-loader"?: string;
    forge?: string;
    neoforge?: string;
    "quilt-loader"?: string;
}

export interface InstallProgress {
    stage: "extracting" | "downloading" | "copying" | "creating";
    message: string;
    current?: number;
    total?: number;
    percent?: number;
}

export interface ModConflict {
    type: "duplicate_mod" | "library_conflict";
    file1: string;
    file2?: string;
    reason: string;
}

export interface InstallResult {
    ok: boolean;
    instance?: GameInstance;
    error?: string;
}

// ========================================
// Progress Callback
// ========================================

type ProgressCallback = (progress: InstallProgress) => void;

// ========================================
// ZIP Extraction (using adm-zip)
// ========================================

/**
 * Extract a single entry from ZIP file
 */
function extractZipEntry(zipPath: string, entryPath: string): Buffer | null {
    try {
        console.log("[ModpackInstaller] Extracting entry:", entryPath, "from:", zipPath);
        const zip = new AdmZip(zipPath);
        const entry = zip.getEntry(entryPath);

        if (!entry) {
            console.error("[ModpackInstaller] Entry not found:", entryPath);
            // List available entries for debugging
            const entries = zip.getEntries().map(e => e.entryName).slice(0, 10);
            console.log("[ModpackInstaller] Available entries (first 10):", entries);
            return null;
        }

        const content = entry.getData();
        console.log("[ModpackInstaller] Extracted entry size:", content.length, "bytes");
        return content;
    } catch (error) {
        console.error("[ModpackInstaller] Extract entry error:", error);
        return null;
    }
}


/**
 * Extract a subdirectory from ZIP to destination
 */
function extractZipToDirectory(zipPath: string, destDir: string, subPath?: string): void {
    try {
        console.log("[ModpackInstaller] Extracting to directory:", destDir, "subPath:", subPath || "(none)");
        const zip = new AdmZip(zipPath);

        if (subPath) {
            // Extract only entries under the subPath
            const normalizedSubPath = subPath.endsWith("/") ? subPath : subPath + "/";

            for (const entry of zip.getEntries()) {
                if (entry.entryName.startsWith(normalizedSubPath) && !entry.isDirectory) {
                    const relativePath = entry.entryName.substring(normalizedSubPath.length);
                    if (relativePath) {
                        const destPath = path.join(destDir, relativePath);
                        const destDirPath = path.dirname(destPath);

                        if (!fs.existsSync(destDirPath)) {
                            fs.mkdirSync(destDirPath, { recursive: true });
                        }

                        fs.writeFileSync(destPath, entry.getData());
                    }
                }
            }
        } else {
            // Extract entire ZIP
            zip.extractAllTo(destDir, true);
        }

        console.log("[ModpackInstaller] Extraction complete");
    } catch (error) {
        console.error("[ModpackInstaller] Extract to directory error:", error);
        throw error;
    }
}

// ========================================
// Parse Modpack Index
// ========================================

export async function parseModpackIndex(mrpackPath: string): Promise<ModpackIndex> {
    console.log("[ModpackInstaller] Parsing:", mrpackPath);

    const content = extractZipEntry(mrpackPath, "modrinth.index.json");

    if (!content) {
        throw new Error("Could not find modrinth.index.json in modpack");
    }

    // Clean the content - remove BOM and trim
    const cleanContent = content.toString("utf-8").replace(/^\uFEFF/, "").trim();

    try {
        const index = JSON.parse(cleanContent) as ModpackIndex;
        console.log("[ModpackInstaller] Parsed modpack:", index.name, "version:", index.versionId);
        return index;
    } catch (error) {
        console.error("[ModpackInstaller] JSON parse error:", error);
        throw new Error("Invalid modrinth.index.json format");
    }
}

// ========================================
// Determine Loader Type
// ========================================

function getLoaderFromDependencies(deps: ModpackDependencies): { type: LoaderType; version?: string } {
    if (deps["fabric-loader"]) {
        return { type: "fabric", version: deps["fabric-loader"] };
    }
    if (deps.forge) {
        return { type: "forge", version: deps.forge };
    }
    if (deps.neoforge) {
        return { type: "neoforge", version: deps.neoforge };
    }
    if (deps["quilt-loader"]) {
        return { type: "quilt", version: deps["quilt-loader"] };
    }
    return { type: "vanilla" };
}

// ========================================
// Download Modpack Files
// ========================================

async function downloadModpackFiles(
    files: ModpackFile[],
    destDir: string,
    onProgress?: ProgressCallback
): Promise<void> {
    const clientFiles = files.filter(f =>
        !f.env || f.env.client !== "unsupported"
    );

    console.log(`[ModpackInstaller] Downloading ${clientFiles.length} files...`);

    let completed = 0;
    const total = clientFiles.length;

    // Download in batches of 5 for better performance
    const batchSize = 5;

    for (let i = 0; i < clientFiles.length; i += batchSize) {
        const batch = clientFiles.slice(i, i + batchSize);

        await Promise.all(batch.map(async (file) => {
            const destPath = path.join(destDir, file.path);
            const destDirPath = path.dirname(destPath);

            // Ensure directory exists
            if (!fs.existsSync(destDirPath)) {
                fs.mkdirSync(destDirPath, { recursive: true });
            }

            // Skip if already exists with correct size
            if (fs.existsSync(destPath)) {
                const stat = fs.statSync(destPath);
                if (stat.size === file.fileSize) {
                    console.log(`[ModpackInstaller] Skipping (exists): ${file.path}`);
                    completed++;
                    return;
                }
            }

            // Download from first available URL
            const url = file.downloads[0];
            if (!url) {
                console.warn(`[ModpackInstaller] No download URL for: ${file.path}`);
                return;
            }

            console.log(`[ModpackInstaller] Downloading: ${file.path}`);

            try {
                await downloadFile(url, destPath);
                completed++;

                if (onProgress) {
                    onProgress({
                        stage: "downloading",
                        message: `กำลังดาวน์โหลด: ${path.basename(file.path)}`,
                        current: completed,
                        total,
                        percent: Math.round((completed / total) * 100),
                    });
                }
            } catch (error) {
                console.error(`[ModpackInstaller] Download failed: ${file.path}`, error);
            }
        }));
    }

    console.log(`[ModpackInstaller] Download complete: ${completed}/${total} files`);
}

// ========================================
// Extract Overrides
// ========================================

async function extractOverrides(
    mrpackPath: string,
    destDir: string,
    onProgress?: ProgressCallback
): Promise<void> {
    console.log("[ModpackInstaller] Extracting overrides to:", destDir);

    if (onProgress) {
        onProgress({
            stage: "copying",
            message: "กำลังคัดลอกไฟล์ config...",
        });
    }

    try {
        // Extract overrides folder
        extractZipToDirectory(mrpackPath, destDir, "overrides");
        console.log("[ModpackInstaller] Overrides extracted successfully");
    } catch (error) {
        console.log("[ModpackInstaller] No overrides folder or extraction error:", error);
    }

    try {
        // Also check for client-overrides
        extractZipToDirectory(mrpackPath, destDir, "client-overrides");
        console.log("[ModpackInstaller] Client overrides extracted successfully");
    } catch (error) {
        // client-overrides is optional
    }
}

// ========================================
// Main Install Function
// ========================================

export async function installModpack(
    mrpackPath: string,
    onProgress?: ProgressCallback
): Promise<InstallResult> {
    console.log("[ModpackInstaller] Installing modpack:", mrpackPath);

    try {
        // Step 1: Parse modpack index
        if (onProgress) {
            onProgress({
                stage: "extracting",
                message: "กำลังอ่านข้อมูล modpack...",
            });
        }

        const index = await parseModpackIndex(mrpackPath);

        // Step 2: Create instance
        if (onProgress) {
            onProgress({
                stage: "creating",
                message: `กำลังสร้าง instance: ${index.name}`,
            });
        }

        const loader = getLoaderFromDependencies(index.dependencies);

        const instance = createInstance({
            name: index.name,
            minecraftVersion: index.dependencies.minecraft,
            loader: loader.type,
            loaderVersion: loader.version,
        });

        console.log("[ModpackInstaller] Created instance:", instance.id, instance.name);

        // Step 3: Download all mods
        await downloadModpackFiles(index.files, instance.gameDirectory, onProgress);

        // Step 4: Extract overrides
        await extractOverrides(mrpackPath, instance.gameDirectory, onProgress);

        if (onProgress) {
            onProgress({
                stage: "creating",
                message: "ติดตั้งเสร็จสิ้น!",
                percent: 100,
            });
        }

        console.log("[ModpackInstaller] Installation complete:", instance.name);

        return {
            ok: true,
            instance,
        };
    } catch (error: any) {
        console.error("[ModpackInstaller] Installation failed:", error);
        return {
            ok: false,
            error: error.message || "Installation failed",
        };
    }
}

// ========================================
// Mod Conflict Detection
// ========================================

export function detectModConflicts(modsDir: string): ModConflict[] {
    const conflicts: ModConflict[] = [];

    if (!fs.existsSync(modsDir)) {
        return conflicts;
    }

    const files = fs.readdirSync(modsDir).filter(f => f.endsWith(".jar"));

    // Track mod names (simplified - just checks filename patterns)
    const modNames = new Map<string, string[]>();

    for (const file of files) {
        // Extract mod name from filename (before version number)
        // Pattern: modname-version.jar or modname_version.jar
        const match = file.match(/^(.+?)[-_]\d/);
        const modName = match ? match[1].toLowerCase() : file.toLowerCase();

        if (!modNames.has(modName)) {
            modNames.set(modName, []);
        }
        modNames.get(modName)!.push(file);
    }

    // Check for duplicates
    for (const [name, fileList] of modNames) {
        if (fileList.length > 1) {
            conflicts.push({
                type: "duplicate_mod",
                file1: fileList[0],
                file2: fileList[1],
                reason: `พบ mod "${name}" หลายเวอร์ชัน: ${fileList.join(", ")}`,
            });
        }
    }

    // Check for known conflicting libraries
    const conflictingLibs = [
        { pattern: /asm[-_]?\d/i, name: "ASM" },
        { pattern: /guava[-_]?\d/i, name: "Guava" },
        { pattern: /gson[-_]?\d/i, name: "Gson" },
    ];

    for (const lib of conflictingLibs) {
        const matches = files.filter(f => lib.pattern.test(f));
        if (matches.length > 1) {
            conflicts.push({
                type: "library_conflict",
                file1: matches[0],
                file2: matches[1],
                reason: `พบ library "${lib.name}" ซ้ำกัน อาจทำให้เกมขัดข้อง`,
            });
        }
    }

    return conflicts;
}
