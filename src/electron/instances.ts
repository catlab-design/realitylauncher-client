// Game Instance Management - each instance is a separate game profile
// with its own mods, config, and saves

import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { getMinecraftDir } from "./config.js";

// Native module loading - Rust core for performance
const customRequire = createRequire(__filename);
let nativeModule: any = null;
const DEBUG_INSTANCES = process.env.DEBUG_INSTANCES === "1";

function getNative(): any {
  if (nativeModule) return nativeModule;
  const nativePath = path.join(app.getAppPath(), "native", "index.cjs");
  nativeModule = customRequire(nativePath);
  return nativeModule;
}

// Type definitions
export type LoaderType = "vanilla" | "fabric" | "forge" | "neoforge" | "quilt";

export interface GameInstance {
  id: string;
  name: string;
  icon?: string;
  minecraftVersion: string;
  loader: LoaderType;
  loaderVersion?: string;
  createdAt: string;
  lastPlayedAt?: string;
  totalPlayTime: number;
  javaPath?: string;
  ramMB?: number;
  javaArguments?: string;
  gameDirectory: string;
  modpackId?: string;
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

// Global cache for all loaded instances - ensures reliable lookup
// even when current view is a paginated subset
const instanceCache = new Map<string, GameInstance>();

// Current list of instances (may be paginated subset for UI)
let instances: GameInstance[] = [];

// Path helpers
export function getInstancesDir(): string {
  const minecraftDir = getMinecraftDir();
  return path.join(minecraftDir, "instances");
}

export function getInstanceDir(instanceId: string): string {
  return path.join(getInstancesDir(), instanceId);
}

// Deprecated: Use instance.json in each instance folder instead
function getInstancesMetaPath(): string {
  return path.join(getInstancesDir(), "instances.json");
}

function getInstanceMetaPath(instanceId: string): string {
  return path.join(getInstanceDir(instanceId), "instance.json");
}

export function getInstanceIconPath(instanceId: string): string {
  return path.join(getInstanceDir(instanceId), "icon.png");
}

// Load instances from disk - uses Native Rust Core for performance
export async function loadInstances(
  offset: number = 0,
  limit: number = 1000,
): Promise<GameInstance[]> {
  let nativeInstances: any[] = [];
  try {
    const instancesDir = getInstancesDir();

    // Create instances directory if not exists
    try {
      await fs.promises.access(instancesDir);
    } catch {
      await fs.promises.mkdir(instancesDir, { recursive: true });
      instances = [];
      return instances;
    }

    // Migrate from old instances.json if exists
    const oldMetaPath = getInstancesMetaPath();
    let oldMetaExists = false;
    try {
      await fs.promises.access(oldMetaPath);
      oldMetaExists = true;
    } catch {}
    if (oldMetaExists) {
      console.log("[Instances] Migrating from instances.json to per-instance files...");
      try {
        const oldData = await fs.promises.readFile(oldMetaPath, "utf-8");
        const oldInstances = JSON.parse(oldData) as GameInstance[];

        for (const inst of oldInstances) {
          const instDir = getInstanceDir(inst.id);
          await fs.promises.mkdir(instDir, { recursive: true });
          const metaPath = getInstanceMetaPath(inst.id);
          await fs.promises.writeFile(metaPath, JSON.stringify(inst, null, 2));
          console.log("[Instances] Migrated:", inst.name);
        }

        await fs.promises.unlink(oldMetaPath);
        console.log("[Instances] Migration complete, deleted instances.json");
      } catch (migError) {
        console.error("[Instances] Migration error:", migError);
      }
    }

    // Use Native Rust Core to list instances efficiently
    const native = getNative();
    nativeInstances = (await native.listInstances(
      instancesDir,
      offset,
      limit,
    )) as any[];

    // Convert Native meta to GameInstance
    const loadedInstances: GameInstance[] = nativeInstances.map((meta) => ({
      id: meta.id,
      name: meta.name,
      icon: meta.icon,
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

    // Update cache and current view
    for (const inst of loadedInstances) {
      instanceCache.set(inst.id, inst);
    }
    instances = loadedInstances;

    if (DEBUG_INSTANCES) {
      console.log(
        `[Instances] Loaded ${instances.length} instances offset=${offset} limit=${limit}. Cache size: ${instanceCache.size}`,
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

// Cache to avoid redundant disk writes
const lastSavedContent = new Map<string, string>();

// Save single instance to its instance.json file
async function saveInstance(instance: GameInstance): Promise<void> {
  try {
    const instanceDir = getInstanceDir(instance.id);
    await fs.promises.mkdir(instanceDir, { recursive: true });

    const metaPath = getInstanceMetaPath(instance.id);

    // Don't save icon if loaded from file (stored as icon.png separately)
    const saveData = { ...instance };
    if (
      saveData.icon?.startsWith("file://") ||
      saveData.icon?.startsWith("data:")
    ) {
      delete saveData.icon;
    }

    const json = JSON.stringify(saveData, null, 2);

    // Only write if content has changed
    if (lastSavedContent.get(instance.id) === json) {
      return;
    }

    // Atomic write: write to .tmp then rename
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

async function saveInstances(): Promise<void> {
  await Promise.all(instances.map((inst) => saveInstance(inst)));
  if (DEBUG_INSTANCES) {
    console.log("[Instances] Saved all", instances.length, "instances");
  }
}

// CRUD operations
export async function getInstances(
  offset: number = 0,
  limit: number = 1000,
): Promise<GameInstance[]> {
  return await loadInstances(offset, limit);
}

export function getInstance(id: string): GameInstance | null {
  if (instanceCache.has(id)) {
    return instanceCache.get(id)!;
  }

  const instance = instances.find((i) => i.id === id);
  if (!instance) {
    console.warn(
      `[Instances] getInstance FAILED for ID: "${id}". Cache Size: ${instanceCache.size}. Available: ${instances.length}`,
    );
  }
  return instance || null;
}

export async function createInstance(
  options: CreateInstanceOptions,
): Promise<GameInstance> {
  const id = generateUniqueId(options.name);
  const gameDirectory = getInstanceDir(id);

  await fs.promises.mkdir(gameDirectory, { recursive: true });

  // Create subdirectories in parallel
  const subdirs = ["mods", "config", "saves", "resourcepacks", "shaderpacks", "datapacks"];
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

export async function importCloudInstance(
  cloudData: any,
): Promise<GameInstance> {
  const id = cloudData.storagePath || cloudData.id;
  const gameDirectory = getInstanceDir(id);
  const instancesDir = getInstancesDir();

  const native = getNative();
  if (typeof native.createInstanceDirectories !== "function") {
    console.error(
      "[Instances] CRITICAL: createInstanceDirectories is NOT a function. Available:",
      Object.keys(native),
    );
  }
  native.createInstanceDirectories(instancesDir, id);

  // Search by cloudId first, then fallback to id
  let existingIndex = instances.findIndex((i) => i.cloudId === cloudData.id);
  if (existingIndex === -1) {
    existingIndex = instances.findIndex((i) => i.id === id);
  }

  const instance: GameInstance = {
    id,
    name: cloudData.name,
    icon: cloudData.iconUrl || undefined,
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
    // Merge with existing - preserve local fields
    instances[existingIndex] = {
      ...instances[existingIndex],
      ...instance,
      id: instances[existingIndex].id,
      gameDirectory: instances[existingIndex].gameDirectory,
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

export async function updateInstance(
  id: string,
  updates: UpdateInstanceOptions,
): Promise<GameInstance | null> {
  const index = instances.findIndex((i) => i.id === id);
  let instance = index !== -1 ? instances[index] : instanceCache.get(id);

  if (!instance) {
    console.warn(
      `[Instances] updateInstance: Instance ${id} not found in array or cache.`,
    );
    return null;
  }

  const updatedInstance = { ...instance, ...updates };
  instanceCache.set(id, updatedInstance);

  if (index !== -1) {
    instances[index] = updatedInstance;
  }

  await saveInstance(updatedInstance);

  if (DEBUG_INSTANCES) {
    console.log("[Instances] Updated instance:", id);
  }
  return updatedInstance;
}

export async function deleteInstance(id: string): Promise<boolean> {
  const index = instances.findIndex((i) => i.id === id);
  const instance = index !== -1 ? instances[index] : instanceCache.get(id);

  if (!instance) {
    console.warn(`[Instances] deleteInstance: Instance ${id} not found.`);
    return false;
  }

  const targetDir = getInstanceDir(id);
  console.log("[Instances] Deleting:", instance.name, "at", targetDir);

  try {
    let dirExists = false;
    try {
      await fs.promises.access(targetDir);
      dirExists = true;
    } catch {}

    if (dirExists) {
      await fs.promises.rm(targetDir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
      console.log("[Instances] Deleted directory:", targetDir);
    } else {
      console.log("[Instances] Directory already gone:", targetDir);
    }
  } catch (error) {
    console.error("[Instances] Failed to delete directory:", error);
    return false;
  }

  if (index !== -1) {
    instances.splice(index, 1);
  }
  lastSavedContent.delete(id);
  instanceCache.delete(id);

  if (instance.cloudId) {
    console.log(`[Instances] Deleted cloud instance ${instance.cloudId}`);
  }

  console.log("[Instances] Deleted from state:", instance.name, id);
  return true;
}

export async function duplicateInstance(
  id: string,
): Promise<GameInstance | null> {
  const source = getInstance(id);
  if (!source) {
    return null;
  }

  const newInstance = await createInstance({
    name: `${source.name} (Copy)`,
    minecraftVersion: source.minecraftVersion,
    loader: source.loader,
    loaderVersion: source.loaderVersion,
    icon: source.icon,
    javaPath: source.javaPath,
    ramMB: source.ramMB,
  });

  try {
    const sourceDir = source.gameDirectory;
    const destDir = newInstance.gameDirectory;

    const copyDirs = ["mods", "config", "resourcepacks", "shaderpacks", "saves", "datapacks"];
    for (const dir of copyDirs) {
      const srcPath = path.join(sourceDir, dir);
      const dstPath = path.join(destDir, dir);
      try {
        await fs.promises.access(srcPath);
        await copyDirectoryAsync(srcPath, dstPath);
      } catch {
        /* skip if source doesn't exist */
      }
    }

    const copyFiles = ["options.txt", "servers.dat"];
    for (const file of copyFiles) {
      const srcPath = path.join(sourceDir, file);
      const dstPath = path.join(destDir, file);
      try {
        await fs.promises.copyFile(srcPath, dstPath);
      } catch {
        /* skip if file doesn't exist */
      }
    }
  } catch (error) {
    console.error("[Instances] Failed to copy files:", error);
  }

  console.log("[Instances] Duplicated:", source.name, "->", newInstance.name);
  return newInstance;
}

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
      const base64Data = iconData.replace(/^data:image\/\w+;base64,/, "");
      imageBuffer = Buffer.from(base64Data, "base64");
    } else {
      try {
        await fs.promises.access(iconData);
      } catch {
        return { ok: false, error: "Invalid icon data" };
      }

      const resolved = path.resolve(iconData);

      // Security: only allow files from safe directories
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

    await fs.promises.writeFile(iconPath, imageBuffer);
    await loadInstances();

    console.log("[Instances] Set icon for:", instance.name);
    return { ok: true };
  } catch (error) {
    console.error("[Instances] Failed to set icon:", error);
    return { ok: false, error: String(error) };
  }
}

// Helper functions
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

function sanitizeName(name: string): string {
  return name
    .trim()
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .substring(0, 100);
}

function generateUniqueId(name: string): string {
  const baseName = sanitizeName(name);

  if (!instances.find((i) => i.id === baseName)) {
    return baseName;
  }

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

