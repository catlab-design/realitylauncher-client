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
import { createRequire } from "node:module";
import { getMinecraftDir } from "./config.js";

// ========================================
// Native Module Loading
// ========================================

const customRequire = createRequire(__filename);
let nativeModule: any = null;
const DEBUG_INSTANCES = process.env.DEBUG_INSTANCES === "1";

function getNative(): any {
  if (nativeModule) return nativeModule;
  const nativePath = path.join(app.getAppPath(), "native", "index.cjs");
  nativeModule = customRequire(nativePath);
  return nativeModule;
}

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
  cloudId?: string;
  autoUpdate?: boolean;
  banner?: string;
  lockedMods?: string[];
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
  autoUpdate?: boolean;
  lockedMods?: string[];
}

// ========================================
// Instances State
// ========================================

// ========================================
// Instances State
// ========================================

/**
 * Global cache of all loaded instances.
 * This ensures that getInstance(id) acts as a reliable lookup even if the
 * current `instances` array only contains a paginated subset.
 */
const instanceCache = new Map<string, GameInstance>();

/**
 * Current list of instances (could be a paginated subset).
 * This is what is returned to the UI for display.
 */
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
 * Uses Native Rust Core for performance
 */
export async function loadInstances(
  offset: number = 0,
  limit: number = 1000,
): Promise<GameInstance[]> {
  let nativeInstances: any[] = [];
  try {
    const instancesDir = getInstancesDir();

    // Create instances directory if not exists (async)
    try {
      await fs.promises.access(instancesDir);
    } catch {
      await fs.promises.mkdir(instancesDir, { recursive: true });
      instances = [];
      return instances;
    }

    // Migrate from old instances.json if exists (async)
    const oldMetaPath = getInstancesMetaPath();
    let oldMetaExists = false;
    try {
      await fs.promises.access(oldMetaPath);
      oldMetaExists = true;
    } catch {}
    if (oldMetaExists) {
      console.log(
        "[Instances] Migrating from instances.json to per-instance files...",
      );
      try {
        const oldData = await fs.promises.readFile(oldMetaPath, "utf-8");
        const oldInstances = JSON.parse(oldData) as GameInstance[];

        // Save each instance to its own file
        for (const inst of oldInstances) {
          const instDir = getInstanceDir(inst.id);
          await fs.promises.mkdir(instDir, { recursive: true });
          const metaPath = getInstanceMetaPath(inst.id);
          await fs.promises.writeFile(metaPath, JSON.stringify(inst, null, 2));
          console.log("[Instances] Migrated:", inst.name);
        }

        // Remove old file after migration
        await fs.promises.unlink(oldMetaPath);
        console.log("[Instances] Migration complete, deleted instances.json");
      } catch (migError) {
        console.error("[Instances] Migration error:", migError);
      }
    }

    // Use Native Rust Core to list instances efficiently
    const native = getNative();
    // Pass base directory explicitly from JS to ensure correct path (especially in Dev)
    nativeInstances = (await native.listInstances(
      instancesDir,
      offset,
      limit,
    )) as any[];

    // Convert Native meta to GameInstance
    const loadedInstances: GameInstance[] = nativeInstances.map((meta) => ({
      id: meta.id,
      name: meta.name,
      icon: meta.icon, // Already base64 from Rust
      banner: meta.banner,
      minecraftVersion: meta.minecraftVersion,
      loader: meta.loader.toLowerCase() as LoaderType,
      loaderVersion: meta.loaderVersion,
      createdAt: meta.createdAt,
      lastPlayedAt: meta.lastPlayedAt,
      totalPlayTime: meta.totalPlayTime,
      javaPath: meta.javaPath,
      ramMB: meta.ramMB,
      javaArguments: meta.javaArguments,
      gameDirectory: meta.gameDirectory,
      modpackId: meta.modpackId,
      modpackVersionId: meta.modpackVersionId,
      cloudId: meta.cloudId,
      autoUpdate: meta.autoUpdate,
      lockedMods: meta.lockedMods,
    }));

    // Update Cache
    for (const inst of loadedInstances) {
      instanceCache.set(inst.id, inst);
    }

    // Update the current "view" variable
    instances = loadedInstances;

    if (DEBUG_INSTANCES) {
      console.log(
        `[Instances] Loaded ${instances.length} instances offset=${offset} limit=${limit} (Native Async). Cache size: ${instanceCache.size}`,
      );
    }
  } catch (error) {
    console.error("[Instances] Failed to load instances:", error);
    instances = [];
  }

  if (DEBUG_INSTANCES && instances.length === 0) {
    console.error(
      "[Debug] Loaded 0 instances! Native returned:",
      JSON.stringify(nativeInstances),
    );
  }

  return instances;
}

/**
 * Cache for last saved content to avoid redundant disk writes
 */
const lastSavedContent = new Map<string, string>();

/**
 * Save a single instance to its own instance.json file (async - non-blocking)
 */
async function saveInstance(instance: GameInstance): Promise<void> {
  try {
    const instanceDir = getInstanceDir(instance.id);
    await fs.promises.mkdir(instanceDir, { recursive: true });

    const metaPath = getInstanceMetaPath(instance.id);

    // Don't save the icon if it's loaded from icon.png (file:// or data: URL)
    // Icons are stored as icon.png in the instance folder
    const saveData = { ...instance };
    if (
      saveData.icon?.startsWith("file://") ||
      saveData.icon?.startsWith("data:")
    ) {
      delete saveData.icon;
    }

    const json = JSON.stringify(saveData, null, 2);

    // Performance: Only write if content has changed
    if (lastSavedContent.get(instance.id) === json) {
      return;
    }

    // Atomic Write Strategy: Write to .tmp then rename (async)
    const tmpPath = `${metaPath}.tmp`;
    await fs.promises.writeFile(tmpPath, json);
    await fs.promises.rename(tmpPath, metaPath);

    lastSavedContent.set(instance.id, json);
    if (DEBUG_INSTANCES) {
      console.log("[Instances] Saved instance:", instance.name);
    }
  } catch (error) {
    console.error("[Instances] Failed to save instance:", instance.id, error);
  }
}

/**
 * Save all instances (calls saveInstance for each)
 */
async function saveInstances(): Promise<void> {
  await Promise.all(instances.map((inst) => saveInstance(inst)));
  if (DEBUG_INSTANCES) {
    console.log("[Instances] Saved all", instances.length, "instances");
  }
}

// ========================================
// CRUD Operations
// ========================================

/**
 * Get all instances
 */
export async function getInstances(
  offset: number = 0,
  limit: number = 1000,
): Promise<GameInstance[]> {
  // Always reload to pick up new icons and changes
  return await loadInstances(offset, limit);
}

/**
 * Get single instance by ID
 */
export function getInstance(id: string): GameInstance | null {
  // Check cache first (contains all loaded instances)
  if (instanceCache.has(id)) {
    return instanceCache.get(id)!;
  }

  // Fallback to array search (redundant if cache is correct, but safe)
  const instance = instances.find((i) => i.id === id);
  if (!instance) {
    // Non-blocking debug log (fire and forget)
    console.warn(
      `[Instances] getInstance FAILED for ID: "${id}". Cache Size: ${instanceCache.size}. Available in View: ${instances.length}`,
    );
  }
  return instance || null;
}

/**
 * Create new instance
 */
export async function createInstance(
  options: CreateInstanceOptions,
): Promise<GameInstance> {
  // Use sanitized profile name as ID instead of UUID
  const id = generateUniqueId(options.name);
  const gameDirectory = getInstanceDir(id);

  // Create instance directory (async)
  await fs.promises.mkdir(gameDirectory, { recursive: true });

  // Create subdirectories (async, parallel)
  const subdirs = [
    "mods",
    "config",
    "saves",
    "resourcepacks",
    "shaderpacks",
    "datapacks",
  ];
  await Promise.all(
    subdirs.map((subdir) =>
      fs.promises.mkdir(path.join(gameDirectory, subdir), { recursive: true }),
    ),
  );

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
  instanceCache.set(instance.id, instance);
  await saveInstance(instance);

  if (DEBUG_INSTANCES) {
    console.log("[Instances] Created instance:", instance.name, instance.id);
  }
  return instance;
}

/**
 * Import instance from cloud data
 */
export async function importCloudInstance(
  cloudData: any,
): Promise<GameInstance> {
  // Use cloud ID as local ID and folder name
  const id = cloudData.storagePath || cloudData.id;
  const gameDirectory = getInstanceDir(id);
  const instancesDir = getInstancesDir();

  // Create instance directory if not exists via native
  const native = getNative();
  if (typeof native.createInstanceDirectories !== "function") {
    console.error(
      "[Instances] CRITICAL: createInstanceDirectories is NOT a function. Available:",
      Object.keys(native),
    );
  }
  native.createInstanceDirectories(instancesDir, id);

  // Search by cloudId first if available, then fallback to id
  let existingIndex = instances.findIndex((i) => i.cloudId === cloudData.id);
  if (existingIndex === -1) {
    existingIndex = instances.findIndex((i) => i.id === id);
  }

  const instance: GameInstance = {
    id,
    name: cloudData.name,
    icon: cloudData.iconUrl || undefined, // Cloud URL or null
    minecraftVersion: cloudData.minecraftVersion || "1.20.1",
    loader: (cloudData.loaderType as LoaderType) || "fabric",
    loaderVersion: cloudData.loaderVersion,
    createdAt: cloudData.createdAt || new Date().toISOString(),
    totalPlayTime: 0,
    gameDirectory,
    modpackId:
      cloudData.modpackType === "modrinth" ? cloudData.modpackUrl : undefined,
    cloudId: cloudData.id,
    autoUpdate:
      existingIndex !== -1 ? instances[existingIndex].autoUpdate : true,
    banner: cloudData.bannerUrl || cloudData.image,
  };

  if (existingIndex !== -1) {
    // Merge - keep local fields if not in cloudData
    instances[existingIndex] = {
      ...instances[existingIndex],
      ...instance,
      id: instances[existingIndex].id, // Preserve established local ID
      gameDirectory: instances[existingIndex].gameDirectory, // Preserve directory
      // Specifically preserve autoUpdate choice if not forced by cloud
      autoUpdate:
        instances[existingIndex].autoUpdate !== undefined
          ? instances[existingIndex].autoUpdate
          : instance.autoUpdate,
    };
  } else {
    instances.push(instance);
  }

  const finalInstance =
    existingIndex !== -1 ? instances[existingIndex] : instance;

  // Update cache
  instanceCache.set(finalInstance.id, finalInstance);

  await saveInstance(finalInstance);
  if (DEBUG_INSTANCES) {
    console.log(
      "[Instances] Imported cloud instance:",
      finalInstance.name,
      finalInstance.id,
    );
  }
  return finalInstance;
}

/**
 * Update instance
 */
export async function updateInstance(
  id: string,
  updates: UpdateInstanceOptions,
): Promise<GameInstance | null> {
  // Try to find in current view array
  const index = instances.findIndex((i) => i.id === id);

  // Also check cache (primary source of truth for all loaded instances)
  let instance = index !== -1 ? instances[index] : instanceCache.get(id);

  if (!instance) {
    console.warn(
      `[Instances] updateInstance: Instance ${id} not found in array or cache.`,
    );
    return null;
  }

  // Apply updates
  const updatedInstance = { ...instance, ...updates };

  // Update Cache
  instanceCache.set(id, updatedInstance);

  // Update Array if present (to keep current view in sync)
  if (index !== -1) {
    instances[index] = updatedInstance;
  }

  // Persist (async, non-blocking)
  await saveInstance(updatedInstance);

  if (DEBUG_INSTANCES) {
    console.log("[Instances] Updated instance:", id);
  }
  return updatedInstance;
}

/**
 * Delete instance
 */
export async function deleteInstance(id: string): Promise<boolean> {
  const index = instances.findIndex((i) => i.id === id);

  // Check cache if not in current view array
  const instance = index !== -1 ? instances[index] : instanceCache.get(id);

  if (!instance) {
    console.warn(`[Instances] deleteInstance: Instance ${id} not found.`);
    return false;
  }

  const targetDir = getInstanceDir(id);
  console.log(
    "[Instances] deleteInstance called for:",
    instance.name,
    "at",
    targetDir,
  );

  // Delete directory using Node.js directly (more robust with retries on Windows)
  try {
    // Check existence async
    let dirExists = false;
    try {
      await fs.promises.access(targetDir);
      dirExists = true;
    } catch {}

    if (dirExists) {
      console.log("[Instances] Deleting directory:", targetDir);
      await fs.promises.rm(targetDir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
      console.log("[Instances] Deleted instance directory:", targetDir);
    } else {
      console.log("[Instances] Directory already gone:", targetDir);
    }
  } catch (error) {
    console.error("[Instances] Failed to delete directory:", error);
    // Important: Return false so frontend knows it failed
    return false;
  }

  // Only remove from memory if disk delete success (or if directory was already gone)
  if (index !== -1) {
    instances.splice(index, 1);
  }
  lastSavedContent.delete(id);
  instanceCache.delete(id);

  if (instance.cloudId) {
    console.log(
      `[Instances] Deleted cloud instance ${instance.cloudId}. Stay deleted.`,
    );
  }

  console.log("[Instances] Deleted instance from state:", instance.name, id);
  return true;
}

/**
 * Duplicate instance
 */
export async function duplicateInstance(
  id: string,
): Promise<GameInstance | null> {
  const source = getInstance(id);
  if (!source) {
    return null;
  }

  // Create new instance with same settings
  const newInstance = await createInstance({
    name: `${source.name} (Copy)`,
    minecraftVersion: source.minecraftVersion,
    loader: source.loader,
    loaderVersion: source.loaderVersion,
    icon: source.icon,
    javaPath: source.javaPath,
    ramMB: source.ramMB,
  });

  // Copy files from source to new instance (async)
  try {
    const sourceDir = source.gameDirectory;
    const destDir = newInstance.gameDirectory;

    // Copy mods, config, saves, etc.
    const copyDirs = [
      "mods",
      "config",
      "resourcepacks",
      "shaderpacks",
      "saves",
      "datapacks",
    ];
    for (const dir of copyDirs) {
      const srcPath = path.join(sourceDir, dir);
      const dstPath = path.join(destDir, dir);
      try {
        await fs.promises.access(srcPath);
        await copyDirectoryAsync(srcPath, dstPath);
      } catch {
        /* source dir doesn't exist, skip */
      }
    }

    // Copy individual files (options, servers)
    const copyFiles = ["options.txt", "servers.dat"];
    for (const file of copyFiles) {
      const srcPath = path.join(sourceDir, file);
      const dstPath = path.join(destDir, file);
      try {
        await fs.promises.copyFile(srcPath, dstPath);
      } catch {
        /* file doesn't exist, skip */
      }
    }
  } catch (error) {
    console.error("[Instances] Failed to copy files:", error);
  }

  console.log(
    "[Instances] Duplicated instance:",
    source.name,
    "->",
    newInstance.name,
  );
  return newInstance;
}

/**
 * Update last played time
 */
export async function markInstancePlayed(
  id: string,
  playTimeMinutes: number = 0,
): Promise<void> {
  const instance = getInstance(id);
  if (instance) {
    await updateInstance(id, {
      lastPlayedAt: new Date().toISOString(),
      totalPlayTime: instance.totalPlayTime + playTimeMinutes,
    });
  }
}

/**
 * Set instance icon from file path or base64
 * Saves the icon as icon.png in the instance folder
 */
export async function setInstanceIcon(
  id: string,
  iconData: string,
): Promise<{ ok: boolean; error?: string }> {
  const instance = getInstance(id);
  if (!instance) {
    return { ok: false, error: "Instance not found" };
  }

  const iconPath = getInstanceIconPath(id);

  try {
    let imageBuffer: Buffer;

    if (iconData.startsWith("data:image")) {
      // Base64 data URL
      const base64Data = iconData.replace(/^data:image\/\w+;base64,/, "");
      imageBuffer = Buffer.from(base64Data, "base64");
    } else {
      // File path - check existence async
      try {
        await fs.promises.access(iconData);
      } catch {
        return { ok: false, error: "Invalid icon data" };
      }

      // Validate path before reading
      const resolved = path.resolve(iconData);

      // Allowed directories for icon files
      const allowedDirs = [
        app.getPath("pictures"),
        app.getPath("downloads"),
        app.getPath("desktop"),
        app.getPath("home"),
        getMinecraftDir(),
      ];

      const isSafe = allowedDirs.some((dir) => {
        const allowedPath = path.resolve(dir);
        return resolved.startsWith(allowedPath);
      });

      if (!isSafe) {
        console.warn("[Instances] Blocked path traversal attempt:", iconData);
        return { ok: false, error: "Invalid file path - access denied" };
      }

      imageBuffer = await fs.promises.readFile(iconData);
    }

    // Write to icon.png (async)
    await fs.promises.writeFile(iconPath, imageBuffer);

    // Reload instances to pick up the new icon
    await loadInstances();

    console.log("[Instances] Set icon for:", instance.name, "->", iconPath);
    return { ok: true };
  } catch (error) {
    console.error("[Instances] Failed to set icon:", error);
    return { ok: false, error: String(error) };
  }
}

// ========================================
// Helper Functions
// ========================================

/**
 * Copy directory recursively (async - non-blocking)
 */
async function copyDirectoryAsync(src: string, dest: string): Promise<void> {
  await fs.promises.mkdir(dest, { recursive: true });

  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryAsync(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
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
    .replace(/\s+/g, " ") // Normalize whitespace
    .substring(0, 100); // Limit length
}

/**
 * Generate unique ID from profile name
 * If name already exists, adds -1, -2, etc.
 */
function generateUniqueId(name: string): string {
  const baseName = sanitizeName(name);

  // If no instances with this name, use it directly
  if (!instances.find((i) => i.id === baseName)) {
    return baseName;
  }

  // Find unique name with suffix
  let counter = 1;
  let uniqueName = `${baseName}-${counter}`;
  while (instances.find((i) => i.id === uniqueName)) {
    counter++;
    uniqueName = `${baseName}-${counter}`;
  }

  return uniqueName;
}

// Initialize on module load
loadInstances().catch((err) =>
  console.error("[Instances] Init load failed:", err),
);
