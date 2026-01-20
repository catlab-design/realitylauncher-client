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
import { getMinecraftDir, getAppDataDir } from "../config.js";

export function registerUtilityHandlers(getMainWindow: () => BrowserWindow | null): void {
    /**
     * open-external - เปิด URL ในเบราว์เซอร์ภายนอก
     */
    ipcMain.handle("open-external", async (_event, url: string): Promise<void> => {
        await shell.openExternal(url);
    });

    /**
     * open-folder - เปิดโฟลเดอร์ใน File Explorer
     */
    ipcMain.handle("open-folder", async (_event, folderPath: string): Promise<void> => {
        await shell.openPath(folderPath);
    });

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
    ipcMain.handle("browse-directory", async (_event, title?: string): Promise<string | null> => {
        const win = BrowserWindow.getFocusedWindow() || getMainWindow();
        if (!win) return null;

        const result = await dialog.showOpenDialog(win, {
            title: title || "เลือกโฟลเดอร์",
            properties: ["openDirectory"],
        });

        return result.canceled ? null : result.filePaths[0] || null;
    });

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
                { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "ico"] }
            ]
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
                ".ico": "image/x-icon"
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
                fs.mkdirSync(modpackDir, { recursive: true });
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
        const { execSync } = await import("node:child_process");

        try {
            const result = execSync("where java", { encoding: "utf-8", timeout: 5000 });
            const lines = result.trim().split("\n");
            if (lines.length > 0 && lines[0] && fs.existsSync(lines[0].trim())) {
                return lines[0].trim();
            }
        } catch { }

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
                const entries = fs.readdirSync(basePath);
                for (const entry of entries) {
                    const javaExe = path.join(basePath, entry, "bin", "java.exe");
                    if (fs.existsSync(javaExe)) return javaExe;
                }
            } catch { }
        }

        return null;
    });

    /**
     * detect-java-installations - ค้นหา Java installations ทั้งหมด
     */
    ipcMain.handle("detect-java-installations", async () => {
        const { execSync } = await import("node:child_process");
        const installations: any[] = [];
        const foundPaths = new Set<string>();

        const parseJavaVersion = (output: string) => {
            try {
                const lines = output.split("\n");
                let version = "";
                let vendor: string | undefined;

                for (const line of lines) {
                    const versionMatch = line.match(/(?:java|openjdk)\s+version\s+"([^"]+)"/i);
                    if (versionMatch) version = versionMatch[1];

                    if (line.includes("Temurin") || line.includes("Adoptium")) vendor = "Eclipse Adoptium";
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

        // Add launcher's java directory to search paths
        const launcherJavaDir = path.join(getAppDataDir(), "java");
        const possiblePaths = [
            launcherJavaDir,
            process.env.JAVA_HOME,
            process.env.JRE_HOME,
            "C:\\Program Files\\Java",
            "C:\\Program Files\\Eclipse Adoptium",
            "C:\\Program Files\\Zulu",
            "C:\\Program Files\\Microsoft\\jdk",
        ].filter(Boolean) as string[];

        for (const basePath of possiblePaths) {
            if (!fs.existsSync(basePath)) continue;

            const javaBin = path.join(basePath, "bin", "java.exe");
            if (fs.existsSync(javaBin)) {
                foundPaths.add(javaBin);
                continue;
            }

            try {
                const dirs = fs.readdirSync(basePath, { withFileTypes: true });
                for (const dir of dirs) {
                    if (!dir.isDirectory()) continue;
                    const javaPath = path.join(basePath, dir.name, "bin", "java.exe");
                    if (fs.existsSync(javaPath)) foundPaths.add(javaPath);
                }
            } catch { }
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
                    installations.push({ path: javaPath, version: "ไม่ทราบ", majorVersion: 0, isValid: false });
                }
            } catch (error: any) {
                installations.push({ path: javaPath, version: "ไม่ทราบ", majorVersion: 0, isValid: false });
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

        if (!fs.existsSync(javaPath)) {
            return { ok: false, error: "ไม่พบไฟล์ Java" };
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
                const versionMatch = output.match(/(?:java|openjdk)\s+version\s+"([^"]+)"/i);
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

        console.log(`[Java] Starting installation of Java ${majorVersion}`);

        // Helper to send progress to renderer
        const sendProgress = (phase: string, percent: number, message: string) => {
            const mainWindow = getMainWindow();
            if (mainWindow) {
                mainWindow.webContents.send("java-install-progress", {
                    majorVersion,
                    phase,
                    percent,
                    message
                });
            }
        };

        try {
            const featureVersion = majorVersion;

            const javaBaseDir = path.join(getAppDataDir(), "java");
            if (!fs.existsSync(javaBaseDir)) {
                fs.mkdirSync(javaBaseDir, { recursive: true });
            }

            const existingJava = path.join(javaBaseDir, `jdk-${majorVersion}`, "bin", "java.exe");
            if (fs.existsSync(existingJava)) {
                console.log(`[Java] Java ${majorVersion} already exists at ${existingJava}`);
                return { ok: true, path: existingJava };
            }

            sendProgress("fetch", 0, "กำลังดึงข้อมูล...");
            console.log(`[Java] Fetching Adoptium API for Java ${featureVersion}...`);
            const apiUrl = `https://api.adoptium.net/v3/assets/latest/${featureVersion}/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse`;
            const apiResponse = await new Promise<any>((resolve, reject) => {
                https.get(apiUrl, (res) => {
                    let data = "";
                    res.on("data", (chunk) => data += chunk);
                    res.on("end", () => {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            reject(new Error(`Invalid API response: ${data.substring(0, 200)}`));
                        }
                    });
                }).on("error", reject);
            });

            if (!apiResponse?.[0]) {
                console.log(`[Java] No Java ${majorVersion} found in Adoptium API`);
                return { ok: false, error: `ไม่พบ Java ${majorVersion} จาก Adoptium` };
            }

            const downloadUrl = apiResponse[0].binary?.package?.link;
            const fileName = apiResponse[0].binary?.package?.name;
            const fileSize = apiResponse[0].binary?.package?.size || 0;
            if (!downloadUrl || !fileName) return { ok: false, error: "ไม่พบ download URL" };

            const fileSizeMB = Math.round(fileSize / 1024 / 1024);
            sendProgress("download", 0, `กำลังดาวน์โหลด ${fileName} (${fileSizeMB}MB)...`);
            console.log(`[Java] Downloading ${fileName} (${fileSizeMB}MB)...`);
            const zipPath = path.join(javaBaseDir, fileName);

            await new Promise<void>((resolve, reject) => {
                const download = (url: string) => {
                    https.get(url, (res) => {
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
                        const total = parseInt(res.headers['content-length'] || '0', 10) || fileSize;

                        res.on('data', (chunk) => {
                            downloaded += chunk.length;
                            const percent = total > 0 ? Math.round(downloaded / total * 100) : 0;
                            // Send progress every 5%
                            if (percent % 5 === 0 || downloaded === total) {
                                const downloadedMB = Math.round(downloaded / 1024 / 1024);
                                const totalMB = Math.round(total / 1024 / 1024);
                                sendProgress("download", percent, `ดาวน์โหลด ${downloadedMB}/${totalMB} MB (${percent}%)`);
                            }
                        });

                        res.pipe(file);
                        file.on("finish", () => {
                            file.close();
                            console.log(`[Java] Download complete: ${zipPath}`);
                            resolve();
                        });
                    }).on("error", reject);
                };
                download(downloadUrl);
            });

            const extractDir = path.join(javaBaseDir, `temp-${majorVersion}`);
            sendProgress("extract", 0, "กำลังแตกไฟล์...");
            console.log(`[Java] Extracting to ${extractDir}...`);
            if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
            fs.mkdirSync(extractDir, { recursive: true });

            // Use async spawn instead of spawnSync to prevent UI freeze
            await new Promise<void>((resolve, reject) => {
                const child = spawn("powershell", [
                    "-NoProfile",
                    "-Command",
                    `Expand-Archive -Path "${zipPath}" -DestinationPath "${extractDir}" -Force`
                ], {
                    windowsHide: true,
                });

                // Update progress periodically during extraction
                let extractPercent = 0;
                const progressInterval = setInterval(() => {
                    extractPercent = Math.min(extractPercent + 10, 90);
                    sendProgress("extract", extractPercent, `กำลังแตกไฟล์... ${extractPercent}%`);
                }, 1000);

                child.on("close", (code) => {
                    clearInterval(progressInterval);
                    if (code === 0) {
                        sendProgress("extract", 100, "แตกไฟล์เสร็จสิ้น");
                        resolve();
                    } else {
                        reject(new Error(`Extract failed with code ${code}`));
                    }
                });

                child.on("error", (err) => {
                    clearInterval(progressInterval);
                    reject(err);
                });
            });

            fs.unlinkSync(zipPath);

            const extractedDirs = fs.readdirSync(extractDir);
            if (extractedDirs.length === 0) {
                console.log(`[Java] No directories found after extract`);
                return { ok: false, error: "Extract failed - no directories" };
            }

            sendProgress("install", 90, "กำลังติดตั้ง...");
            const sourcePath = path.join(extractDir, extractedDirs[0]);
            const targetPath = path.join(javaBaseDir, `jdk-${majorVersion}`);

            if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { recursive: true });
            fs.renameSync(sourcePath, targetPath);
            fs.rmSync(extractDir, { recursive: true });

            const javaExePath = path.join(targetPath, "bin", "java.exe");
            if (!fs.existsSync(javaExePath)) return { ok: false, error: "ไม่พบ java.exe" };

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

            fs.rmSync(javaDir, { recursive: true, force: true });
            return { ok: true, message: `ลบ Java ${majorVersion} สำเร็จ` };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    console.log("[IPC] Utility handlers registered");
}
