/**
 * ========================================
 * Instance Management Module
 * ========================================
 * 
 * จัดการ Game Instances - แต่ละ instance คือโปรไฟล์เกมแยก
 * ที่มี mods, config, และ saves ของตัวเอง
 */

import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import { getMinecraftDir } from "./config.js";

// ========================================
// Types
// ========================================

export type LoaderType = "vanilla" | "fabric" | "forge" | "neoforge" | "quilt";

export interface GameInstance {
    id: string;
    name: string;
    icon?: string; // Base64 or file path
    minecraftVersion: string;
    loader: LoaderType;
    loaderVersion?: string;
    createdAt: string;
    lastPlayedAt?: string;
    totalPlayTime: number; // minutes
    javaPath?: string; // Override global config
    ramMB?: number; // Override global config
    javaArguments?: string;
    gameDirectory: string;
    modpackId?: string; // If created from Modrinth modpack
    modpackVersionId?: string;
}

export interface CreateInstanceOptions {
    name: string;
    minecraftVersion: string;
    loader?: LoaderType;
    loaderVersion?: string;
    icon?: string;
    javaPath?: string;
    ramMB?: number;
    modpackId?: string;
    modpackVersionId?: string;
}

export interface UpdateInstanceOptions {
    name?: string;
    icon?: string;
    loader?: LoaderType;
    loaderVersion?: string;
    javaPath?: string;
    ramMB?: number;
    javaArguments?: string;
    lastPlayedAt?: string;
    totalPlayTime?: number;
}

// ========================================
// Instances State
// ========================================

let instances: GameInstance[] = [];

// ========================================
// Path Helpers
// ========================================

/**
 * Get the instances directory path
 */
export function getInstancesDir(): string {
    const minecraftDir = getMinecraftDir();
    return path.join(minecraftDir, "instances");
}

/**
 * Get instance directory path
 */
export function getInstanceDir(instanceId: string): string {
    return path.join(getInstancesDir(), instanceId);
}

/**
 * Get the instances metadata file path (for migration only)
 * @deprecated Use instance.json in each instance folder instead
 */
function getInstancesMetaPath(): string {
    return path.join(getInstancesDir(), "instances.json");
}

/**
 * Get instance metadata file path (new per-instance approach)
 */
function getInstanceMetaPath(instanceId: string): string {
    return path.join(getInstanceDir(instanceId), "instance.json");
}

/**
 * Get instance icon path
 */
export function getInstanceIconPath(instanceId: string): string {
    return path.join(getInstanceDir(instanceId), "icon.png");
}

// ========================================
// Load / Save
// ========================================

/**
 * Load instances from disk - scans all folders in instances directory
 */
export function loadInstances(): GameInstance[] {
    try {
        const instancesDir = getInstancesDir();

        // Create instances directory if not exists
        if (!fs.existsSync(instancesDir)) {
            fs.mkdirSync(instancesDir, { recursive: true });
            instances = [];
            return instances;
        }

        // Migrate from old instances.json if exists
        const oldMetaPath = getInstancesMetaPath();
        if (fs.existsSync(oldMetaPath)) {
            console.log("[Instances] Migrating from instances.json to per-instance files...");
            try {
                const oldData = fs.readFileSync(oldMetaPath, "utf-8");
                const oldInstances = JSON.parse(oldData) as GameInstance[];

                // Save each instance to its own file
                for (const inst of oldInstances) {
                    const instDir = getInstanceDir(inst.id);
                    if (fs.existsSync(instDir)) {
                        const metaPath = getInstanceMetaPath(inst.id);
                        fs.writeFileSync(metaPath, JSON.stringify(inst, null, 2));
                        console.log("[Instances] Migrated:", inst.name);
                    }
                }

                // Remove old file after migration
                fs.unlinkSync(oldMetaPath);
                console.log("[Instances] Migration complete, deleted instances.json");
            } catch (migError) {
                console.error("[Instances] Migration error:", migError);
            }
        }

        // Scan all subdirectories for instance.json
        instances = [];
        const entries = fs.readdirSync(instancesDir, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const metaPath = getInstanceMetaPath(entry.name);
                if (fs.existsSync(metaPath)) {
                    try {
                        const data = fs.readFileSync(metaPath, "utf-8");
                        const instance = JSON.parse(data) as GameInstance;

                        // Ensure gameDirectory is correct
                        instance.gameDirectory = getInstanceDir(entry.name);
                        instance.id = entry.name;

                        // Check for icon.png and load as base64
                        const iconPath = getInstanceIconPath(entry.name);
                        if (fs.existsSync(iconPath)) {
                            try {
                                const iconData = fs.readFileSync(iconPath);
                                const base64 = iconData.toString("base64");
                                instance.icon = `data:image/png;base64,${base64}`;
                            } catch (iconError) {
                                console.warn("[Instances] Failed to read icon:", entry.name, iconError);
                            }
                        }

                        instances.push(instance);
                    } catch (parseError) {
                        console.error("[Instances] Error loading instance:", entry.name, parseError);
                    }
                }
            }
        }

        console.log("[Instances] Loaded", instances.length, "instances");
    } catch (error) {
        console.error("[Instances] Failed to load instances:", error);
        instances = [];
    }
    return instances;
}

/**
 * Save a single instance to its own instance.json file
 */
function saveInstance(instance: GameInstance): void {
    try {
        const instanceDir = getInstanceDir(instance.id);
        if (!fs.existsSync(instanceDir)) {
            fs.mkdirSync(instanceDir, { recursive: true });
        }

        const metaPath = getInstanceMetaPath(instance.id);

        // Don't save the icon URL if it's a file:// path (loaded from icon.png)
        const saveData = { ...instance };
        if (saveData.icon?.startsWith("file://")) {
            delete saveData.icon;
        }

        fs.writeFileSync(metaPath, JSON.stringify(saveData, null, 2));
        console.log("[Instances] Saved instance:", instance.name);
    } catch (error) {
        console.error("[Instances] Failed to save instance:", instance.id, error);
    }
}

/**
 * Save all instances (calls saveInstance for each)
 */
function saveInstances(): void {
    for (const instance of instances) {
        saveInstance(instance);
    }
    console.log("[Instances] Saved all", instances.length, "instances");
}

// ========================================
// CRUD Operations
// ========================================

/**
 * Get all instances
 */
export function getInstances(): GameInstance[] {
    if (instances.length === 0) {
        loadInstances();
    }
    return [...instances];
}

/**
 * Get single instance by ID
 */
export function getInstance(id: string): GameInstance | null {
    return instances.find((i) => i.id === id) || null;
}

/**
 * Create new instance
 */
export function createInstance(options: CreateInstanceOptions): GameInstance {
    // Use sanitized profile name as ID instead of UUID
    const id = generateUniqueId(options.name);
    const gameDirectory = getInstanceDir(id);

    // Create instance directory
    if (!fs.existsSync(gameDirectory)) {
        fs.mkdirSync(gameDirectory, { recursive: true });
    }

    // Create subdirectories
    const subdirs = ["mods", "config", "saves", "resourcepacks", "shaderpacks", "datapacks"];
    for (const subdir of subdirs) {
        const subdirPath = path.join(gameDirectory, subdir);
        if (!fs.existsSync(subdirPath)) {
            fs.mkdirSync(subdirPath, { recursive: true });
        }
    }

    const instance: GameInstance = {
        id,
        name: options.name,
        icon: options.icon,
        minecraftVersion: options.minecraftVersion,
        loader: options.loader || "vanilla",
        loaderVersion: options.loaderVersion,
        createdAt: new Date().toISOString(),
        totalPlayTime: 0,
        javaPath: options.javaPath,
        ramMB: options.ramMB,
        gameDirectory,
        modpackId: options.modpackId,
        modpackVersionId: options.modpackVersionId,
    };

    instances.push(instance);
    saveInstances();

    console.log("[Instances] Created instance:", instance.name, instance.id);
    return instance;
}

/**
 * Update instance
 */
export function updateInstance(id: string, updates: UpdateInstanceOptions): GameInstance | null {
    const index = instances.findIndex((i) => i.id === id);
    if (index === -1) {
        return null;
    }

    instances[index] = { ...instances[index], ...updates };
    saveInstances();

    console.log("[Instances] Updated instance:", id);
    return instances[index];
}

/**
 * Delete instance
 */
export function deleteInstance(id: string): boolean {
    const index = instances.findIndex((i) => i.id === id);
    if (index === -1) {
        return false;
    }

    const instance = instances[index];

    // Remove from array
    instances.splice(index, 1);
    saveInstances();

    // Delete directory
    try {
        if (fs.existsSync(instance.gameDirectory)) {
            fs.rmSync(instance.gameDirectory, { recursive: true, force: true });
            console.log("[Instances] Deleted instance directory:", instance.gameDirectory);
        }
    } catch (error) {
        console.error("[Instances] Failed to delete directory:", error);
    }

    console.log("[Instances] Deleted instance:", instance.name, id);
    return true;
}

/**
 * Duplicate instance
 */
export function duplicateInstance(id: string): GameInstance | null {
    const source = getInstance(id);
    if (!source) {
        return null;
    }

    // Create new instance with same settings
    const newInstance = createInstance({
        name: `${source.name} (Copy)`,
        minecraftVersion: source.minecraftVersion,
        loader: source.loader,
        loaderVersion: source.loaderVersion,
        icon: source.icon,
        javaPath: source.javaPath,
        ramMB: source.ramMB,
    });

    // Copy files from source to new instance
    try {
        const sourceDir = source.gameDirectory;
        const destDir = newInstance.gameDirectory;

        // Copy mods, config, etc.
        const copyDirs = ["mods", "config", "resourcepacks", "shaderpacks"];
        for (const dir of copyDirs) {
            const srcPath = path.join(sourceDir, dir);
            const dstPath = path.join(destDir, dir);
            if (fs.existsSync(srcPath)) {
                copyDirectorySync(srcPath, dstPath);
            }
        }
    } catch (error) {
        console.error("[Instances] Failed to copy files:", error);
    }

    console.log("[Instances] Duplicated instance:", source.name, "->", newInstance.name);
    return newInstance;
}

/**
 * Update last played time
 */
export function markInstancePlayed(id: string, playTimeMinutes: number = 0): void {
    const instance = getInstance(id);
    if (instance) {
        updateInstance(id, {
            lastPlayedAt: new Date().toISOString(),
            totalPlayTime: instance.totalPlayTime + playTimeMinutes,
        });
    }
}

// ========================================
// Helper Functions
// ========================================

/**
 * Copy directory recursively
 */
function copyDirectorySync(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDirectorySync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * Sanitize name for use as folder name
 * Removes/replaces special characters that are invalid in file paths
 */
function sanitizeName(name: string): string {
    return name
        .trim()
        .replace(/[<>:"/\\|?*]/g, "") // Remove invalid path characters
        .replace(/\s+/g, " ")          // Normalize whitespace
        .substring(0, 100);            // Limit length
}

/**
 * Generate unique ID from profile name
 * If name already exists, adds -1, -2, etc.
 */
function generateUniqueId(name: string): string {
    const baseName = sanitizeName(name);

    // If no instances with this name, use it directly
    if (!instances.find(i => i.id === baseName)) {
        return baseName;
    }

    // Find unique name with suffix
    let counter = 1;
    let uniqueName = `${baseName}-${counter}`;
    while (instances.find(i => i.id === uniqueName)) {
        counter++;
        uniqueName = `${baseName}-${counter}`;
    }

    return uniqueName;
}

// Initialize on module load
loadInstances();
