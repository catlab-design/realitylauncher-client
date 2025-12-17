/**
 * ========================================
 * Profile Manager - จัดการ Modpack Profiles
 * ========================================
 * 
 * จัดการ profiles โดยแต่ละ profile มีโฟลเดอร์เกมแยก
 * คล้ายกับ Modrinth App
 */

import { app } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

// ========================================
// Types
// ========================================

export interface Profile {
    id: string;
    name: string;
    version: string;           // MC version (1.20.1, 1.21, etc.)
    modLoader?: "forge" | "fabric" | "quilt" | "neoforge" | "vanilla";
    modLoaderVersion?: string;
    javaVersion?: 8 | 17 | 21;
    ramMB: number;
    javaArguments?: string;
    created: string;           // ISO date
    lastPlayed?: string;       // ISO date
    icon?: string;             // base64 or path
    description?: string;
}

export interface ProfileCreateOptions {
    name: string;
    version: string;
    modLoader?: Profile["modLoader"];
    modLoaderVersion?: string;
    ramMB?: number;
    description?: string;
    icon?: string;
}

// ========================================
// Paths
// ========================================

/**
 * getProfilesDir - ดึง path โฟลเดอร์เก็บ profiles
 */
export function getProfilesDir(): string {
    const userDataPath = app.getPath("userData");
    return path.join(userDataPath, "profiles");
}

/**
 * getSharedDir - ดึง path โฟลเดอร์ shared (versions, libraries, assets)
 */
export function getSharedDir(): string {
    const userDataPath = app.getPath("userData");
    return path.join(userDataPath, "shared");
}

/**
 * getProfilePath - ดึง path โฟลเดอร์ของ profile
 */
export function getProfilePath(profileId: string): string {
    return path.join(getProfilesDir(), profileId);
}

/**
 * getProfileGameDir - ดึง path โฟลเดอร์เกมของ profile (เหมือน .minecraft)
 */
export function getProfileGameDir(profileId: string): string {
    // Profile folder itself is the game directory
    return getProfilePath(profileId);
}

// ========================================
// Initialization
// ========================================

/**
 * initProfileSystem - สร้างโฟลเดอร์ที่จำเป็น
 */
export function initProfileSystem(): void {
    const profilesDir = getProfilesDir();
    const sharedDir = getSharedDir();

    // Create directories if not exist
    const dirs = [
        profilesDir,
        sharedDir,
        path.join(sharedDir, "versions"),
        path.join(sharedDir, "libraries"),
        path.join(sharedDir, "assets"),
    ];

    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`[ProfileManager] Created directory: ${dir}`);
        }
    }
}

// ========================================
// Profile CRUD Operations
// ========================================

/**
 * listProfiles - ดึงรายการ profiles ทั้งหมด
 */
export async function listProfiles(): Promise<Profile[]> {
    const profilesDir = getProfilesDir();

    if (!fs.existsSync(profilesDir)) {
        initProfileSystem();
        return [];
    }

    const profiles: Profile[] = [];

    try {
        const entries = fs.readdirSync(profilesDir, { withFileTypes: true });

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const profilePath = path.join(profilesDir, entry.name);
            const profileJsonPath = path.join(profilePath, "profile.json");

            if (fs.existsSync(profileJsonPath)) {
                try {
                    const profileData = JSON.parse(fs.readFileSync(profileJsonPath, "utf-8"));
                    profiles.push(profileData);
                } catch (e) {
                    console.warn(`[ProfileManager] Failed to parse ${profileJsonPath}:`, e);
                }
            }
        }

        // Sort by last played (most recent first)
        profiles.sort((a, b) => {
            if (!a.lastPlayed && !b.lastPlayed) return 0;
            if (!a.lastPlayed) return 1;
            if (!b.lastPlayed) return -1;
            return new Date(b.lastPlayed).getTime() - new Date(a.lastPlayed).getTime();
        });

        console.log(`[ProfileManager] Found ${profiles.length} profiles`);
        return profiles;
    } catch (error) {
        console.error("[ProfileManager] Error listing profiles:", error);
        return [];
    }
}

/**
 * createProfile - สร้าง profile ใหม่
 */
export async function createProfile(options: ProfileCreateOptions): Promise<Profile> {
    initProfileSystem();

    const id = generateProfileId(options.name);
    const profilePath = getProfilePath(id);

    // Check if already exists
    if (fs.existsSync(profilePath)) {
        throw new Error(`Profile "${options.name}" already exists`);
    }

    // Create profile object
    const profile: Profile = {
        id,
        name: options.name,
        version: options.version,
        modLoader: options.modLoader || "vanilla",
        modLoaderVersion: options.modLoaderVersion,
        ramMB: options.ramMB || 2048,
        description: options.description,
        icon: options.icon,
        created: new Date().toISOString(),
    };

    // Create profile directory structure
    const dirs = [
        profilePath,
        path.join(profilePath, "mods"),
        path.join(profilePath, "config"),
        path.join(profilePath, "resourcepacks"),
        path.join(profilePath, "shaderpacks"),
        path.join(profilePath, "saves"),
        path.join(profilePath, "screenshots"),
        path.join(profilePath, "logs"),
    ];

    for (const dir of dirs) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Save profile.json
    const profileJsonPath = path.join(profilePath, "profile.json");
    fs.writeFileSync(profileJsonPath, JSON.stringify(profile, null, 2), "utf-8");

    console.log(`[ProfileManager] Created profile: ${profile.name} (${id})`);
    return profile;
}

/**
 * getProfile - ดึงข้อมูล profile ตาม ID
 */
export async function getProfile(profileId: string): Promise<Profile | null> {
    const profilePath = getProfilePath(profileId);
    const profileJsonPath = path.join(profilePath, "profile.json");

    if (!fs.existsSync(profileJsonPath)) {
        return null;
    }

    try {
        return JSON.parse(fs.readFileSync(profileJsonPath, "utf-8"));
    } catch (e) {
        console.error(`[ProfileManager] Error reading profile ${profileId}:`, e);
        return null;
    }
}

/**
 * updateProfile - อัปเดตข้อมูล profile
 */
export async function updateProfile(profileId: string, updates: Partial<Profile>): Promise<Profile | null> {
    const profile = await getProfile(profileId);
    if (!profile) return null;

    const updatedProfile: Profile = {
        ...profile,
        ...updates,
        id: profile.id, // Prevent ID change
        created: profile.created, // Prevent created date change
    };

    const profileJsonPath = path.join(getProfilePath(profileId), "profile.json");
    fs.writeFileSync(profileJsonPath, JSON.stringify(updatedProfile, null, 2), "utf-8");

    console.log(`[ProfileManager] Updated profile: ${profileId}`);
    return updatedProfile;
}

/**
 * deleteProfile - ลบ profile
 */
export async function deleteProfile(profileId: string): Promise<boolean> {
    const profilePath = getProfilePath(profileId);

    if (!fs.existsSync(profilePath)) {
        console.warn(`[ProfileManager] Profile not found: ${profileId}`);
        return false;
    }

    try {
        fs.rmSync(profilePath, { recursive: true, force: true });
        console.log(`[ProfileManager] Deleted profile: ${profileId}`);
        return true;
    } catch (error) {
        console.error(`[ProfileManager] Error deleting profile ${profileId}:`, error);
        return false;
    }
}

/**
 * duplicateProfile - สำเนา profile
 */
export async function duplicateProfile(profileId: string, newName: string): Promise<Profile | null> {
    const sourceProfile = await getProfile(profileId);
    if (!sourceProfile) return null;

    const newId = generateProfileId(newName);
    const sourcePath = getProfilePath(profileId);
    const destPath = getProfilePath(newId);

    // Copy entire directory
    copyDirectorySync(sourcePath, destPath);

    // Update profile.json
    const newProfile: Profile = {
        ...sourceProfile,
        id: newId,
        name: newName,
        created: new Date().toISOString(),
        lastPlayed: undefined,
    };

    const profileJsonPath = path.join(destPath, "profile.json");
    fs.writeFileSync(profileJsonPath, JSON.stringify(newProfile, null, 2), "utf-8");

    console.log(`[ProfileManager] Duplicated profile: ${profileId} -> ${newId}`);
    return newProfile;
}

/**
 * updateLastPlayed - อัปเดต lastPlayed timestamp
 */
export async function updateLastPlayed(profileId: string): Promise<void> {
    await updateProfile(profileId, { lastPlayed: new Date().toISOString() });
}

// ========================================
// Utility Functions
// ========================================

/**
 * generateProfileId - สร้าง ID จากชื่อ profile
 */
function generateProfileId(name: string): string {
    // Sanitize name: remove special characters, replace spaces
    const sanitized = name
        .trim()
        .replace(/[<>:"/\\|?*]/g, "")
        .replace(/\s+/g, "_")
        .substring(0, 50);

    // If empty after sanitizing, use UUID
    if (!sanitized) {
        return randomUUID().substring(0, 8);
    }

    return sanitized;
}

/**
 * copyDirectorySync - Copy directory recursively
 */
function copyDirectorySync(source: string, destination: string): void {
    if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination, { recursive: true });
    }

    const entries = fs.readdirSync(source, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(source, entry.name);
        const destPath = path.join(destination, entry.name);

        if (entry.isDirectory()) {
            copyDirectorySync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * getProfileStats - ดึงสถิติของ profile
 */
export async function getProfileStats(profileId: string): Promise<{
    modsCount: number;
    savesCount: number;
    resourcePacksCount: number;
    shaderPacksCount: number;
    totalSize: number;
} | null> {
    const profilePath = getProfilePath(profileId);

    if (!fs.existsSync(profilePath)) {
        return null;
    }

    const countFiles = (dir: string): number => {
        if (!fs.existsSync(dir)) return 0;
        try {
            return fs.readdirSync(dir).length;
        } catch {
            return 0;
        }
    };

    const getDirSize = (dir: string): number => {
        if (!fs.existsSync(dir)) return 0;
        let size = 0;
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    size += getDirSize(fullPath);
                } else {
                    size += fs.statSync(fullPath).size;
                }
            }
        } catch {
            // Ignore errors
        }
        return size;
    };

    return {
        modsCount: countFiles(path.join(profilePath, "mods")),
        savesCount: countFiles(path.join(profilePath, "saves")),
        resourcePacksCount: countFiles(path.join(profilePath, "resourcepacks")),
        shaderPacksCount: countFiles(path.join(profilePath, "shaderpacks")),
        totalSize: getDirSize(profilePath),
    };
}
