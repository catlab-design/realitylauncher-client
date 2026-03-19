import type { BrowserWindow, IpcMain } from "electron";
import * as path from "path";
import * as fs from "fs-extra";

interface GameDirectoryInstance {
  gameDirectory: string;
}

interface InstanceContentLogger {
  info: (message: string, data?: Record<string, unknown>) => unknown;
  error: (message: string, error?: unknown, data?: Record<string, unknown>) => unknown;
}

type DownloadContentToInstance = (
  options: {
    projectId: string;
    versionId: string;
    instanceId: string;
    contentType: "mod" | "resourcepack" | "shader" | "datapack";
    contentSource?: "modrinth" | "curseforge";
  },
  onProgress: (progress: unknown) => void,
) => Promise<{ ok: boolean; filename?: string; error?: string }>;

export interface InstanceContentFileHandlersDeps {
  ipcMain: IpcMain;
  logger: InstanceContentLogger;
  getInstance: (id: string) => GameDirectoryInstance | null;
  getInstanceDir: (id: string) => string;
  getMainWindow: () => BrowserWindow | null;
  downloadContentToInstance: DownloadContentToInstance;
}

export function registerInstanceContentFileHandlers(
  deps: InstanceContentFileHandlersDeps,
): void {
  const {
    ipcMain,
    logger,
    getInstance,
    getInstanceDir,
    getMainWindow,
    downloadContentToInstance,
  } = deps;


  ipcMain.handle(
    "instance-add-content-file",
    async (
      _event,
      instanceId: string,
      filePath: string,
      contentType: string,
    ) => {
      logger.info(" instance-add-content-file called:", {
        instanceId,
        filePath,
        contentType,
      });

      const instance = getInstance(instanceId);
      if (!instance) {
        logger.info(" Instance not found:", { instanceId });
        return { ok: false, error: "Instance not found" };
      }

      const fileName = path.basename(filePath);
      const ext = path.extname(fileName).toLowerCase();

      // Validate file extension based on content type
      const validExtensions: Record<string, string[]> = {
        mod: [".jar"],
        resourcepack: [".zip"],
        shader: [".zip"],
        datapack: [".zip"],
      };

      const allowed = validExtensions[contentType] || [];
      if (!allowed.includes(ext)) {
        return {
          ok: false,
          error: `เนเธเธฅเน ${ext} เนเธกเนเธฃเธญเธเธฃเธฑเธเธชเธณเธซเธฃเธฑเธ ${contentType}\nเธฃเธญเธเธฃเธฑเธ: ${allowed.join(", ")}`,
        };
      }

      // Determine target directory
      const folderMap: Record<string, string> = {
        mod: "mods",
        resourcepack: "resourcepacks",
        shader: "shaderpacks",
        datapack: "datapacks",
      };

      const targetFolder = folderMap[contentType];
      if (!targetFolder) return { ok: false, error: "Invalid content type" };

      const targetDir = path.join(instance.gameDirectory, targetFolder);
      const targetPath = path.join(targetDir, fileName);

      try {
        // Ensure directory exists
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        // Check if file already exists
        if (fs.existsSync(targetPath)) {
          return { ok: false, error: `เนเธเธฅเน ${fileName} เธกเธตเธญเธขเธนเนเนเธฅเนเธง` };
        }

        // Copy file
        fs.copyFileSync(filePath, targetPath);
        return { ok: true, filename: fileName };
      } catch (error: any) {
        return { ok: false, error: error.message };
      }
    },
  );

  // List files in instance directory recursively
  ipcMain.handle("instances-list-files", async (_event, instanceId: string) => {
    try {
      const instance = getInstance(instanceId);
      if (!instance) {
        throw new Error(`Instance not found: ${instanceId}`);
      }

      const instancePath = getInstanceDir(instanceId);

      // Recursive function to build file tree
      const buildFileTree = (dir: string, relativePath: string = ""): any[] => {
        const items = fs.readdirSync(dir);
        const result: any[] = [];

        for (const item of items) {
          // Skip hidden files/folders and system folders that shouldn't be exported
          if (item.startsWith(".")) continue;
          // Skip folders that are always excluded from export
          if (
            [
              "logs",
              "crash-reports",
              "cache",
              "webcache",
              "natives",
              "assets",
            ].includes(item)
          )
            continue;

          const fullPath = path.join(dir, item);
          const itemRelativePath = path
            .join(relativePath, item)
            .replace(/\\/g, "/");
          const stats = fs.statSync(fullPath);

          if (stats.isDirectory()) {
            const children = buildFileTree(fullPath, itemRelativePath);
            result.push({
              name: item,
              path: itemRelativePath,
              type: "directory",
              children: children,
            });
          } else {
            result.push({
              name: item,
              path: itemRelativePath,
              type: "file",
              size: stats.size,
            });
          }
        }

        // Sort: Directories first, then files
        return result.sort((a, b) => {
          if (a.type === b.type) return a.name.localeCompare(b.name);
          return a.type === "directory" ? -1 : 1;
        });
      };

      const files = buildFileTree(instancePath);
      return { ok: true, files };
    } catch (error) {
      logger.error("Failed to list instance files:", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle(
    "instance-change-content-version",
    async (
      _event,
      options: {
        instanceId: string;
        oldFilename: string;
        projectId: string;
        newVersionId: string;
        contentType: string;
        contentSource?: "modrinth" | "curseforge";
      },
    ) => {
      const {
        instanceId,
        oldFilename,
        projectId,
        newVersionId,
        contentType,
        contentSource = "modrinth",
      } = options;
      logger.info(
        `Changing version for ${contentType}: ${oldFilename} -> project ${projectId}, version ${newVersionId}`,
      );

      const instance = getInstance(instanceId);
      if (!instance) return { ok: false, error: "Instance not found" };

      // 1. Map content type to folder
      const folderMap: Record<string, string> = {
        mod: "mods",
        mods: "mods",
        resourcepack: "resourcepacks",
        resourcepacks: "resourcepacks",
        shader: "shaderpacks",
        shaders: "shaderpacks",
        datapack: "datapacks",
        datapacks: "datapacks",
      };

      const folder = folderMap[contentType];
      if (!folder) return { ok: false, error: "Invalid content type" };

      // 2. Delete old file
      const oldPath = path.join(instance.gameDirectory, folder, oldFilename);
      try {
        if (fs.existsSync(oldPath)) {
          const stats = fs.statSync(oldPath);
          if (stats.isDirectory()) {
            fs.rmSync(oldPath, { recursive: true });
          } else {
            fs.rmSync(oldPath, { force: true });
          }
          logger.info(`Deleted old version: ${oldFilename}`);
        }
      } catch (err: any) {
        logger.error(`Failed to delete old version ${oldFilename}:`, err);
        return {
          ok: false,
          error: `Failed to remove old version: ${err.message}`,
        };
      }

      // 3. Download new version
      try {
        const mainWindow = getMainWindow();
        const result = await downloadContentToInstance(
          {
            projectId,
            versionId: newVersionId,
            instanceId,
            contentType: (contentType.endsWith("s")
              ? contentType.slice(0, -1)
              : contentType) as any,
            contentSource,
          },
          (progress) => {
            mainWindow?.webContents.send("content-download-progress", progress);
          },
        );

        if (result.ok) {
          logger.info(`Successfully changed version to ${result.filename}`);
        }
        return result;
      } catch (err: any) {
        logger.error(`Failed to download new version:`, err);
        return { ok: false, error: `Download failed: ${err.message}` };
      }
    },
  );
}
