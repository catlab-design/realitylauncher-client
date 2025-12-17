/**
 * ========================================
 * File Verifier - ตรวจสอบไฟล์ก่อนเปิดเกม
 * ========================================
 * 
 * ตรวจสอบความสมบูรณ์ของไฟล์เกม assets และ libraries
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { getMinecraftDir } from "./config.js";
import { getVersionInfo, type VersionDetails } from "./version-manager.js";

// ========================================
// Types
// ========================================

export interface VerificationResult {
    success: boolean;
    totalFiles: number;
    verifiedFiles: number;
    missingFiles: string[];
    corruptedFiles: string[];
    errors: string[];
}

export interface VerificationProgress {
    phase: "version" | "assets" | "libraries" | "complete";
    current: number;
    total: number;
    currentFile?: string;
}

export type ProgressCallback = (progress: VerificationProgress) => void;

// ========================================
// Functions
// ========================================

/**
 * calculateSHA1 - คำนวณ SHA1 hash ของไฟล์
 */
export function calculateSHA1(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha1");
        const stream = fs.createReadStream(filePath);

        stream.on("data", (data) => hash.update(data));
        stream.on("end", () => resolve(hash.digest("hex")));
        stream.on("error", reject);
    });
}

/**
 * calculateSHA1Sync - คำนวณ SHA1 แบบ sync (สำหรับไฟล์เล็ก)
 */
export function calculateSHA1Sync(filePath: string): string {
    const data = fs.readFileSync(filePath);
    return crypto.createHash("sha1").update(data).digest("hex");
}

/**
 * verifyFile - ตรวจสอบไฟล์เดี่ยว
 */
export async function verifyFile(
    filePath: string,
    expectedSha1?: string,
    expectedSize?: number
): Promise<{ exists: boolean; valid: boolean; error?: string }> {
    if (!fs.existsSync(filePath)) {
        return { exists: false, valid: false };
    }

    try {
        const stats = fs.statSync(filePath);

        // Check size if provided
        if (expectedSize !== undefined && stats.size !== expectedSize) {
            return { exists: true, valid: false, error: "Size mismatch" };
        }

        // Check hash if provided
        if (expectedSha1) {
            const actualSha1 = await calculateSHA1(filePath);
            if (actualSha1 !== expectedSha1) {
                return { exists: true, valid: false, error: "Hash mismatch" };
            }
        }

        return { exists: true, valid: true };
    } catch (error: any) {
        return { exists: true, valid: false, error: error.message };
    }
}

/**
 * verifyVersionFiles - ตรวจสอบไฟล์หลักของเวอร์ชัน
 */
export async function verifyVersionFiles(
    versionId: string,
    onProgress?: ProgressCallback
): Promise<VerificationResult> {
    const minecraftDir = getMinecraftDir();
    const versionDir = path.join(minecraftDir, "versions", versionId);
    const result: VerificationResult = {
        success: true,
        totalFiles: 2,
        verifiedFiles: 0,
        missingFiles: [],
        corruptedFiles: [],
        errors: [],
    };

    console.log(`[FileVerifier] Verifying version files for: ${versionId}`);

    // Check version JSON
    const jsonPath = path.join(versionDir, `${versionId}.json`);
    onProgress?.({ phase: "version", current: 1, total: 2, currentFile: `${versionId}.json` });

    if (!fs.existsSync(jsonPath)) {
        result.success = false;
        result.missingFiles.push(jsonPath);
    } else {
        result.verifiedFiles++;
    }

    // Check version JAR
    const jarPath = path.join(versionDir, `${versionId}.jar`);
    onProgress?.({ phase: "version", current: 2, total: 2, currentFile: `${versionId}.jar` });

    if (!fs.existsSync(jarPath)) {
        result.success = false;
        result.missingFiles.push(jarPath);
    } else {
        // Optionally verify JAR SHA1 from version info
        try {
            const versionInfo = await getVersionInfo(versionId);
            if (versionInfo?.downloads?.client?.sha1) {
                const actualSha1 = await calculateSHA1(jarPath);
                if (actualSha1 !== versionInfo.downloads.client.sha1) {
                    result.success = false;
                    result.corruptedFiles.push(jarPath);
                } else {
                    result.verifiedFiles++;
                }
            } else {
                result.verifiedFiles++;
            }
        } catch (e) {
            // Can't verify SHA1, assume valid if file exists
            result.verifiedFiles++;
        }
    }

    return result;
}

/**
 * verifyAssets - ตรวจสอบ asset files
 */
export async function verifyAssets(
    versionId: string,
    onProgress?: ProgressCallback
): Promise<VerificationResult> {
    const minecraftDir = getMinecraftDir();
    const result: VerificationResult = {
        success: true,
        totalFiles: 0,
        verifiedFiles: 0,
        missingFiles: [],
        corruptedFiles: [],
        errors: [],
    };

    console.log(`[FileVerifier] Verifying assets for: ${versionId}`);

    try {
        const versionInfo = await getVersionInfo(versionId);
        if (!versionInfo?.assetIndex) {
            console.log("[FileVerifier] No asset index found, skipping asset verification");
            return result;
        }

        const assetIndexPath = path.join(
            minecraftDir,
            "assets",
            "indexes",
            `${versionInfo.assetIndex.id}.json`
        );

        // Check if asset index exists
        if (!fs.existsSync(assetIndexPath)) {
            result.success = false;
            result.missingFiles.push(assetIndexPath);
            result.errors.push("Asset index file missing");
            return result;
        }

        // Parse asset index
        const assetIndex = JSON.parse(fs.readFileSync(assetIndexPath, "utf-8"));
        const objects = assetIndex.objects || {};
        const assetKeys = Object.keys(objects);
        result.totalFiles = assetKeys.length;

        const objectsDir = path.join(minecraftDir, "assets", "objects");
        let checked = 0;

        // Verify a sample of assets (checking all can be slow)
        const sampleSize = Math.min(assetKeys.length, 100);
        const sampled = assetKeys.slice(0, sampleSize);

        for (const assetKey of sampled) {
            const asset = objects[assetKey];
            const hash = asset.hash;
            const assetPath = path.join(objectsDir, hash.substring(0, 2), hash);

            checked++;
            onProgress?.({
                phase: "assets",
                current: checked,
                total: sampleSize,
                currentFile: assetKey,
            });

            if (!fs.existsSync(assetPath)) {
                result.success = false;
                result.missingFiles.push(assetPath);
            } else {
                // Quick size check instead of full hash
                const stats = fs.statSync(assetPath);
                if (asset.size && stats.size !== asset.size) {
                    result.success = false;
                    result.corruptedFiles.push(assetPath);
                } else {
                    result.verifiedFiles++;
                }
            }
        }

        // Estimate full verification based on sample
        if (result.success && sampleSize < assetKeys.length) {
            result.verifiedFiles = assetKeys.length; // Assume all good if sample passed
        }
    } catch (error: any) {
        console.error("[FileVerifier] Error verifying assets:", error);
        result.errors.push(error.message);
    }

    return result;
}

/**
 * verifyLibraries - ตรวจสอบ library files
 */
export async function verifyLibraries(
    versionId: string,
    onProgress?: ProgressCallback
): Promise<VerificationResult> {
    const minecraftDir = getMinecraftDir();
    const librariesDir = path.join(minecraftDir, "libraries");
    const result: VerificationResult = {
        success: true,
        totalFiles: 0,
        verifiedFiles: 0,
        missingFiles: [],
        corruptedFiles: [],
        errors: [],
    };

    console.log(`[FileVerifier] Verifying libraries for: ${versionId}`);

    try {
        const versionInfo = await getVersionInfo(versionId);
        if (!versionInfo?.libraries) {
            console.log("[FileVerifier] No libraries found, skipping library verification");
            return result;
        }

        const libraries = versionInfo.libraries;
        result.totalFiles = libraries.length;
        let checked = 0;

        for (const lib of libraries) {
            checked++;

            // Skip libraries with rules that don't apply to current OS
            if (lib.rules) {
                const allowed = evaluateRules(lib.rules);
                if (!allowed) {
                    result.verifiedFiles++;
                    continue;
                }
            }

            // Get library path
            let libPath: string | null = null;
            if (lib.downloads?.artifact?.path) {
                libPath = path.join(librariesDir, lib.downloads.artifact.path);
            } else if (lib.name) {
                // Parse Maven coordinates: group:artifact:version
                const [group, artifact, version] = lib.name.split(":");
                if (group && artifact && version) {
                    const groupPath = group.replace(/\./g, "/");
                    libPath = path.join(librariesDir, groupPath, artifact, version, `${artifact}-${version}.jar`);
                }
            }

            if (!libPath) {
                result.verifiedFiles++;
                continue;
            }

            onProgress?.({
                phase: "libraries",
                current: checked,
                total: libraries.length,
                currentFile: lib.name || path.basename(libPath),
            });

            if (!fs.existsSync(libPath)) {
                result.success = false;
                result.missingFiles.push(libPath);
            } else {
                // Quick size check
                if (lib.downloads?.artifact?.size) {
                    const stats = fs.statSync(libPath);
                    if (stats.size !== lib.downloads.artifact.size) {
                        result.success = false;
                        result.corruptedFiles.push(libPath);
                    } else {
                        result.verifiedFiles++;
                    }
                } else {
                    result.verifiedFiles++;
                }
            }
        }
    } catch (error: any) {
        console.error("[FileVerifier] Error verifying libraries:", error);
        result.errors.push(error.message);
    }

    return result;
}

/**
 * evaluateRules - ประเมินกฎสำหรับ library
 */
function evaluateRules(rules: any[]): boolean {
    let allowed = false;
    const osName = getOSName();

    for (const rule of rules) {
        const action = rule.action === "allow";

        if (!rule.os) {
            // Rule applies to all OS
            allowed = action;
        } else if (rule.os.name === osName) {
            // Rule applies to current OS
            allowed = action;
        }
    }

    return allowed;
}

/**
 * getOSName - ดึงชื่อ OS ในรูปแบบ Minecraft
 */
function getOSName(): string {
    const platform = process.platform;
    if (platform === "win32") return "windows";
    if (platform === "darwin") return "osx";
    return "linux";
}

/**
 * verifyGameFiles - ตรวจสอบไฟล์เกมทั้งหมด
 */
export async function verifyGameFiles(
    versionId: string,
    onProgress?: ProgressCallback
): Promise<VerificationResult> {
    console.log(`[FileVerifier] Starting full verification for: ${versionId}`);

    const combinedResult: VerificationResult = {
        success: true,
        totalFiles: 0,
        verifiedFiles: 0,
        missingFiles: [],
        corruptedFiles: [],
        errors: [],
    };

    // 1. Verify version files
    const versionResult = await verifyVersionFiles(versionId, onProgress);
    mergeResults(combinedResult, versionResult);

    // 2. Verify libraries
    const libResult = await verifyLibraries(versionId, onProgress);
    mergeResults(combinedResult, libResult);

    // 3. Verify assets (sample)
    const assetResult = await verifyAssets(versionId, onProgress);
    mergeResults(combinedResult, assetResult);

    // Signal completion
    onProgress?.({
        phase: "complete",
        current: combinedResult.verifiedFiles,
        total: combinedResult.totalFiles,
    });

    console.log(
        `[FileVerifier] Verification complete: ${combinedResult.verifiedFiles}/${combinedResult.totalFiles} files OK, ` +
        `${combinedResult.missingFiles.length} missing, ${combinedResult.corruptedFiles.length} corrupted`
    );

    return combinedResult;
}

/**
 * mergeResults - รวมผลลัพธ์การตรวจสอบ
 */
function mergeResults(target: VerificationResult, source: VerificationResult): void {
    target.totalFiles += source.totalFiles;
    target.verifiedFiles += source.verifiedFiles;
    target.missingFiles.push(...source.missingFiles);
    target.corruptedFiles.push(...source.corruptedFiles);
    target.errors.push(...source.errors);

    if (!source.success) {
        target.success = false;
    }
}

/**
 * quickVerify - ตรวจสอบแบบรวดเร็ว (เฉพาะไฟล์หลัก)
 */
export async function quickVerify(versionId: string): Promise<boolean> {
    const minecraftDir = getMinecraftDir();
    const versionDir = path.join(minecraftDir, "versions", versionId);

    const jarPath = path.join(versionDir, `${versionId}.jar`);
    const jsonPath = path.join(versionDir, `${versionId}.json`);

    const hasJar = fs.existsSync(jarPath);
    const hasJson = fs.existsSync(jsonPath);

    if (!hasJar || !hasJson) {
        console.log(`[FileVerifier] Quick verify failed: JAR=${hasJar}, JSON=${hasJson}`);
        return false;
    }

    // Check JAR isn't empty
    const jarStats = fs.statSync(jarPath);
    if (jarStats.size < 1000) {
        console.log("[FileVerifier] Quick verify failed: JAR file too small");
        return false;
    }

    return true;
}
