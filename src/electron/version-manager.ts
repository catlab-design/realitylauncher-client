/**
 * ========================================
 * Version Manager - จัดการเวอร์ชัน Minecraft
 * ========================================
 * 
 * จัดการการดึงข้อมูล เวอร์ชัน และติดตั้ง Minecraft
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getMinecraftDir } from "./config.js";

// ========================================
// Types
// ========================================

export interface InstalledVersion {
    id: string;
    type: "release" | "snapshot" | "old_beta" | "old_alpha" | "modded";
    releaseTime?: string;
    lastUsed?: string;
    hasJar: boolean;
    hasJson: boolean;
}

export interface VersionManifestVersion {
    id: string;
    type: "release" | "snapshot" | "old_beta" | "old_alpha";
    url: string;
    time: string;
    releaseTime: string;
    sha1: string;
    complianceLevel: number;
}

export interface VersionManifest {
    latest: {
        release: string;
        snapshot: string;
    };
    versions: VersionManifestVersion[];
}

export interface VersionDetails {
    id: string;
    type: string;
    mainClass: string;
    minecraftArguments?: string;
    arguments?: {
        game: any[];
        jvm: any[];
    };
    javaVersion?: {
        component: string;
        majorVersion: number;
    };
    assets: string;
    assetIndex: {
        id: string;
        sha1: string;
        size: number;
        totalSize: number;
        url: string;
    };
    downloads: {
        client: {
            sha1: string;
            size: number;
            url: string;
        };
        client_mappings?: {
            sha1: string;
            size: number;
            url: string;
        };
        server?: {
            sha1: string;
            size: number;
            url: string;
        };
    };
    libraries: any[];
    releaseTime: string;
    time: string;
}

// ========================================
// Constants
// ========================================

const MOJANG_VERSION_MANIFEST_URL = "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";

// Cache for version manifest
let cachedManifest: VersionManifest | null = null;
let manifestCacheTime: number = 0;
const MANIFEST_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// ========================================
// Functions
// ========================================

/**
 * listInstalledVersions - ดึงรายการเวอร์ชันที่ติดตั้งแล้ว
 */
export async function listInstalledVersions(): Promise<InstalledVersion[]> {
    const minecraftDir = getMinecraftDir();
    const versionsDir = path.join(minecraftDir, "versions");

    console.log("[VersionManager] Scanning versions directory:", versionsDir);

    // ถ้าไม่มีโฟลเดอร์ versions ให้สร้างและ return array ว่าง
    if (!fs.existsSync(versionsDir)) {
        console.log("[VersionManager] Versions directory does not exist, creating...");
        fs.mkdirSync(versionsDir, { recursive: true });
        return [];
    }

    const versions: InstalledVersion[] = [];

    try {
        const entries = fs.readdirSync(versionsDir, { withFileTypes: true });

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const versionId = entry.name;
            const versionDir = path.join(versionsDir, versionId);
            const jarPath = path.join(versionDir, `${versionId}.jar`);
            const jsonPath = path.join(versionDir, `${versionId}.json`);

            const hasJar = fs.existsSync(jarPath);
            const hasJson = fs.existsSync(jsonPath);

            // อ่าน JSON เพื่อดึงข้อมูลเพิ่มเติม
            let type: InstalledVersion["type"] = "release";
            let releaseTime: string | undefined;

            if (hasJson) {
                try {
                    const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
                    type = jsonData.type || "release";
                    releaseTime = jsonData.releaseTime;

                    // ตรวจสอบว่าเป็น modded version หรือไม่
                    if (jsonData.inheritsFrom || versionId.includes("forge") ||
                        versionId.includes("fabric") || versionId.includes("optifine")) {
                        type = "modded";
                    }
                } catch (e) {
                    console.warn(`[VersionManager] Failed to parse ${jsonPath}:`, e);
                }
            }

            versions.push({
                id: versionId,
                type,
                releaseTime,
                hasJar,
                hasJson,
            });
        }

        // เรียงตามวันที่ release (ใหม่สุดก่อน)
        versions.sort((a, b) => {
            if (!a.releaseTime && !b.releaseTime) return 0;
            if (!a.releaseTime) return 1;
            if (!b.releaseTime) return -1;
            return new Date(b.releaseTime).getTime() - new Date(a.releaseTime).getTime();
        });

        console.log(`[VersionManager] Found ${versions.length} installed versions`);
        return versions;
    } catch (error) {
        console.error("[VersionManager] Error listing versions:", error);
        return [];
    }
}

/**
 * getVersionManifest - ดึง version manifest จาก Mojang
 */
export async function getVersionManifest(forceRefresh = false): Promise<VersionManifest> {
    const now = Date.now();

    // ใช้ cache ถ้ายังไม่หมดอายุ
    if (!forceRefresh && cachedManifest && (now - manifestCacheTime < MANIFEST_CACHE_DURATION)) {
        console.log("[VersionManager] Using cached version manifest");
        return cachedManifest;
    }

    console.log("[VersionManager] Fetching version manifest from Mojang...");

    try {
        const response = await fetch(MOJANG_VERSION_MANIFEST_URL);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const manifest: VersionManifest = await response.json();

        // Update cache
        cachedManifest = manifest;
        manifestCacheTime = now;

        console.log(`[VersionManager] Manifest loaded: ${manifest.versions.length} versions, latest: ${manifest.latest.release}`);
        return manifest;
    } catch (error) {
        console.error("[VersionManager] Error fetching manifest:", error);

        // ถ้ามี cache เก่า ให้ใช้แทน
        if (cachedManifest) {
            console.log("[VersionManager] Using stale cache due to fetch error");
            return cachedManifest;
        }

        throw error;
    }
}

/**
 * getVersionInfo - ดึงข้อมูลรายละเอียดของเวอร์ชัน
 */
export async function getVersionInfo(versionId: string): Promise<VersionDetails | null> {
    // ลองอ่านจาก local ก่อน
    const minecraftDir = getMinecraftDir();
    const localJsonPath = path.join(minecraftDir, "versions", versionId, `${versionId}.json`);

    if (fs.existsSync(localJsonPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(localJsonPath, "utf-8"));
            console.log(`[VersionManager] Loaded version info from local: ${versionId}`);
            return data;
        } catch (e) {
            console.warn(`[VersionManager] Failed to parse local version JSON: ${versionId}`);
        }
    }

    // ถ้าไม่มี local ให้ดึงจาก manifest
    try {
        const manifest = await getVersionManifest();
        const versionEntry = manifest.versions.find(v => v.id === versionId);

        if (!versionEntry) {
            console.warn(`[VersionManager] Version not found in manifest: ${versionId}`);
            return null;
        }

        console.log(`[VersionManager] Fetching version info from: ${versionEntry.url}`);
        const response = await fetch(versionEntry.url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const versionDetails: VersionDetails = await response.json();
        return versionDetails;
    } catch (error) {
        console.error(`[VersionManager] Error getting version info for ${versionId}:`, error);
        return null;
    }
}

/**
 * getRequiredJavaVersion - ดึง Java version ที่ต้องการสำหรับ MC version
 */
export async function getRequiredJavaVersion(versionId: string): Promise<number> {
    const versionInfo = await getVersionInfo(versionId);

    if (versionInfo?.javaVersion?.majorVersion) {
        return versionInfo.javaVersion.majorVersion;
    }

    // Fallback based on version number
    const versionMatch = versionId.match(/^1\.(\d+)/);
    if (versionMatch) {
        const minorVersion = parseInt(versionMatch[1], 10);

        if (minorVersion >= 21) return 21; // 1.21+
        if (minorVersion >= 18) return 17; // 1.18 - 1.20.x
        if (minorVersion >= 17) return 16; // 1.17
        return 8; // 1.16 and below
    }

    // Default to Java 8 for unknown versions
    return 8;
}

/**
 * isVersionComplete - ตรวจสอบว่าเวอร์ชันติดตั้งครบหรือไม่
 */
export function isVersionComplete(versionId: string): boolean {
    const minecraftDir = getMinecraftDir();
    const versionDir = path.join(minecraftDir, "versions", versionId);
    const jarPath = path.join(versionDir, `${versionId}.jar`);
    const jsonPath = path.join(versionDir, `${versionId}.json`);

    return fs.existsSync(jarPath) && fs.existsSync(jsonPath);
}

/**
 * getVersionsForDisplay - รวมเวอร์ชันที่ติดตั้งและที่มีให้ดาวน์โหลด
 */
export async function getVersionsForDisplay(): Promise<{
    installed: InstalledVersion[];
    available: VersionManifestVersion[];
    latest: { release: string; snapshot: string };
}> {
    const [installed, manifest] = await Promise.all([
        listInstalledVersions(),
        getVersionManifest().catch(() => null),
    ]);

    const available = manifest?.versions.filter(v =>
        v.type === "release" || v.type === "snapshot"
    ).slice(0, 50) || []; // Limit to 50 most recent

    return {
        installed,
        available,
        latest: manifest?.latest || { release: "1.21", snapshot: "1.21" },
    };
}
