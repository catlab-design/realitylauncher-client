import type { IpcMain } from "electron";
import * as path from "path";
import * as fs from "fs-extra";
import AdmZip from "adm-zip";

type NativePackKind = "resource" | "shader" | "datapack";

interface PackIconCacheEntry {
  url: string | null;
  modrinthId?: string;
  curseforgeId?: string;
}

interface GameDirectoryInstance {
  gameDirectory: string;
}

interface InstancePackLogger {
  warn: (message: string, data?: Record<string, unknown>) => unknown;
}

export interface InstancePackHandlersDeps {
  ipcMain: IpcMain;
  logger: InstancePackLogger;
  getInstance: (id: string) => GameDirectoryInstance | null;
  getInstancesDir: () => string;
  getNativeModule: () => unknown;
  dedupeResourcepacks: (items: any[]) => any[];
  dedupeShaders: (items: any[]) => any[];
  dedupeDatapacks: (items: any[]) => any[];
  getIconFromCache: (key: string) => PackIconCacheEntry | undefined;
  packFormatToVersion: (format: number, type?: "resource" | "data") => string;
  inspectPackMetadataWithNative: (
    filePath: string,
    kind: NativePackKind,
  ) => Promise<{
    icon: string | null;
    version?: string;
    packFormat?: number;
  }>;
  fetchIconFromOnline: (
    name: string,
    contentType: "shader" | "resourcepack",
  ) => Promise<{ url: string | null; modrinthId?: string; curseforgeId?: string }>;
  readUtf8LogTail: (
    filePath: string,
    maxLines: number,
    maxBytes: number,
  ) => Promise<string>;
  latestLogTailMaxLines: number;
  latestLogTailMaxBytes: number;
}

export function registerInstancePackHandlers(deps: InstancePackHandlersDeps): void {
  const {
    ipcMain,
    logger,
    getInstance,
    getInstancesDir,
    getNativeModule,
    dedupeResourcepacks,
    dedupeShaders,
    dedupeDatapacks,
    getIconFromCache,
    packFormatToVersion,
    inspectPackMetadataWithNative,
    fetchIconFromOnline,
    readUtf8LogTail,
    latestLogTailMaxLines,
    latestLogTailMaxBytes,
  } = deps;
  const LATEST_LOG_TAIL_MAX_LINES = latestLogTailMaxLines;
  const LATEST_LOG_TAIL_MAX_BYTES = latestLogTailMaxBytes;


  ipcMain.handle(
    "instance-list-resourcepacks",
    async (_event, instanceId: string) => {
      const instance = getInstance(instanceId);
      if (!instance) return { ok: false, error: "Instance not found" };

      const dir = path.join(instance.gameDirectory, "resourcepacks");
      if (!fs.existsSync(dir)) return { ok: true, items: [] };

      try {
        const native = getNativeModule() as any;
        if (typeof native.scanPackDirectory === "function") {
          try {
            const scanned = (await native.scanPackDirectory(
              dir,
              "resource",
            )) as Array<{
              filename?: string;
              displayName?: string;
              isDirectory?: boolean;
              size?: number;
              modifiedAt?: string;
              enabled?: boolean;
              iconBase64?: string | null;
              version?: string | null;
              packFormat?: number | null;
            }>;

            if (Array.isArray(scanned)) {
              const nativeItems = scanned
                .map((item) => {
                  const filename = String(item?.filename || "");
                  if (!filename) return null;

                  const displayName = String(
                    item?.displayName || filename,
                  ).trim();
                  const cacheKey = `resourcepack:${displayName.toLowerCase()}`;
                  const cached = getIconFromCache(cacheKey);
                  const nativeIcon =
                    typeof item?.iconBase64 === "string" &&
                    item.iconBase64.length > 0
                      ? `data:image/png;base64,${item.iconBase64}`
                      : null;

                  let version =
                    typeof item?.version === "string" && item.version.length > 0
                      ? item.version
                      : undefined;
                  if (!version && typeof item?.packFormat === "number") {
                    version = packFormatToVersion(item.packFormat, "resource");
                  }

                  return {
                    filename,
                    name: displayName,
                    isDirectory: Boolean(item?.isDirectory),
                    size:
                      typeof item?.size === "number"
                        ? item.size
                        : 0,
                    modifiedAt:
                      typeof item?.modifiedAt === "string" &&
                      item.modifiedAt.length > 0
                        ? item.modifiedAt
                        : new Date().toISOString(),
                    enabled: item?.enabled !== false,
                    icon: cached?.url || nativeIcon,
                    version,
                    modrinthProjectId: cached?.modrinthId,
                    curseforgeProjectId: cached?.curseforgeId,
                  };
                })
                .filter((item) => item !== null) as any[];

              return { ok: true, items: dedupeResourcepacks(nativeItems) };
            }
          } catch (scanError) {
            logger.warn("Native resourcepack scan failed, fallback to JS", {
              message: String((scanError as Error)?.message || scanError),
            });
          }
        }

        const nativePacks = (() => {
          try {
            return (native.listInstanceResourcepacks(
              getInstancesDir(),
              instanceId,
            ) || []) as Array<{
              filename: string;
              packFormat?: number;
              size?: number;
            }>;
          } catch {
            return [];
          }
        })();
        const nativePackMap = new Map(
          nativePacks.map((pack) => [pack.filename, pack]),
        );

        const files = await fs.promises.readdir(dir);

        // Get basic info without icons (fast) - icons will be loaded lazily
        const basicItems = await Promise.all(
          files.map(async (file) => {
            const filePath = path.join(dir, file);
            try {
              const stats = await fs.promises.stat(filePath);
              const isDirectory = stats.isDirectory();

              if (
                !file.endsWith(".zip") &&
                !file.endsWith(".zip.disabled") &&
                !isDirectory
              ) {
                return null;
              }

              let enabled = true;
              let displayName = file;

              if (file.endsWith(".zip.disabled")) {
                enabled = false;
                displayName = file.replace(".zip.disabled", "");
              } else if (file.endsWith(".zip")) {
                displayName = file.replace(".zip", "");
              }
              const nativeInfo = nativePackMap.get(file);
              const nativeMetadata = await inspectPackMetadataWithNative(
                filePath,
                "resource",
              );

              const cacheKey = `resourcepack:${displayName.toLowerCase()}`;
              const cached = getIconFromCache(cacheKey);

              // Try native metadata first (background worker), then fallback reads.
              let icon: string | null =
                cached?.url || nativeMetadata.icon || null;
              let modrinthProjectId = cached?.modrinthId;
              let curseforgeProjectId = cached?.curseforgeId;
              let version: string | undefined =
                nativeMetadata.version || undefined;
              if (typeof nativeInfo?.packFormat === "number") {
                version = packFormatToVersion(nativeInfo.packFormat, "resource");
              } else if (typeof nativeMetadata.packFormat === "number") {
                version = packFormatToVersion(
                  nativeMetadata.packFormat,
                  "resource",
                );
              }
              if (
                (!icon || !version) &&
                (file.endsWith(".zip") || file.endsWith(".zip.disabled"))
              ) {
                try {
                  const buffer = await fs.promises.readFile(filePath);
                  const zip = new AdmZip(buffer);

                  // Extract icon
                  if (!icon) {
                    const packPng = zip.getEntry("pack.png");
                    if (packPng) {
                      icon = `data:image/png;base64,${packPng.getData().toString("base64")}`;
                    }
                  }
                } catch (e) {
                  // Ignore errors reading zip
                }
              } else if ((!icon || !version) && isDirectory) {
                // Directory-based resourcepack
                if (!icon) {
                  const packPngPath = path.join(filePath, "pack.png");
                  if (fs.existsSync(packPngPath)) {
                    try {
                      icon = `data:image/png;base64,${(await fs.promises.readFile(packPngPath)).toString("base64")}`;
                    } catch {
                      /* ignore */
                    }
                  }
                }
              }

              return {
                filename: file,
                name: displayName,
                isDirectory,
                size:
                  typeof nativeInfo?.size === "number"
                    ? nativeInfo.size
                    : stats.size,
                modifiedAt: stats.mtime.toISOString(),
                enabled,
                icon,
                version,
                modrinthProjectId,
                curseforgeProjectId,
              };
            } catch {
              return null;
            }
          }),
        );

        const validItems = basicItems.filter((i) => i !== null) as any[];

        // Use dedupe helper
        const rpItems = dedupeResourcepacks(validItems as any[]);
        return { ok: true, items: rpItems };
      } catch (error: any) {
        return { ok: false, error: error.message };
      }
    },
  );

  ipcMain.handle(
    "instance-toggle-resourcepack",
    async (_event, instanceId: string, filename: string) => {
      const instance = getInstance(instanceId);
      if (!instance) return { ok: false, error: "Instance not found" };

      const dir = path.join(instance.gameDirectory, "resourcepacks");
      const filePath = path.join(dir, filename);

      if (!fs.existsSync(filePath)) return { ok: false, error: "Not found" };

      try {
        let newFilename: string;
        let enabled: boolean;

        if (filename.endsWith(".zip.disabled")) {
          newFilename = filename.replace(".zip.disabled", ".zip");
          enabled = true;
        } else if (filename.endsWith(".zip")) {
          newFilename = filename + ".disabled";
          enabled = false;
        } else {
          return { ok: false, error: "Cannot toggle directories" };
        }

        fs.renameSync(filePath, path.join(dir, newFilename));
        return { ok: true, newFilename, enabled };
      } catch (error: any) {
        return { ok: false, error: error.message };
      }
    },
  );

  ipcMain.handle(
    "instance-delete-resourcepack",
    async (_event, instanceId: string, filename: string) => {
      const instance = getInstance(instanceId);
      if (!instance) return { ok: false, error: "Instance not found" };

      const filePath = path.join(
        instance.gameDirectory,
        "resourcepacks",
        filename,
      );
      if (!fs.existsSync(filePath)) return { ok: false, error: "Not found" };

      try {
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          fs.rmSync(filePath, { recursive: true });
        } else {
          fs.rmSync(filePath, { force: true });
        }
        return { ok: true };
      } catch (error: any) {
        return { ok: false, error: error.message };
      }
    },
  );

  // ----------------------------------------
  // Shaders
  // ----------------------------------------

  ipcMain.handle(
    "instance-list-shaders",
    async (_event, instanceId: string) => {
      const instance = getInstance(instanceId);
      if (!instance) return { ok: false, error: "Instance not found" };

      const dir = path.join(instance.gameDirectory, "shaderpacks");
      if (!fs.existsSync(dir)) return { ok: true, items: [] };

      try {
        const native = getNativeModule() as any;
        if (typeof native.scanPackDirectory === "function") {
          try {
            const scanned = (await native.scanPackDirectory(
              dir,
              "shader",
            )) as Array<{
              filename?: string;
              displayName?: string;
              isDirectory?: boolean;
              size?: number;
              modifiedAt?: string;
              enabled?: boolean;
              iconBase64?: string | null;
              version?: string | null;
            }>;

            if (Array.isArray(scanned)) {
              const mapped = scanned
                .map((item) => {
                  const filename = String(item?.filename || "");
                  if (!filename) return null;
                  const name = String(item?.displayName || filename).trim();
                  const icon =
                    typeof item?.iconBase64 === "string" &&
                    item.iconBase64.length > 0
                      ? `data:image/png;base64,${item.iconBase64}`
                      : null;
                  const version =
                    typeof item?.version === "string" && item.version.length > 0
                      ? item.version
                      : undefined;
                  return {
                    filename,
                    name,
                    isDirectory: Boolean(item?.isDirectory),
                    size: typeof item?.size === "number" ? item.size : 0,
                    modifiedAt:
                      typeof item?.modifiedAt === "string" &&
                      item.modifiedAt.length > 0
                        ? item.modifiedAt
                        : new Date().toISOString(),
                    enabled: item?.enabled !== false,
                    icon,
                    version,
                  };
                })
                .filter((item) => item !== null) as Array<{
                filename: string;
                name: string;
                isDirectory: boolean;
                size: number;
                modifiedAt: string;
                enabled: boolean;
                icon: string | null;
                version?: string;
              }>;

              const enriched = await Promise.all(
                mapped.map(async (item) => {
                  let icon = item.icon;
                  let version = item.version;
                  let modrinthProjectId: string | undefined;
                  let curseforgeProjectId: string | undefined;

                  if (!icon) {
                    const onlineResult = await fetchIconFromOnline(
                      item.name,
                      "shader",
                    );
                    icon = onlineResult.url;
                    modrinthProjectId = onlineResult.modrinthId;
                    curseforgeProjectId = onlineResult.curseforgeId;
                  }

                  if (!version) {
                    const nameMatch = item.name.match(
                      /[_\-\s]([rv]?\d+(?:\.\d+)+(?:[._\-]\w+)*)$/i,
                    );
                    if (nameMatch) {
                      version = nameMatch[1];
                    }
                  }

                  return {
                    ...item,
                    icon,
                    version,
                    modrinthProjectId,
                    curseforgeProjectId,
                  };
                }),
              );

              return { ok: true, items: dedupeShaders(enriched as any[]) };
            }
          } catch (scanError) {
            logger.warn("Native shader scan failed, fallback to JS", {
              message: String((scanError as Error)?.message || scanError),
            });
          }
        }

        const files = await fs.promises.readdir(dir);

        // First pass: get basic info without icons (fast)
        const basicItems = await Promise.all(
          files.map(async (file) => {
            const filePath = path.join(dir, file);
            try {
              const stats = await fs.promises.stat(filePath);
              const isDirectory = stats.isDirectory();

              if (
                !file.endsWith(".zip") &&
                !file.endsWith(".zip.disabled") &&
                !isDirectory
              ) {
                return null;
              }

              let enabled = true;
              let displayName = file;

              if (file.endsWith(".zip.disabled")) {
                enabled = false;
                displayName = file.replace(".zip.disabled", "");
              } else if (file.endsWith(".zip")) {
                displayName = file.replace(".zip", "");
              }

              return {
                filename: file,
                name: displayName,
                isDirectory,
                size: stats.size,
                modifiedAt: stats.mtime.toISOString(),
                enabled,
                icon: null as string | null,
                filePath,
              };
            } catch {
              return null;
            }
          }),
        );

        const validItems = basicItems.filter((i) => i !== null) as any[];

        // Second pass: fetch icons in parallel (Modrinth/CurseForge first, then fallback to ZIP)
        const itemsWithIcons = await Promise.all(
          validItems.map(async (item) => {
            // 1. Try local ZIP/directory icon first (Fast & Accurate)
            const nativeInfo = await inspectPackMetadataWithNative(
              item.filePath,
              "shader",
            );
            let icon: string | null = nativeInfo.icon;
            let version: string | undefined = nativeInfo.version;

            if (!icon || !version) {
              try {
                if (
                  item.filename.endsWith(".zip") ||
                  item.filename.endsWith(".zip.disabled")
                ) {
                  const buffer = await fs.promises.readFile(item.filePath);
                  const zip = new AdmZip(buffer);
                  const possibleIcons = [
                    "shaders/logo.png",
                    "logo.png",
                    "pack.png",
                    "icon.png",
                  ];
                  for (const iconPath of possibleIcons) {
                    const iconEntry = zip.getEntry(iconPath);
                    if (iconEntry) {
                      icon = `data:image/png;base64,${iconEntry.getData().toString("base64")}`;
                      break;
                    }
                  }

                  // Extract version from shaders.properties
                  const propsEntry =
                    zip.getEntry("shaders/shaders.properties") ||
                    zip.getEntry("shaders.properties");
                  if (propsEntry) {
                    try {
                      const propsText = propsEntry.getData().toString("utf-8");
                      const versionMatch = propsText.match(
                        /^version\s*[=:]\s*(.+)$/m,
                      );
                      if (versionMatch) {
                        version = versionMatch[1].trim();
                      }
                    } catch {
                      /* ignore */
                    }
                  }
                } else if (item.isDirectory) {
                  const possiblePaths = [
                    path.join(item.filePath, "shaders", "logo.png"),
                    path.join(item.filePath, "logo.png"),
                    path.join(item.filePath, "pack.png"),
                    path.join(item.filePath, "icon.png"),
                  ];
                  for (const iconPath of possiblePaths) {
                    if (fs.existsSync(iconPath)) {
                      icon = `data:image/png;base64,${(await fs.promises.readFile(iconPath)).toString("base64")}`;
                      break;
                    }
                  }

                  // Extract version from shaders.properties (directory)
                  const propsPaths = [
                    path.join(item.filePath, "shaders", "shaders.properties"),
                    path.join(item.filePath, "shaders.properties"),
                  ];
                  for (const propsPath of propsPaths) {
                    if (fs.existsSync(propsPath)) {
                      try {
                        const propsText = await fs.promises.readFile(
                          propsPath,
                          "utf-8",
                        );
                        const versionMatch = (propsText as string).match(
                          /^version\s*[=:]\s*(.+)$/m,
                        );
                        if (versionMatch) {
                          version = versionMatch[1].trim();
                        }
                      } catch {
                        /* ignore */
                      }
                      break;
                    }
                  }
                }
              } catch {}
            }

            let modrinthProjectId: string | undefined;
            let curseforgeProjectId: string | undefined;

            // 2. Fallback to online icon if local not found (Slow / Heuristic)
            if (!icon) {
              const onlineResult = await fetchIconFromOnline(
                item.name,
                "shader",
              );
              icon = onlineResult.url;
              modrinthProjectId = onlineResult.modrinthId;
              curseforgeProjectId = onlineResult.curseforgeId;
            }

            // 3. Fallback: extract version from filename (e.g. "ComplementaryReimagined_r5.7.1")
            if (!version) {
              // Match patterns like _r5.7.1, _v2.0, -v1.2.3, _1.0.0, v1.2.3
              const nameMatch = item.name.match(
                /[_\-\s]([rv]?\d+(?:\.\d+)+(?:[._\-]\w+)*)$/i,
              );
              if (nameMatch) {
                version = nameMatch[1];
              }
            }

            return {
              filename: item.filename,
              name: item.name,
              isDirectory: item.isDirectory,
              size: item.size,
              modifiedAt: item.modifiedAt,
              enabled: item.enabled,
              icon,
              version,
              modrinthProjectId,
              curseforgeProjectId,
            };
          }),
        );

        // Use dedupe helper
        const resultItems = dedupeShaders(itemsWithIcons);
        return { ok: true, items: resultItems };
      } catch (error: any) {
        return { ok: false, error: error.message };
      }
    },
  );

  ipcMain.handle(
    "instance-toggle-shader",
    async (_event, instanceId: string, filename: string) => {
      const instance = getInstance(instanceId);
      if (!instance) return { ok: false, error: "Instance not found" };

      const dir = path.join(instance.gameDirectory, "shaderpacks");
      const filePath = path.join(dir, filename);

      if (!fs.existsSync(filePath)) return { ok: false, error: "Not found" };

      try {
        let newFilename: string;
        let enabled: boolean;

        if (filename.endsWith(".zip.disabled")) {
          newFilename = filename.replace(".zip.disabled", ".zip");
          enabled = true;
        } else if (filename.endsWith(".zip")) {
          newFilename = filename + ".disabled";
          enabled = false;
        } else {
          return { ok: false, error: "Cannot toggle directories" };
        }

        fs.renameSync(filePath, path.join(dir, newFilename));
        return { ok: true, newFilename, enabled };
      } catch (error: any) {
        return { ok: false, error: error.message };
      }
    },
  );

  ipcMain.handle(
    "instance-delete-shader",
    async (_event, instanceId: string, filename: string) => {
      const instance = getInstance(instanceId);
      if (!instance) return { ok: false, error: "Instance not found" };

      const filePath = path.join(
        instance.gameDirectory,
        "shaderpacks",
        filename,
      );
      if (!fs.existsSync(filePath)) return { ok: false, error: "Not found" };

      try {
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          fs.rmSync(filePath, { recursive: true });
        } else {
          fs.rmSync(filePath, { force: true });
        }
        return { ok: true };
      } catch (error: any) {
        return { ok: false, error: error.message };
      }
    },
  );

  // ----------------------------------------
  // Datapacks
  // ----------------------------------------

  ipcMain.handle(
    "instance-list-datapacks",
    async (_event, instanceId: string) => {
      const instance = getInstance(instanceId);
      if (!instance) return { ok: false, error: "Instance not found" };

      const items: any[] = [];

      const processDp = async (dpDir: string, worldName: string) => {
        if (!fs.existsSync(dpDir)) return;
        const native = getNativeModule() as any;
        if (typeof native.scanPackDirectory === "function") {
          try {
            const scanned = (await native.scanPackDirectory(
              dpDir,
              "datapack",
            )) as Array<{
              filename?: string;
              displayName?: string;
              isDirectory?: boolean;
              size?: number;
              modifiedAt?: string;
              enabled?: boolean;
              iconBase64?: string | null;
              version?: string | null;
              packFormat?: number | null;
            }>;

            if (Array.isArray(scanned)) {
              const mapped = scanned
                .map((item) => {
                  const filename = String(item?.filename || "");
                  if (!filename) return null;
                  const name = String(item?.displayName || filename).trim();
                  const icon =
                    typeof item?.iconBase64 === "string" &&
                    item.iconBase64.length > 0
                      ? `data:image/png;base64,${item.iconBase64}`
                      : null;
                  let version =
                    typeof item?.version === "string" && item.version.length > 0
                      ? item.version
                      : undefined;
                  if (!version && typeof item?.packFormat === "number") {
                    version = packFormatToVersion(item.packFormat, "data");
                  }

                  return {
                    filename,
                    name,
                    worldName,
                    isDirectory: Boolean(item?.isDirectory),
                    size: typeof item?.size === "number" ? item.size : 0,
                    modifiedAt:
                      typeof item?.modifiedAt === "string" &&
                      item.modifiedAt.length > 0
                        ? item.modifiedAt
                        : new Date().toISOString(),
                    enabled: item?.enabled !== false,
                    icon,
                    version,
                  };
                })
                .filter((item) => item !== null);

              items.push(...mapped);
              return;
            }
          } catch (scanError) {
            logger.warn("Native datapack scan failed, fallback to JS", {
              message: String((scanError as Error)?.message || scanError),
            });
          }
        }

        const files = await fs.promises.readdir(dpDir);

        const dpItems = await Promise.all(
          files.map(async (file) => {
            const filePath = path.join(dpDir, file);
            try {
              const stats = await fs.promises.stat(filePath);
              const isDir = stats.isDirectory();

              if (
                !file.endsWith(".zip") &&
                !file.endsWith(".zip.disabled") &&
                !file.endsWith(".jar") &&
                !file.endsWith(".jar.disabled") &&
                !isDir
              ) {
                return null;
              }

              let enabled = true;
              let displayName = file;

              if (
                file.endsWith(".zip.disabled") ||
                file.endsWith(".jar.disabled")
              ) {
                enabled = false;
                displayName = file
                  .replace(".zip.disabled", "")
                  .replace(".jar.disabled", "");
              } else if (file.endsWith(".zip")) {
                displayName = file.replace(".zip", "");
              } else if (file.endsWith(".jar")) {
                displayName = file.replace(".jar", "");
              }

              const nativeInfo = await inspectPackMetadataWithNative(
                filePath,
                "datapack",
              );
              let icon: string | null = nativeInfo.icon;
              let version: string | undefined = nativeInfo.version;
              if (!version && typeof nativeInfo.packFormat === "number") {
                version = packFormatToVersion(nativeInfo.packFormat, "data");
              }
              try {
                if (
                  (!icon || !version) &&
                  (file.endsWith(".zip") ||
                    file.endsWith(".zip.disabled") ||
                    file.endsWith(".jar") ||
                    file.endsWith(".jar.disabled"))
                ) {
                  const zip = new AdmZip(filePath);

                  // Try standard pack.png (root, assets/, or depth-1 subfolder)
                  let packPng =
                    zip.getEntry("pack.png") || zip.getEntry("assets/pack.png");

                  // Also check for pack.png inside a root subfolder (e.g. MyDataPack/pack.png)
                  if (!packPng) {
                    const entries = zip.getEntries();
                    for (const e of entries) {
                      if (
                        !e.isDirectory &&
                        /^[^/]+\/pack\.png$/i.test(e.entryName)
                      ) {
                        packPng = e;
                        break;
                      }
                    }
                  }

                  if (packPng) {
                    try {
                      icon = `data:image/png;base64,${packPng.getData().toString("base64")}`;
                    } catch {}
                  }

                  // Fallback: find first png file in zip root or assets
                  if (!icon) {
                    const entries = zip.getEntries();
                    for (const e of entries) {
                      if (
                        !e.isDirectory &&
                        /^[^/]*\/?[^/]+\.png$/i.test(e.entryName)
                      ) {
                        try {
                          const data = e.getData();
                          if (data && data.length > 0) {
                            icon = `data:image/png;base64,${data.toString("base64")}`;
                            break;
                          }
                        } catch {}
                      }
                    }
                  }

                  // Extract version from pack.mcmeta
                  let mcmeta = zip.getEntry("pack.mcmeta");
                  if (!mcmeta) {
                    // Check depth-1 subfolder
                    const entries = zip.getEntries();
                    for (const e of entries) {
                      if (
                        !e.isDirectory &&
                        /^[^/]+\/pack\.mcmeta$/i.test(e.entryName)
                      ) {
                        mcmeta = e;
                        break;
                      }
                    }
                  }
                  if (mcmeta) {
                    try {
                      const mcmetaData = JSON.parse(
                        mcmeta.getData().toString("utf-8"),
                      );
                      const packFormat = mcmetaData?.pack?.pack_format;
                      if (typeof packFormat === "number") {
                        version = packFormatToVersion(packFormat, "data");
                      }
                    } catch {
                      /* ignore parse errors */
                    }
                  }
                } else if ((!icon || !version) && isDir) {
                  const packPngPath = path.join(filePath, "pack.png");
                  if (fs.existsSync(packPngPath)) {
                    icon = `data:image/png;base64,${fs.readFileSync(packPngPath).toString("base64")}`;
                  } else {
                    // Fallback: search for first png inside directory (max depth 2)
                    const allFiles = await (async function walk(
                      dirPath: string,
                      depth = 0,
                    ) {
                      if (depth > 2) return [];
                      const acc: string[] = [];
                      const list = await fs.promises.readdir(dirPath);
                      for (const f of list) {
                        const p = path.join(dirPath, f);
                        try {
                          const st = await fs.promises.stat(p);
                          if (st.isDirectory())
                            acc.push(...(await walk(p, depth + 1)));
                          else if (/\.png$/i.test(f)) acc.push(p);
                        } catch {}
                      }
                      return acc;
                    })(filePath);
                    if (allFiles && allFiles.length > 0) {
                      try {
                        icon = `data:image/png;base64,${fs.readFileSync(allFiles[0]).toString("base64")}`;
                      } catch {}
                    }
                  }
                  // Read pack.mcmeta from directory
                  const mcmetaPath = path.join(filePath, "pack.mcmeta");
                  if (fs.existsSync(mcmetaPath)) {
                    try {
                      const mcmetaData = JSON.parse(
                        fs.readFileSync(mcmetaPath, "utf-8") as string,
                      );
                      const packFormat = mcmetaData?.pack?.pack_format;
                      if (typeof packFormat === "number") {
                        version = packFormatToVersion(packFormat, "data");
                      }
                    } catch {
                      /* ignore parse errors */
                    }
                  }
                }
              } catch {}

              return {
                filename: file,
                name: displayName,
                worldName,
                isDirectory: isDir,
                size: stats.size,
                modifiedAt: stats.mtime.toISOString(),
                enabled,
                icon,
                version,
              };
            } catch {
              return null;
            }
          }),
        );

        items.push(...dpItems.filter((i) => i !== null));
      };

      await processDp(
        path.join(instance.gameDirectory, "datapacks"),
        "(Global)",
      );

      const savesDir = path.join(instance.gameDirectory, "saves");
      if (fs.existsSync(savesDir)) {
        try {
          const worlds = await fs.promises.readdir(savesDir);
          await Promise.all(
            worlds.map(async (worldName) => {
              const worldPath = path.join(savesDir, worldName);
              try {
                const worldStats = await fs.promises.stat(worldPath);
                if (!worldStats.isDirectory()) return;
                await processDp(path.join(worldPath, "datapacks"), worldName);
              } catch {}
            }),
          );
        } catch {}
      }

      // Use dedupe helper
      const sorted = dedupeDatapacks(items);
      return { ok: true, items: sorted };
    },
  );

  ipcMain.handle(
    "instance-toggle-datapack",
    async (_event, instanceId: string, worldName: string, filename: string) => {
      const instance = getInstance(instanceId);
      if (!instance) return { ok: false, error: "Instance not found" };

      const dpDir =
        worldName === "(Global)"
          ? path.join(instance.gameDirectory, "datapacks")
          : path.join(instance.gameDirectory, "saves", worldName, "datapacks");
      const filePath = path.join(dpDir, filename);

      if (!fs.existsSync(filePath)) return { ok: false, error: "Not found" };

      try {
        let newFilename: string;
        let enabled: boolean;

        if (filename.endsWith(".zip.disabled")) {
          newFilename = filename.replace(".zip.disabled", ".zip");
          enabled = true;
        } else if (filename.endsWith(".jar.disabled")) {
          newFilename = filename.replace(".jar.disabled", ".jar");
          enabled = true;
        } else if (filename.endsWith(".zip")) {
          newFilename = filename + ".disabled";
          enabled = false;
        } else if (filename.endsWith(".jar")) {
          newFilename = filename + ".disabled";
          enabled = false;
        } else {
          return { ok: false, error: "Cannot toggle directories" };
        }

        fs.renameSync(filePath, path.join(dpDir, newFilename));
        return { ok: true, newFilename, enabled };
      } catch (error: any) {
        return { ok: false, error: error.message };
      }
    },
  );

  ipcMain.handle(
    "instance-delete-datapack",
    async (_event, instanceId: string, worldName: string, filename: string) => {
      const instance = getInstance(instanceId);
      if (!instance) return { ok: false, error: "Instance not found" };

      const filePath =
        worldName === "(Global)"
          ? path.join(instance.gameDirectory, "datapacks", filename)
          : path.join(
              instance.gameDirectory,
              "saves",
              worldName,
              "datapacks",
              filename,
            );

      if (!fs.existsSync(filePath)) return { ok: false, error: "Not found" };

      try {
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          fs.rmSync(filePath, { force: true });
        }
        return { ok: true };
      } catch (error: any) {
        return { ok: false, error: error.message };
      }
    },
  );

  // ----------------------------------------
  // Logs
  // ----------------------------------------

  ipcMain.handle(
    "instance-read-latest-log",
    async (_event, instanceId: string) => {
      const instance = getInstance(instanceId);
      if (!instance)
        return { ok: false, error: "Instance not found", content: "" };

      const logPath = path.join(instance.gameDirectory, "logs", "latest.log");

      try {
        if (!fs.existsSync(logPath)) {
          return { ok: true, content: "", message: "No log file" };
        }

        const native = getNativeModule() as any;
        if (typeof native.readLogTail === "function") {
          try {
            const nativeContent = native.readLogTail(
              logPath,
              LATEST_LOG_TAIL_MAX_LINES,
              LATEST_LOG_TAIL_MAX_BYTES,
            );
            return {
              ok: true,
              content:
                typeof nativeContent === "string"
                  ? nativeContent
                  : String(nativeContent || ""),
            };
          } catch (nativeError) {
            logger.warn("[Logs] Native readLogTail failed, fallback to JS", {
              message: String((nativeError as Error)?.message || nativeError),
            });
          }
        }

        const content = await readUtf8LogTail(
          logPath,
          LATEST_LOG_TAIL_MAX_LINES,
          LATEST_LOG_TAIL_MAX_BYTES,
        );
        return { ok: true, content };
      } catch (error: any) {
        return { ok: false, error: error.message, content: "" };
      }
    },
  );
}
