/**
 * Cloud Instances Module
 * 
 * Handles instance management via cloud API
 * Including joining instances via Invite Key
 */

import { BrowserWindow } from 'electron';
import { downloadFileAtomic, verifyFileHash, downloadFile } from './modrinth.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Use production API URL (process.env doesn't work in bundled Electron)
const API_URL = 'https://api.reality.notpumpkins.com';

/**
 * Verify that a JAR/ZIP file is valid (not corrupted)
 */
function isValidZipFile(filePath: string): boolean {
    try {
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(4);

        // Check ZIP magic number at start (PK\x03\x04)
        fs.readSync(fd, buffer, 0, 4, 0);
        const hasValidHeader = buffer[0] === 0x50 && buffer[1] === 0x4B &&
            (buffer[2] === 0x03 || buffer[2] === 0x05) &&
            (buffer[3] === 0x04 || buffer[3] === 0x06);

        if (!hasValidHeader) {
            fs.closeSync(fd);
            return false;
        }

        // Check for END header (PK\x05\x06) - read last 22+ bytes
        const stats = fs.statSync(filePath);
        const endBuffer = Buffer.alloc(Math.min(256, stats.size));
        const readPos = Math.max(0, stats.size - 256);
        fs.readSync(fd, endBuffer, 0, endBuffer.length, readPos);
        fs.closeSync(fd);

        // Search for END signature
        for (let i = endBuffer.length - 22; i >= 0; i--) {
            if (endBuffer[i] === 0x50 && endBuffer[i + 1] === 0x4B &&
                endBuffer[i + 2] === 0x05 && endBuffer[i + 3] === 0x06) {
                return true;
            }
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Download file with soft hash check - warns on mismatch but doesn't fail
 * Used for cloud sync where hash in DB might be stale
 */
async function downloadFileWithSoftHashCheck(
    url: string,
    destPath: string,
    expectedHash?: string,
    signal?: AbortSignal
): Promise<void> {
    const tmpPath = `${destPath}.tmp`;
    const destDir = path.dirname(destPath);

    // Ensure directory exists before download
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    try {
        await downloadFile(url, tmpPath, undefined, signal);

        // Verify hash but only warn on mismatch
        if (expectedHash) {
            const isValid = await verifyFileHash(tmpPath, expectedHash);
            if (!isValid) {
                console.warn(`[Cloud Sync] Hash mismatch for ${path.basename(destPath)} - file may have been updated on server`);
                // Don't throw - just warn and continue
            }
        }

        // For JAR files, verify the ZIP structure is valid
        if (destPath.endsWith('.jar')) {
            if (!isValidZipFile(tmpPath)) {
                console.error(`[Cloud Sync] Downloaded file ${path.basename(destPath)} is corrupted (invalid ZIP structure)`);
                fs.unlinkSync(tmpPath);
                throw new Error(`Downloaded file is corrupted: ${path.basename(destPath)}`);
            }
        }

        // Ensure directory still exists before rename (may have been deleted during download)
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        // Verify tmp file exists before rename
        if (!fs.existsSync(tmpPath)) {
            throw new Error(`Download failed: temporary file not found for ${path.basename(destPath)}`);
        }

        // Atomic rename
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        fs.renameSync(tmpPath, destPath);

    } catch (error) {
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch { }
        throw error;
    }
}

interface JoinInstanceResult {
    ok: boolean;
    error?: string;
    message?: string;
    instance?: any;
}

/**
 * Join an instance using Invite Key
 * 
 * @param key - Invite Key (e.g., "7TKM-3F7D-WDSW-8T2L")
 * @param authToken - User's authentication token
 * @returns Result object with instance data if successful
 */
export async function joinInstanceByKey(key: string, authToken: string): Promise<JoinInstanceResult> {
    try {
        // Format key: trim and uppercase only (preserve dashes/custom format)
        const formattedKey = key.trim().toUpperCase();

        console.log('[Cloud Instances] API_URL:', API_URL);
        console.log('[Cloud Instances] Joining instance with key:', formattedKey);
        console.log('[Cloud Instances] Auth token present:', !!authToken);

        const response = await fetch(`${API_URL}/instances/join`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ key: formattedKey }),
        });

        const data = await response.json();

        if (response.ok) {
            console.log('[Cloud Instances] Successfully joined instance:', data.instance?.name);
            return {
                ok: true,
                message: data.message || 'เข้าร่วม instance สำเร็จ',
                instance: data.instance,
            };
        } else {
            console.error('[Cloud Instances] Failed to join:', data.error);
            return {
                ok: false,
                error: data.error || 'ไม่สามารถเข้าร่วม instance ได้',
            };
        }
    } catch (error: any) {
        console.error('[Cloud Instances] Network error:', error);
        return {
            ok: false,
            error: error.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ',
        };
    }
}

/**
 * Join a PUBLIC instance by ID (no key required)
 */
export async function joinPublicInstance(instanceId: string, authToken: string): Promise<JoinInstanceResult> {
    try {
        console.log('[Cloud Instances] Joining public instance:', instanceId);

        const response = await fetch(`${API_URL}/instances/${instanceId}/join`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            }
        });

        const data = await response.json();

        if (response.ok) {
            console.log('[Cloud Instances] Successfully joined public instance');
            return {
                ok: true,
                message: data.message || 'เข้าร่วม instance สำเร็จ',
                instance: data.instance,
            };
        } else {
            console.error('[Cloud Instances] Failed to join:', data.error);
            return {
                ok: false,
                error: data.error || 'ไม่สามารถเข้าร่วม instance ได้',
            };
        }
    } catch (error: any) {
        console.error('[Cloud Instances] Network error:', error);
        return {
            ok: false,
            error: error.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ',
        };
    }
}

/**
 * Leave an instance (remove from members)
 */
export async function leaveInstance(instanceId: string, authToken: string): Promise<{ ok: boolean; error?: string }> {
    try {
        console.log('[Cloud Instances] Leaving instance:', instanceId);

        const response = await fetch(`${API_URL}/instances/${instanceId}/leave`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            }
        });

        const data = await response.json();

        if (response.ok) {
            console.log('[Cloud Instances] Left instance successfully');
            return { ok: true };
        } else {
            console.error('[Cloud Instances] Failed to leave:', data.error);
            return { ok: false, error: data.error };
        }
    } catch (error: any) {
        console.error('[Cloud Instances] Network error:', error);
        return { ok: false, error: error.message };
    }
}

/**
 * Fetch all cloud instances (Owned & Member)
 */
export async function fetchJoinedServers(authToken: string): Promise<{ owned: any[], member: any[] }> {
    try {
        console.log('[Cloud Instances] Fetching instances...');
        console.log('[Cloud Instances] Token (first 20 chars):', authToken?.substring(0, 20) || 'EMPTY');
        const response = await fetch(`${API_URL}/instances`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            const errBody = await response.text();
            console.error('[Cloud Instances] Failed to fetch:', response.status, response.statusText, errBody);
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data: any = await response.json();
        return {
            owned: data.owned || [],
            member: data.member || []
        };
    } catch (error) {
        console.error('[Cloud Instances] Fetch error:', error);
        throw error;
    }
}

/**
 * Sync all cloud instances (Owned & Member) to local
 */
export async function syncCloudInstances(authToken: string): Promise<void> {
    try {
        const { importCloudInstance, getInstance } = await import("./instances.js");

        const data = await fetchJoinedServers(authToken);

        let count = 0;
        const allInstances = [...data.owned, ...data.member];

        // Only update EXISTING instances
        // New instances will stay "Available" (in cloud) but "Not Installed" (locally)
        // User must click "Install" to create them (via instances-cloud-install)

        for (const instance of allInstances) {
            const id = instance.storagePath || instance.id; // Correct ID derivation
            const existing = getInstance(id);

            if (existing) {
                // Instance exists locally - Update metadata
                await importCloudInstance(instance);
                count++;
            } else {
                // Instance does not exist locally - Skip
                // console.log(`[Cloud Instances] New instance found: ${instance.name}. Skipping auto-install.`);
            }
        }

        console.log(`[Cloud Instances] Synced (Updated) ${count} instances`);
    } catch (error) {
        console.error('[Cloud Instances] Sync error:', error);
    }
}

/**
 * Sync server mods (download updates, remove unknown)
 * Respects lockedMods to prevent deletion
 */
export async function syncServerMods(
    instanceId: string,
    authToken: string,
    onProgress?: (data: { type: string; task: string; current?: number; total?: number; percent?: number }) => void,
    signal?: AbortSignal
): Promise<void> {
    const { getInstance } = await import("./instances.js");
    // const { downloadFile } = await import("./modrinth.js"); // Removed, using top-level import
    const fs = await import("node:fs");
    const path = await import("node:path");

    const instance = getInstance(instanceId);
    if (!instance) {
        console.error(`[Cloud Sync] Instance ${instanceId} not found in local client.`);
        throw new Error(`Instance ${instanceId} not found locally.`);
    }

    if (!instance.cloudId) {
        console.error(`[Cloud Sync] Instance ${instanceId} is not a cloud instance (missing cloudId).`, instance);
        throw new Error(`Instance ${instanceId} is not linked to a cloud server.`);
    }

    // Reuse API_URL from top of file scope
    // Note: This relies on API_URL being available in module scope

    console.log(`[Cloud Sync] Syncing mods for ${instance.name} (${instance.id})...`);
    if (onProgress) onProgress({ type: "sync-start", task: "กำลังตรวจสอบไฟล์..." });

    if (signal?.aborted) throw new Error("Cancelled");

    try {
        // 1. Fetch Server Content (Mods list)
        // Also fetch Instance Metadata to update local settings (loader, version, icon)

        // Parallel fetch for content and metadata
        const [contentRes, metaRes] = await Promise.all([
            fetch(`${API_URL}/instances/${instance.cloudId}/content`, {
                headers: { 'Authorization': `Bearer ${authToken}` },
                signal
            }),
            fetch(`${API_URL}/instances/${instance.cloudId}`, {
                headers: { 'Authorization': `Bearer ${authToken}` },
                signal
            })
        ]);

        if (!contentRes.ok) {
            const errText = await contentRes.text();
            console.error(`[Cloud Sync] Content fetch failed: ${contentRes.status} ${contentRes.statusText}`, errText);
            throw new Error(`Failed to fetch server content: ${contentRes.statusText} (${contentRes.status})`);
        }

        // Process Metadata if available
        if (metaRes.ok) {
            try {
                const metaData = await metaRes.json();
                if (metaData && metaData.id) {
                    const { importCloudInstance } = await import("./instances.js");
                    await importCloudInstance(metaData);
                    console.log(`[Cloud Sync] Updated instance metadata for ${instance.name}`);
                }
            } catch (e) {
                console.error("[Cloud Sync] Failed to process metadata update:", e);
                // Continue with content sync even if metadata update fails
            }
        }

        const data = await contentRes.json();
        const serverMods = data.mods as Array<{ filename: string; url: string; size?: number; hash?: string }>;

        if (!serverMods || !Array.isArray(serverMods)) {
            console.log("[Cloud Sync] No mods returned from server.");
            return;
        }

        // Deduplicate mods by filename to prevent redundant downloads
        const uniqueMods = new Map<string, { filename: string; url: string; size?: number; hash?: string }>();
        for (const mod of serverMods) {
            uniqueMods.set(mod.filename, mod);
        }

        // Filter out .keep files (used for empty folders on server)
        const validServerMods = Array.from(uniqueMods.values()).filter(m => !m.filename.endsWith('.keep'));

        // Limit cleanup to mods directory ONLY to prevent deleting saves/configs/options
        const modsDir = path.join(instance.gameDirectory, "mods");
        if (!fs.existsSync(modsDir)) {
            fs.mkdirSync(modsDir, { recursive: true });
        }

        if (onProgress) onProgress({ type: "sync-check", task: "กำลังตรวจสอบความสมบูรณ์..." });

        // 2. Download missing/updated files (ANY file in the instance)
        const downloadQueue = validServerMods.filter(mod => {
            // mod.filename is relative path e.g. "mods/foo.jar" or "config/bar.json"
            const filePath = path.join(instance.gameDirectory, mod.filename);

            // Ensure parent dir exists
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            if (!fs.existsSync(filePath)) return true;

            // Check if JAR file is corrupted
            if (filePath.endsWith('.jar') && !isValidZipFile(filePath)) {
                console.warn(`[Cloud Sync] ${mod.filename} is corrupted, will re-download`);
                try { fs.unlinkSync(filePath); } catch { }
                return true;
            }

            if (mod.size) {
                const stats = fs.statSync(filePath);
                if (stats.size !== mod.size) return true;
            }
            // Always verify hash if available, even if size matches (to catch corruption)
            return false;
        });

        // Refined filter: if size matches, check hash
        const finalQueue = [];
        for (const mod of downloadQueue) {
            const filePath = path.join(instance.gameDirectory, mod.filename);
            if (fs.existsSync(filePath) && mod.hash) {
                const isValid = await verifyFileHash(filePath, mod.hash);
                if (isValid) {
                    continue; // Skip, it's valid
                }
                console.warn(`[Cloud Sync] Hash mismatch for ${mod.filename}, re-downloading.`);
            }
            finalQueue.push(mod);
        }

        console.log(`[Cloud Sync] Downloading ${finalQueue.length} files...`);

        for (let i = 0; i < finalQueue.length; i++) {
            if (signal?.aborted) throw new Error("Cancelled");
            const mod = finalQueue[i];
            console.log(`[Cloud Sync] Downloading ${mod.filename}...`);

            if (onProgress) {
                onProgress({
                    type: "sync-download",
                    task: `กำลังดาวน์โหลด ${mod.filename} (${i + 1}/${finalQueue.length})`,
                    current: i + 1,
                    total: finalQueue.length,
                    percent: Math.round((i / finalQueue.length) * 100)
                });
            }

            const destPath = path.join(instance.gameDirectory, mod.filename);
            try {
                // Download without strict hash check for cloud files
                // Hash might be stale in DB, so we just warn instead of failing
                await downloadFileWithSoftHashCheck(mod.url, destPath, mod.hash, signal);

            } catch (err) {
                console.error(`[Cloud Sync] Download failed for ${mod.filename}:`, err);
                throw err;
            }
        }

        // 3. Delete extra mods (Respect Locked Mods, ONLY in mods folder)
        if (onProgress) onProgress({ type: "sync-clean", task: "กำลังลบไฟล์ส่วนเกิน..." });

        // Only scan mods folder for cleanup
        if (fs.existsSync(modsDir)) {
            const localFiles = fs.readdirSync(modsDir).filter(f => f.endsWith(".jar") || f.endsWith(".jar.disabled"));
            // Server files that are in the mods/ directory
            // We expect server filename to be "mods/foo.jar".
            // We compare "mods/" + localName with serverFilename.
            const serverModPaths = new Set(validServerMods.map(m => m.filename.replace(/\\/g, '/')));
            const lockedMods = new Set(instance.lockedMods || []);

            for (const file of localFiles) {
                const relativePath = `mods/${file}`; // Path relative to instance root
                const realName = file.replace(".jar.disabled", ".jar");
                const realRelativePath = `mods/${realName}`;

                // Check if this file (or its enabled version) is in the server list
                if (!serverModPaths.has(relativePath) && !serverModPaths.has(realRelativePath)) {
                    if (lockedMods.has(file) || lockedMods.has(realName)) {
                        console.log(`[Cloud Sync] Keeping locked mod: ${file}`);
                        continue;
                    }

                    console.log(`[Cloud Sync] Removing extra mod: ${file} (Not in server list: ${Array.from(serverModPaths).slice(0, 3).join(", ")}...)`);
                    fs.unlinkSync(path.join(modsDir, file));
                } else {
                    // console.log(`[Cloud Sync] Keeping server mod: ${file}`);
                }
            }
        }
        console.log("[Cloud Sync] Sync complete.");
        if (onProgress) onProgress({ type: "sync-complete", task: "ซิงค์ข้อมูลสำเร็จ", percent: 100 });

    } catch (error) {
        console.error("[Cloud Sync] Error:", error);
        if (onProgress) onProgress({ type: "sync-error", task: "เกิดข้อผิดพลาดในการซิงค์" });
        throw error;
    }
}
