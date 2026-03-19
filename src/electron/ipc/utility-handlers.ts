/**
 * ========================================
 * Utility IPC Handlers
 * ========================================
 *
 * Handles utility functions: file dialogs, Java detection, etc.
 */

import { ipcMain, shell, dialog, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getMinecraftDir, getAppDataDir, getConfig, setConfig } from "../config.js";
import { getSession } from "../auth.js";
import { refreshMicrosoftTokenIfNeeded } from "../auth-refresh.js";
import { getNativeModule } from "../native.js";

type SkinVariant = "classic" | "slim";

type NativeJavaInstallation = {
  path: string;
  version?: string;
  majorVersion?: number;
  vendor?: string;
  is64Bit?: boolean;
  isJdk?: boolean;
};

type NativeJavaDetectionResult = {
  installations?: NativeJavaInstallation[];
  recommended?: NativeJavaInstallation;
};

type MinecraftProfileCacheEntry = {
  fetchedAt: number;
  profile: any;
};

const MINECRAFT_PROFILE_CACHE_TTL_MS = 10 * 60 * 1000;
const MINECRAFT_PROFILE_CACHE_FILE = "minecraft-profile-cache.json";

function getNativeJavaModule(): any | null {
  try {
    return getNativeModule();
  } catch (error) {
    console.warn("[Java] Native module unavailable, using JS fallback");
    return null;
  }
}

function normalizeJavaInstallations(
  result: NativeJavaDetectionResult | null | undefined,
): NativeJavaInstallation[] {
  const installs = Array.isArray(result?.installations)
    ? result!.installations
    : [];
  return installs.filter(
    (install): install is NativeJavaInstallation =>
      !!install &&
      typeof install.path === "string" &&
      install.path.length > 0,
  );
}

function parsePngDataUrl(dataUrl: string): Buffer | null {
  const match = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !match[1]) return null;
  try {
    return Buffer.from(match[1], "base64");
  } catch {
    return null;
  }
}

function getMinecraftProfileCachePath(): string {
  return path.join(getAppDataDir(), MINECRAFT_PROFILE_CACHE_FILE);
}

function loadMinecraftProfileCache(): Record<string, MinecraftProfileCacheEntry> {
  try {
    const cachePath = getMinecraftProfileCachePath();
    if (!fs.existsSync(cachePath)) return {};
    const raw = fs.readFileSync(cachePath, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveMinecraftProfileCache(
  cache: Record<string, MinecraftProfileCacheEntry>,
): void {
  try {
    const cachePath = getMinecraftProfileCachePath();
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(cache));
  } catch {}
}

function getMinecraftProfileCacheKey(session: {
  type: string;
  uuid: string;
}): string {
  return `${session.type}:${session.uuid}`;
}

function getCachedMinecraftProfile(
  sessionKey: string,
): MinecraftProfileCacheEntry | null {
  const cache = loadMinecraftProfileCache();
  const entry = cache[sessionKey];
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > MINECRAFT_PROFILE_CACHE_TTL_MS) {
    delete cache[sessionKey];
    saveMinecraftProfileCache(cache);
    return null;
  }
  return entry;
}

function setCachedMinecraftProfile(sessionKey: string, profile: any): void {
  const cache = loadMinecraftProfileCache();
  cache[sessionKey] = {
    fetchedAt: Date.now(),
    profile,
  };
  saveMinecraftProfileCache(cache);
}

async function fetchMinecraftProfile(
  accessToken: string,
): Promise<{ ok: boolean; profile?: any; error?: string }> {
  const profileResponse = await fetch(
    "https://api.minecraftservices.com/minecraft/profile",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
  );

  if (!profileResponse.ok) {
    let errorText = `Minecraft profile error (${profileResponse.status})`;
    try {
      const errorData = await profileResponse.json();
      errorText = errorData?.errorMessage || errorData?.error || errorText;
    } catch {}
    return { ok: false, error: errorText };
  }

  const profileData = await profileResponse.json();
  const activeSkin =
    profileData?.skins?.find((skin: any) => skin?.state === "ACTIVE") ||
    profileData?.skins?.[0] ||
    null;

  return {
    ok: true,
    profile: {
      id: profileData?.id,
      name: profileData?.name,
      skins: profileData?.skins || [],
      capes: profileData?.capes || [],
      activeSkin,
      skinUrl: activeSkin?.url || null,
      variant: (activeSkin?.variant || "CLASSIC").toLowerCase(),
    },
  };
}

export function registerUtilityHandlers(
  getMainWindow: () => BrowserWindow | null,
): void {
  /**
   * open-external - เปิด URL ในเบราว์เซอร์ภายนอก
   */
  ipcMain.handle(
    "open-external",
    async (_event, url: string): Promise<void> => {
      await shell.openExternal(url);
    },
  );

  /**
   * open-folder - เปิดโฟลเดอร์ใน File Explorer
   */
  ipcMain.handle(
    "open-folder",
    async (_event, folderPath: string): Promise<void> => {
      await shell.openPath(folderPath);
    },
  );

  /**
   * browse-java - เปิด dialog เลือกไฟล์ Java
   */
  ipcMain.handle("browse-java", async (): Promise<string | null> => {
    const win = BrowserWindow.getFocusedWindow() || getMainWindow();
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      title: "เลือกไฟล์ Java (java.exe หรือ javaw.exe)",
      filters: [
        { name: "Java Executable", extensions: ["exe"] },
        { name: "All Files", extensions: ["*"] },
      ],
      properties: ["openFile"],
    });

    return result.canceled ? null : result.filePaths[0] || null;
  });

  /**
   * browse-directory - เปิด dialog เลือกโฟลเดอร์
   */
  ipcMain.handle(
    "browse-directory",
    async (_event, title?: string): Promise<string | null> => {
      const win = BrowserWindow.getFocusedWindow() || getMainWindow();
      if (!win) return null;

      const result = await dialog.showOpenDialog(win, {
        title: title || "เลือกโฟลเดอร์",
        properties: ["openDirectory"],
      });

      return result.canceled ? null : result.filePaths[0] || null;
    },
  );

  /**
   * browse-modpack - เปิด dialog เลือกไฟล์ modpack
   */
  ipcMain.handle("browse-modpack", async (): Promise<string | null> => {
    const win = BrowserWindow.getFocusedWindow() || getMainWindow();
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      title: "เลือกไฟล์ Modpack",
      filters: [
        { name: "Modpack Files", extensions: ["mrpack", "zip"] },
        { name: "All Files", extensions: ["*"] },
      ],
      properties: ["openFile"],
    });

    return result.canceled ? null : result.filePaths[0] || null;
  });

  /**
   * browse-icon - เปิด dialog เลือกไฟล์รูปภาพ
   */
  ipcMain.handle("browse-icon", async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "gif", "webp", "ico"],
        },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    try {
      const filePath = result.filePaths[0];
      const fileData = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();

      const mimeTypes: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".ico": "image/x-icon",
      };

      const mimeType = mimeTypes[ext] || "image/png";
      return `data:${mimeType};base64,${fileData.toString("base64")}`;
    } catch {
      return null;
    }
  });

  /**
   * import-modpack - นำเข้า modpack จากไฟล์
   */
  ipcMain.handle("import-modpack", async (_event, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, name: "", error: "ไม่พบไฟล์" };
      }

      const filename = path.basename(filePath);
      const name = filename.replace(/\.(mrpack|zip)$/i, "");

      const minecraftDir = getMinecraftDir();
      const instancesDir = path.join(minecraftDir, "instances");
      const modpackDir = path.join(instancesDir, name);

      if (!fs.existsSync(modpackDir)) {
        await fs.promises.mkdir(modpackDir, { recursive: true });
      }

      const destPath = path.join(modpackDir, filename);
      fs.copyFileSync(filePath, destPath);

      return { success: true, name };
    } catch (error: any) {
      return { success: false, name: "", error: error.message };
    }
  });

  /**
   * auto-detect-java - ค้นหา Java อัตโนมัติ
   */
  ipcMain.handle("auto-detect-java", async (): Promise<string | null> => {
    const native = getNativeJavaModule();
    if (native && typeof native.detectJavaInstallations === "function") {
      try {
        const detection =
          native.detectJavaInstallations() as NativeJavaDetectionResult;
        const installations = normalizeJavaInstallations(detection);
        const preferredPaths = [
          detection?.recommended?.path,
          ...installations.map((install) => install.path),
        ].filter((candidate): candidate is string => !!candidate);

        for (const candidate of preferredPaths) {
          const isValid =
            typeof native.validateJavaPath === "function"
              ? !!native.validateJavaPath(candidate)
              : fs.existsSync(candidate);
          if (isValid && fs.existsSync(candidate)) {
            return candidate;
          }
        }
      } catch (error) {
        console.warn(
          "[Java] Native auto detect failed, falling back to JS path",
          error,
        );
      }
    }

    const { spawnSync } = await import("node:child_process");
    const findCommand = process.platform === "win32" ? "where" : "which";

    try {
      const result = spawnSync(findCommand, ["java"], {
        encoding: "utf-8",
        timeout: 5000,
        windowsHide: true,
      });
      if (result.error || result.status !== 0) {
        throw result.error || new Error(`Find java failed with code ${result.status}`);
      }
      const lines = (result.stdout || "")
        .trim()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length > 0 && lines[0] && fs.existsSync(lines[0])) {
        return lines[0];
      }
    } catch {}

    if (process.platform !== "win32") {
      return null;
    }

    const commonPaths = [
      "C:\\Program Files\\Java",
      "C:\\Program Files (x86)\\Java",
      "C:\\Program Files\\Eclipse Adoptium",
      "C:\\Program Files\\Zulu",
      "C:\\Program Files\\Microsoft",
    ];

    for (const basePath of commonPaths) {
      if (!fs.existsSync(basePath)) continue;
      try {
        const entries = await fs.promises.readdir(basePath);
        for (const entry of entries) {
          const javaExe = path.join(basePath, entry, "bin", "java.exe");
          if (fs.existsSync(javaExe)) return javaExe;
        }
      } catch {}
    }

    return null;
  });

  /**
   * detect-java-installations - ค้นหา Java installations ทั้งหมด
   */
  ipcMain.handle("detect-java-installations", async () => {
    const native = getNativeJavaModule();
    if (native && typeof native.detectJavaInstallations === "function") {
      try {
        const detection =
          native.detectJavaInstallations() as NativeJavaDetectionResult;
        const normalized = normalizeJavaInstallations(detection).map((install) => {
          const validated =
            typeof native.validateJavaPath === "function"
              ? native.validateJavaPath(install.path)
              : null;
          return {
            ...install,
            path: install.path,
            version: install.version || validated?.version || "Unknown",
            majorVersion:
              install.majorVersion || validated?.majorVersion || 0,
            vendor: install.vendor || validated?.vendor || "Unknown",
            is64Bit: install.is64Bit ?? validated?.is64Bit ?? false,
            isJdk: install.isJdk ?? validated?.isJdk ?? false,
            isValid: !!validated || fs.existsSync(install.path),
          };
        });

        if (normalized.length > 0) {
          normalized.sort((a, b) => b.majorVersion - a.majorVersion);
          return normalized;
        }
      } catch (error) {
        console.warn(
          "[Java] Native detect-java-installations failed, using JS fallback",
          error,
        );
      }
    }

    const installations: any[] = [];
    const foundPaths = new Set<string>();

    const parseJavaVersion = (output: string) => {
      try {
        const lines = output.split("\n");
        let version = "";
        let vendor: string | undefined;

        for (const line of lines) {
          const versionMatch = line.match(
            /(?:java|openjdk)\s+version\s+"([^"]+)"/i,
          );
          if (versionMatch) version = versionMatch[1];

          if (line.includes("Temurin") || line.includes("Adoptium"))
            vendor = "Eclipse Adoptium";
          else if (line.includes("Zulu")) vendor = "Azul Zulu";
          else if (line.includes("Microsoft")) vendor = "Microsoft";
          else if (line.includes("Oracle")) vendor = "Oracle";
          else if (line.includes("OpenJDK")) vendor = "OpenJDK";
        }

        if (!version) return null;

        let majorVersion = 0;
        if (version.startsWith("1.")) {
          const match = version.match(/^1\.(\d+)/);
          if (match) majorVersion = parseInt(match[1]);
        } else {
          const match = version.match(/^(\d+)/);
          if (match) majorVersion = parseInt(match[1]);
        }

        return { version, majorVersion, vendor };
      } catch {
        return null;
      }
    };

    // JS fallback: Add launcher's java directory to search paths
    const launcherJavaDir = path.join(getAppDataDir(), "java");
    const possiblePaths =
      process.platform === "win32"
        ? [
            launcherJavaDir,
            process.env.JAVA_HOME,
            process.env.JRE_HOME,
            "C:\\Program Files\\Java",
            "C:\\Program Files\\Eclipse Adoptium",
            "C:\\Program Files\\Zulu",
            "C:\\Program Files\\Microsoft\\jdk",
          ]
        : [
            launcherJavaDir,
            process.env.JAVA_HOME,
            process.env.JRE_HOME,
            "/usr/lib/jvm",
            "/Library/Java/JavaVirtualMachines",
          ];
    const javaBinaryName = process.platform === "win32" ? "java.exe" : "java";

    for (const basePath of possiblePaths.filter(Boolean) as string[]) {
      if (!fs.existsSync(basePath)) continue;

      const javaBin = path.join(basePath, "bin", javaBinaryName);
      if (fs.existsSync(javaBin)) {
        foundPaths.add(javaBin);
        continue;
      }

      try {
        const dirs = await fs.promises.readdir(basePath, { withFileTypes: true });
        for (const dir of dirs) {
          if (!dir.isDirectory()) continue;
          const javaPath = path.join(basePath, dir.name, "bin", javaBinaryName);
          if (fs.existsSync(javaPath)) foundPaths.add(javaPath);
          if (process.platform === "darwin") {
            const macJavaPath = path.join(
              basePath,
              dir.name,
              "Contents",
              "Home",
              "bin",
              javaBinaryName,
            );
            if (fs.existsSync(macJavaPath)) foundPaths.add(macJavaPath);
          }
        }
      } catch {}
    }

    for (const javaPath of foundPaths) {
      try {
        // Use spawnSync instead of execSync to prevent command injection
        const { spawnSync } = await import("node:child_process");
        const result = spawnSync(javaPath, ["-version"], {
          encoding: "utf-8",
          timeout: 5000,
          windowsHide: true,
        });
        const output = (result.stderr || "") + (result.stdout || "");
        const versionInfo = parseJavaVersion(output);
        if (versionInfo) {
          installations.push({ path: javaPath, ...versionInfo, isValid: true });
        } else {
          installations.push({
            path: javaPath,
            version: "ไม่ทราบ",
            majorVersion: 0,
            isValid: false,
          });
        }
      } catch (error: any) {
        installations.push({
          path: javaPath,
          version: "ไม่ทราบ",
          majorVersion: 0,
          isValid: false,
        });
      }
    }

    installations.sort((a, b) => b.majorVersion - a.majorVersion);
    return installations;
  });

  /**
   * test-java-execution - ทดสอบว่า Java path ใช้งานได้
   */
  ipcMain.handle("test-java-execution", async (_event, javaPath: string) => {
    const { spawnSync } = await import("node:child_process");
    const native = getNativeJavaModule();

    if (!fs.existsSync(javaPath)) {
      return { ok: false, error: "��辺��� Java" };
    }

    if (native && typeof native.validateJavaPath === "function") {
      try {
        const validated = native.validateJavaPath(javaPath);
        if (validated) {
          return {
            ok: true,
            output: `Detected ${validated.version || "Java"} (${validated.vendor || "Unknown"})`,
            version: validated.version,
          };
        }
      } catch {}
    }
    try {
      // Use spawnSync instead of execSync to prevent command injection
      const result = spawnSync(javaPath, ["-version"], {
        encoding: "utf-8",
        timeout: 10000,
        windowsHide: true,
      });

      const output = ((result.stderr || "") + (result.stdout || "")).trim();

      if (output.includes("version")) {
        const versionMatch = output.match(
          /(?:java|openjdk)\s+version\s+"([^"]+)"/i,
        );
        return { ok: true, output, version: versionMatch?.[1] };
      } else if (result.status !== 0 && result.status !== null) {
        return { ok: false, error: `Java exit code: ${result.status}`, output };
      }
      return { ok: true, output };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  /**
   * install-java - ดาวน์โหลดและติดตั้ง Java (with progress events)
   */
  ipcMain.handle("install-java", async (_event, majorVersion: number) => {
    const https = await import("node:https");
    const { createWriteStream } = await import("node:fs");
    const { spawn } = await import("node:child_process");
    const native = getNativeModule() as any;

    console.log(`[Java] Starting installation of Java ${majorVersion}`);

    // Helper to send progress to renderer
    const sendProgress = (phase: string, percent: number, message: string) => {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send("java-install-progress", {
          majorVersion,
          phase,
          percent,
          message,
        });
      }
    };

    try {
      const featureVersion = majorVersion;

      const javaBaseDir = path.join(getAppDataDir(), "java");
      if (!fs.existsSync(javaBaseDir)) {
        await fs.promises.mkdir(javaBaseDir, { recursive: true });
      }

      const existingJava = path.join(
        javaBaseDir,
        `jdk-${majorVersion}`,
        "bin",
        "java.exe",
      );
      if (fs.existsSync(existingJava)) {
        console.log(
          `[Java] Java ${majorVersion} already exists at ${existingJava}`,
        );
        return { ok: true, path: existingJava };
      }

      if (typeof native.installJavaRuntime === "function") {
        try {
          sendProgress("fetch", 10, "Preparing Java installation...");
          const installedPath = (await native.installJavaRuntime(
            majorVersion,
            javaBaseDir,
          )) as string;
          sendProgress("complete", 100, "Java installation complete");
          return { ok: true, path: installedPath };
        } catch (nativeInstallError: any) {
          console.warn("[Java] Native installJavaRuntime failed, fallback to JS:", nativeInstallError?.message || nativeInstallError);
        }
      }

      sendProgress("fetch", 0, "กำลังดึงข้อมูล...");
      console.log(
        `[Java] Fetching Azul Zulu metadata for Java ${featureVersion}...`,
      );

      const azulOs =
        process.platform === "win32"
          ? "windows"
          : process.platform === "darwin"
            ? "macos"
            : "linux";
      const azulArch =
        process.arch === "arm64"
          ? "aarch64"
          : process.arch === "ia32"
            ? "x86"
            : "x64";
      const azulQuery = new URLSearchParams({
        java_version: `${featureVersion}`,
        os: azulOs,
        arch: azulArch,
        archive_type: "zip",
        java_package_type: "jdk",
        javafx_bundled: "false",
        release_status: "ga",
        latest: "true",
        page: "1",
        page_size: "100",
      });
      const apiUrl = `https://api.azul.com/metadata/v1/zulu/packages/?${azulQuery.toString()}`;
      const apiResponse = await new Promise<any>((resolve, reject) => {
        https
          .get(apiUrl, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
              try {
                resolve(JSON.parse(data));
              } catch (e) {
                reject(
                  new Error(`Invalid API response: ${data.substring(0, 200)}`),
                );
              }
            });
          })
          .on("error", reject);
      });

      const zuluPackage = Array.isArray(apiResponse)
        ? (apiResponse.find((entry: any) => entry?.latest && entry?.download_url) ??
            apiResponse.find((entry: any) => entry?.download_url))
        : null;
      if (!zuluPackage) {
        console.log(
          `[Java] No Java ${majorVersion} found in Azul Zulu metadata`,
        );
        return {
          ok: false,
          error: `Java ${majorVersion} not found from Azul Zulu`,
        };
      }

      const downloadUrl = zuluPackage.download_url;
      const fileName =
        zuluPackage.name ||
        (typeof downloadUrl === "string"
          ? downloadUrl.split("/").pop()?.split("?")[0]
          : undefined);
      const fileSize =
        zuluPackage.size ||
        zuluPackage.download_size ||
        zuluPackage.filesize ||
        0;
      if (!downloadUrl || !fileName)
        return { ok: false, error: "ไม่พบ download URL" };

      const fileSizeMB = Math.round(fileSize / 1024 / 1024);
      sendProgress(
        "download",
        0,
        `กำลังดาวน์โหลด ${fileName} (${fileSizeMB}MB)...`,
      );
      console.log(`[Java] Downloading ${fileName} (${fileSizeMB}MB)...`);
      const zipPath = path.join(javaBaseDir, fileName);

      if (typeof native.downloadFile === "function") {
        sendProgress("download", 25, "Downloading with native core...");
        const nativeResult = (await native.downloadFile(
          downloadUrl,
          zipPath,
          undefined,
          undefined,
        )) as { success?: boolean; error?: string };
        if (!nativeResult?.success) {
          throw new Error(nativeResult?.error || "Native Java download failed");
        }
        sendProgress("download", 100, "Download complete");
      } else {
        await new Promise<void>((resolve, reject) => {
          const download = (url: string) => {
            https
              .get(url, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                  if (res.headers.location) download(res.headers.location);
                  return;
                }
                if (res.statusCode !== 200) {
                  reject(new Error(`HTTP ${res.statusCode}`));
                  return;
                }
                const file = createWriteStream(zipPath);
                let downloaded = 0;
                const total =
                  parseInt(res.headers["content-length"] || "0", 10) ||
                  fileSize;

                res.on("data", (chunk) => {
                  downloaded += chunk.length;
                  const percent =
                    total > 0 ? Math.round((downloaded / total) * 100) : 0;
                  if (percent % 5 === 0 || downloaded === total) {
                    const downloadedMB = Math.round(downloaded / 1024 / 1024);
                    const totalMB = Math.round(total / 1024 / 1024);
                    sendProgress(
                      "download",
                      percent,
                      `Downloading ${downloadedMB}/${totalMB} MB (${percent}%)`,
                    );
                  }
                });

                res.pipe(file);
                file.on("finish", () => {
                  file.close();
                  console.log(`[Java] Download complete: ${zipPath}`);
                  resolve();
                });
              })
              .on("error", reject);
          };
          download(downloadUrl);
        });
      }

      const extractDir = path.join(javaBaseDir, `temp-${majorVersion}`);
      sendProgress("extract", 0, "กำลังแตกไฟล์...");
      console.log(`[Java] Extracting to ${extractDir}...`);
      if (fs.existsSync(extractDir)) await fs.promises.rm(extractDir, { recursive: true });
      await fs.promises.mkdir(extractDir, { recursive: true });

      const toSignedExitCode = (code: number | null): number | null => {
        if (code === null) return null;
        return code > 0x7fffffff ? code - 0x100000000 : code;
      };

      const runExtractAttempt = (
        label: string,
        command: string,
        args: string[],
      ): Promise<void> => {
        return new Promise<void>((resolve, reject) => {
          let stderr = "";
          let stdout = "";
          const child = spawn(command, args, {
            windowsHide: true,
          });

          child.stdout?.on("data", (chunk) => {
            stdout += chunk.toString();
          });

          child.stderr?.on("data", (chunk) => {
            stderr += chunk.toString();
          });

          child.on("close", (code) => {
            if (code === 0) {
              resolve();
              return;
            }

            const signedCode = toSignedExitCode(code);
            const codeText =
              signedCode !== null && signedCode !== code
                ? `${code} (signed ${signedCode})`
                : `${code}`;
            const detail = [stderr.trim(), stdout.trim()]
              .filter(Boolean)
              .join("\n");
            reject(
              new Error(
                `${label} failed with code ${codeText}${detail ? `: ${detail}` : ""}`,
              ),
            );
          });

          child.on("error", (err) => {
            reject(new Error(`${label} spawn error: ${err.message}`));
          });
        });
      };

      let extractedByNative = false;
      if (typeof native.extractZipAsync === "function" || typeof native.extractZip === "function") {
        try {
          const nativeExtract =
            typeof native.extractZipAsync === "function"
              ? await native.extractZipAsync(zipPath, extractDir, undefined)
              : await native.extractZip(zipPath, extractDir, undefined);
          if (nativeExtract?.success === false) {
            throw new Error(nativeExtract?.error || "Native extract returned unsuccessful result");
          }
          extractedByNative = true;
          sendProgress("extract", 100, "Extraction complete");
        } catch (nativeExtractError: any) {
          console.warn("[Java] Native extract failed, fallback to shell tools:", nativeExtractError?.message || nativeExtractError);
          if (fs.existsSync(extractDir))
            await fs.promises.rm(extractDir, { recursive: true, force: true });
          await fs.promises.mkdir(extractDir, { recursive: true });
        }
      }

      if (!extractedByNative) {
      const psZipPath = zipPath.replace(/'/g, "''");
      const psExtractDir = extractDir.replace(/'/g, "''");
      const extractAttempts = [
        {
          label: "PowerShell Expand-Archive",
          command: "powershell",
          args: [
            "-NoProfile",
            "-Command",
            `$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath '${psZipPath}' -DestinationPath '${psExtractDir}' -Force`,
          ],
        },
        {
          label: "PowerShell ZipFile",
          command: "powershell",
          args: [
            "-NoProfile",
            "-Command",
            `$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${psZipPath}', '${psExtractDir}', $true)`,
          ],
        },
        {
          label: "tar",
          command: "tar",
          args: ["-xf", zipPath, "-C", extractDir],
        },
      ] as const;

      // Update progress periodically during extraction
      let extractPercent = 0;
      const progressInterval = setInterval(() => {
        extractPercent = Math.min(extractPercent + 10, 90);
        sendProgress(
          "extract",
          extractPercent,
          `Extracting files... ${extractPercent}%`,
        );
      }, 1000);

      try {
        let extracted = false;
        let lastError: Error | null = null;

        for (const attempt of extractAttempts) {
          try {
            console.log(`[Java] Extract attempt: ${attempt.label}`);
            await runExtractAttempt(attempt.label, attempt.command, [
              ...attempt.args,
            ]);
            extracted = true;
            break;
          } catch (error: any) {
            lastError =
              error instanceof Error ? error : new Error(String(error));
            console.warn(
              `[Java] ${attempt.label} failed: ${lastError.message}`,
            );
            if (fs.existsSync(extractDir))
              await fs.promises.rm(extractDir, { recursive: true, force: true });
            await fs.promises.mkdir(extractDir, { recursive: true });
          }
        }

        if (!extracted) {
          throw lastError || new Error("Extract failed");
        }

        sendProgress("extract", 100, "Extraction complete");
      } finally {
        clearInterval(progressInterval);
      }


      }
      await fs.promises.unlink(zipPath);

      const extractedDirs = await fs.promises.readdir(extractDir);
      if (extractedDirs.length === 0) {
        console.log(`[Java] No directories found after extract`);
        return { ok: false, error: "Extract failed - no directories" };
      }

      sendProgress("install", 90, "กำลังติดตั้ง...");
      const sourcePath = path.join(extractDir, extractedDirs[0]);
      const targetPath = path.join(javaBaseDir, `jdk-${majorVersion}`);

      if (fs.existsSync(targetPath)) await fs.promises.rm(targetPath, { recursive: true });
      await fs.promises.rename(sourcePath, targetPath);
      await fs.promises.rm(extractDir, { recursive: true });

      const javaExePath = path.join(targetPath, "bin", "java.exe");
      if (!fs.existsSync(javaExePath))
        return { ok: false, error: "ไม่พบ java.exe" };

      const currentConfig = getConfig();
      const updatedJavaPaths = { ...currentConfig.javaPaths };
      if (majorVersion === 8) updatedJavaPaths.java8 = javaExePath;
      else if (majorVersion >= 17 && majorVersion < 21) updatedJavaPaths.java17 = javaExePath;
      else if (majorVersion >= 21 && majorVersion < 25) updatedJavaPaths.java21 = javaExePath;
      else if (majorVersion >= 25) updatedJavaPaths.java25 = javaExePath;
      
      setConfig({ javaPaths: updatedJavaPaths });

      sendProgress("complete", 100, "ติดตั้งสำเร็จ!");
      return { ok: true, path: javaExePath };
    } catch (error: any) {
      sendProgress("error", 0, error.message);
      return { ok: false, error: error.message };
    }
  });

  /**
   * delete-java - ลบ Java ที่ติดตั้งโดย launcher
   */
  ipcMain.handle("delete-java", async (_event, majorVersion: number) => {
    try {
      const javaBaseDir = path.join(getAppDataDir(), "java");
      const javaDir = path.join(javaBaseDir, `jdk-${majorVersion}`);

      if (!fs.existsSync(javaDir)) {
        return { ok: true, message: `ไม่พบ Java ${majorVersion}` };
      }

      await fs.promises.rm(javaDir, { recursive: true, force: true });
      
      const currentConfig = getConfig();
      if (currentConfig.javaPaths) {
         const updatedJavaPaths = { ...currentConfig.javaPaths };
         let changed = false;
         if (majorVersion === 8 && updatedJavaPaths.java8?.includes(`jdk-${majorVersion}`)) { delete updatedJavaPaths.java8; changed = true; }
         else if (majorVersion >= 17 && majorVersion < 21 && updatedJavaPaths.java17?.includes(`jdk-${majorVersion}`)) { delete updatedJavaPaths.java17; changed = true; }
         else if (majorVersion >= 21 && majorVersion < 25 && updatedJavaPaths.java21?.includes(`jdk-${majorVersion}`)) { delete updatedJavaPaths.java21; changed = true; }
         else if (majorVersion >= 25 && updatedJavaPaths.java25?.includes(`jdk-${majorVersion}`)) { delete updatedJavaPaths.java25; changed = true; }
         
         if (changed) setConfig({ javaPaths: updatedJavaPaths });
      }

      return { ok: true, message: `ลบ Java ${majorVersion} สำเร็จ` };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle(
    "minecraft-get-profile",
    async (_event, options?: { forceRefresh?: boolean }) => {
      try {
        const session = getSession();
        if (!session || session.type !== "microsoft") {
          return { ok: false, error: "Microsoft account is required." };
        }

        const forceRefresh = !!options?.forceRefresh;
        const sessionKey = getMinecraftProfileCacheKey(session);
        if (!forceRefresh) {
          const cachedProfile = getCachedMinecraftProfile(sessionKey);
          if (cachedProfile) {
            return { ok: true, profile: cachedProfile.profile };
          }
        }

        const refreshResult = await refreshMicrosoftTokenIfNeeded();
        if (!refreshResult.ok) {
          return {
            ok: false,
            error: refreshResult.error || "Could not refresh Microsoft token.",
            requiresRelogin: refreshResult.requiresRelogin || false,
          };
        }

        const accessToken =
          refreshResult.session?.accessToken || session.accessToken;
        if (!accessToken) {
          return { ok: false, error: "Microsoft access token not found." };
        }

        const profileResult = await fetchMinecraftProfile(accessToken);
        if (profileResult.ok && profileResult.profile) {
          setCachedMinecraftProfile(sessionKey, profileResult.profile);
        }
        return profileResult;
      } catch (error: any) {
        return {
          ok: false,
          error: error?.message || "Failed to load Minecraft profile.",
        };
      }
    },
  );
  ipcMain.handle(
    "minecraft-upload-skin",
    async (
      _event,
      payload: { dataUrl: string; variant?: SkinVariant; fileName?: string },
    ) => {
      try {
        const session = getSession();
        if (!session || session.type !== "microsoft") {
          return { ok: false, error: "Microsoft account is required." };
        }

        const refreshResult = await refreshMicrosoftTokenIfNeeded();
        if (!refreshResult.ok) {
          return {
            ok: false,
            error: refreshResult.error || "Could not refresh Microsoft token.",
            requiresRelogin: refreshResult.requiresRelogin || false,
          };
        }

        const accessToken =
          refreshResult.session?.accessToken || session.accessToken;
        if (!accessToken) {
          return { ok: false, error: "Microsoft access token not found." };
        }

        const skinData = parsePngDataUrl(payload.dataUrl || "");
        if (!skinData) {
          return {
            ok: false,
            error: "Invalid skin file. Please use PNG format.",
          };
        }

        const variant: SkinVariant =
          payload.variant === "slim" ? "slim" : "classic";
        const skinBytes = Uint8Array.from(skinData);
        const form = new FormData();
        form.append("variant", variant);
        form.append(
          "file",
          new Blob([skinBytes], { type: "image/png" }),
          payload.fileName || "skin.png",
        );

        const uploadResponse = await fetch(
          "https://api.minecraftservices.com/minecraft/profile/skins",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            body: form,
          },
        );

        if (!uploadResponse.ok) {
          let errorText = `Skin upload failed (${uploadResponse.status})`;
          try {
            const errorData = await uploadResponse.json();
            errorText =
              errorData?.errorMessage || errorData?.error || errorText;
          } catch {}
          return { ok: false, error: errorText };
        }

        const profileResult = await fetchMinecraftProfile(accessToken);
        if (!profileResult.ok) {
          return profileResult;
        }

        setCachedMinecraftProfile(
          getMinecraftProfileCacheKey(session),
          profileResult.profile,
        );

        return {
          ok: true,
          profile: profileResult.profile,
          message: "Skin updated successfully.",
        };
      } catch (error: any) {
        return { ok: false, error: error?.message || "Failed to upload skin." };
      }
    },
  );

  console.log("[IPC] Utility handlers registered");
}
