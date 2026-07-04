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
import crypto from "node:crypto";
import { getMinecraftDir, getAppDataDir } from "../config.js";
import { getSession } from "../auth.js";
import { refreshMicrosoftTokenIfNeeded } from "../auth-refresh.js";
import { API_URL } from "../lib/constants.js";

const ML_API_URL = process.env.ML_API_URL || API_URL;

function getCatSkinCloudUrl(gameDirectory?: string): string {
  const defaultUrl = "https://storage-api.catskin.space";
  try {
    const baseDir = gameDirectory || getMinecraftDir();
    const configPath = path.join(baseDir, "config", "catskinc.json");
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw);
      let ip = parsed?.catskinCloudIp;
      if (ip && typeof ip === "string") {
        ip = ip.trim();
        if (!ip.startsWith("http://") && !ip.startsWith("https://")) {
          if (ip.startsWith("localhost") || ip.startsWith("127.0.0.1")) {
            return `http://${ip}`;
          } else {
            return `https://${ip}`;
          }
        }
        return ip;
      }
    }
  } catch (e) {
    console.error("[CatSkinC] Failed to read catskinc config:", e);
  }
  return defaultUrl;
}

async function fetchUrlAsDataUrl(url: string, headers: Record<string, string>): Promise<string | undefined> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
    });
    if (!response.ok) {
      console.error(`[CatSkinC] Failed to fetch asset ${url}: ${response.status}`);
      return undefined;
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch (err) {
    console.error(`[CatSkinC] Error fetching asset ${url}:`, err);
    return undefined;
  }
}

function getFormattedMinecraftUuid(session: { uuid: string; minecraftUuid?: string }): string {
  const targetUuid = session.minecraftUuid || session.uuid;
  if (!targetUuid) return "";
  const cleaned = targetUuid.trim().toLowerCase();
  if (cleaned.length === 32 && !cleaned.includes("-")) {
    return `${cleaned.slice(0, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(12, 16)}-${cleaned.slice(16, 20)}-${cleaned.slice(20)}`;
  }
  return cleaned;
}

function appendHashField(output: Buffer[], name: string, value: Buffer) {
  output.push(Buffer.from(name, "utf-8"));
  output.push(Buffer.from(":", "utf-8"));
  output.push(Buffer.from(value.length.toString(), "utf-8"));
  output.push(Buffer.from("\n", "utf-8"));
  output.push(value);
  output.push(Buffer.from("\n", "utf-8"));
}

function computeUploadContentHash(
  uuid: string | null,
  slim: boolean,
  skinBytes: Buffer,
  mouthOpenBytes: Buffer | null,
): string {
  const parts: Buffer[] = [];
  appendHashField(parts, "uuid", Buffer.from(uuid || "", "utf-8"));
  appendHashField(parts, "slim", Buffer.from(slim ? "true" : "false", "utf-8"));
  appendHashField(parts, "file", skinBytes);
  appendHashField(parts, "mouth_open", mouthOpenBytes || Buffer.alloc(0));
  appendHashField(parts, "mouth_close", Buffer.alloc(0));
  const combined = Buffer.concat(parts);
  return crypto.createHash("sha256").update(combined).digest("hex");
}

type SkinVariant = "classic" | "slim";
type MinecraftProfileCacheEntry = {
  fetchedAt: number;
  profile: any;
};

const MINECRAFT_PROFILE_CACHE_TTL_MS = 10 * 60 * 1000;
const MINECRAFT_PROFILE_CACHE_FILE = "minecraft-profile-cache.json";

function parsePngDataUrl(dataUrl: string): Buffer | null {
  const match = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !match[1]) return null;
  try {
    return Buffer.from(match[1], "base64");
  } catch {
    return null;
  }
}

function parseSafeExternalUrl(url: string): string | null {
  if (typeof url !== "string" || url.trim().length === 0) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.toString();
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
   * open-external - open a URL in the external browser
   */
  ipcMain.handle(
    "open-external",
    async (_event, url: string): Promise<void> => {
      const safeUrl = parseSafeExternalUrl(url);
      if (!safeUrl) {
        throw new Error("Only http/https URLs are allowed.");
      }
      await shell.openExternal(safeUrl);
    },
  );

  /**
   * open-folder - open a folder in the system file manager
   */
  ipcMain.handle(
    "open-folder",
    async (_event, folderPath: string): Promise<void> => {
      await shell.openPath(folderPath);
    },
  );

  /**
   * browse-directory - open a folder picker dialog
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
   * browse-modpack - open a dialog to pick a modpack file
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
   * browse-icon - open a dialog to pick an image file
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
   * import-modpack - import a modpack from a file
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


  ipcMain.handle(
    "minecraft-get-profile",
    async (_event, options?: { forceRefresh?: boolean }) => {
      try {
        const session = getSession();
        if (!session) {
          return { ok: false, error: "Not logged in" };
        }

        // If Microsoft-only session, use standard direct Mojang API profile fetch
        if (session.type === "microsoft") {
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
        }

        // If CatID session but linked to Microsoft (it has minecraftUuid)
        if (session.type === "catid" && session.minecraftUuid) {
          const forceRefresh = !!options?.forceRefresh;
          const sessionKey = `catid-ms-${session.minecraftUuid}`;
          if (!forceRefresh) {
            const cachedProfile = getCachedMinecraftProfile(sessionKey);
            if (cachedProfile) {
              return { ok: true, profile: cachedProfile.profile };
            }
          }

          const apiToken = session.accessToken; // CatID API token
          
          const profileResponse = await fetch(`${ML_API_URL}/profile/${session.minecraftUuid}`, {
            headers: {
              ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
            }
          });

          if (!profileResponse.ok) {
            return { ok: false, error: `Failed to fetch profile: ${profileResponse.statusText}` };
          }

          const result = await profileResponse.json() as any;
          if (result.ok && result.profile) {
            // Map response format to match what Wardrobe expects
            const activeSkin =
              result.profile.skins?.find((skin: any) => skin?.state === "ACTIVE") ||
              result.profile.skins?.[0] ||
              null;
            
            const profile = {
              id: result.profile.id,
              name: result.profile.name,
              skins: result.profile.skins || [],
              capes: result.profile.capes || [],
              activeSkin,
              skinUrl: activeSkin?.url || null,
              variant: (activeSkin?.variant || "CLASSIC").toLowerCase(),
            };

            setCachedMinecraftProfile(sessionKey, profile);
            return { ok: true, profile };
          }

          return { ok: false, error: "Invalid profile data from server." };
        }

        return { ok: false, error: "Microsoft account is required." };
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
        if (!session) {
          return { ok: false, error: "Not logged in" };
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

        // If CatID session but linked to Microsoft (it has minecraftUuid)
        if (session.type === "catid" && session.minecraftUuid) {
          const apiToken = session.accessToken; // CatID API token
          const form = new FormData();
          form.append("variant", variant);
          form.append(
            "file",
            new Blob([skinBytes], { type: "image/png" }),
            payload.fileName || "skin.png",
          );

          const uploadResponse = await fetch(`${ML_API_URL}/profile/skin`, {
            method: "POST",
            headers: {
              ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
            },
            body: form,
          });

          if (!uploadResponse.ok) {
            let errorText = `Skin upload failed (${uploadResponse.status})`;
            try {
              const errorData = await uploadResponse.json() as any;
              errorText = errorData?.error || errorText;
            } catch {}
            return { ok: false, error: errorText };
          }

          const result = await uploadResponse.json() as any;
          if (result.ok) {
            // Re-fetch profile to get the updated skin
            const sessionKey = `catid-ms-${session.minecraftUuid}`;
            
            const cache = loadMinecraftProfileCache();
            delete cache[sessionKey];
            saveMinecraftProfileCache(cache);

            const profileResponse = await fetch(`${ML_API_URL}/profile/${session.minecraftUuid}`, {
              headers: {
                ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
              }
            });

            if (!profileResponse.ok) {
              return { ok: false, error: `Failed to fetch updated profile: ${profileResponse.statusText}` };
            }

            const updatedResult = await profileResponse.json() as any;
            if (updatedResult.ok && updatedResult.profile) {
              const activeSkin =
                updatedResult.profile.skins?.find((skin: any) => skin?.state === "ACTIVE") ||
                updatedResult.profile.skins?.[0] ||
                null;
              
              const profile = {
                id: updatedResult.profile.id,
                name: updatedResult.profile.name,
                skins: updatedResult.profile.skins || [],
                capes: updatedResult.profile.capes || [],
                activeSkin,
                skinUrl: activeSkin?.url || null,
                variant: (activeSkin?.variant || "CLASSIC").toLowerCase(),
              };

              setCachedMinecraftProfile(sessionKey, profile);

              return {
                ok: true,
                profile,
                message: "Skin updated successfully.",
              };
            }
          }

          return { ok: false, error: "Failed to parse upload result from server." };
        }

        // If Microsoft-only session, use standard direct Mojang API skin upload
        if (session.type === "microsoft") {
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
        }

        return { ok: false, error: "Microsoft account is required." };
      } catch (error: any) {
        return { ok: false, error: error?.message || "Failed to upload skin." };
      }
    },
  );

  ipcMain.handle("catskinc-get-config", async (_event, gameDirectory?: string): Promise<{ ok: boolean; configured: boolean; ip: string }> => {
    try {
      const baseDir = gameDirectory || getMinecraftDir();
      const configPath = path.join(baseDir, "config", "catskinc.json");
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(raw);
        const ip = parsed?.catskinCloudIp || "storage-api.catskin.space";
        return { ok: true, configured: true, ip };
      }
      return { ok: true, configured: false, ip: "storage-api.catskin.space" };
    } catch {
      return { ok: false, configured: false, ip: "storage-api.catskin.space" };
    }
  });

  ipcMain.handle(
    "catskinc-save-config",
    async (_event, payload: { ip: string; gameDirectory?: string }): Promise<{ ok: boolean; error?: string }> => {
      try {
        const baseDir = payload.gameDirectory || getMinecraftDir();
        const configPath = path.join(baseDir, "config", "catskinc.json");
        const configDir = path.dirname(configPath);
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
        }
        
        let existingConfig: any = {};
        if (fs.existsSync(configPath)) {
          try {
            const raw = fs.readFileSync(configPath, "utf-8");
            existingConfig = JSON.parse(raw);
          } catch {}
        }
        
        existingConfig.catskinCloudIp = payload.ip.trim();
        
        fs.writeFileSync(configPath, JSON.stringify(existingConfig, null, 2), "utf-8");
        return { ok: true };
      } catch (error: any) {
        return { ok: false, error: error?.message || "Failed to save CatSkinC config" };
      }
    }
  );

  ipcMain.handle("catskinc-get-selected-skin", async (_event, gameDirectory?: string): Promise<{ ok: boolean; url?: string; mouthUrl?: string; slim?: boolean; error?: string }> => {
    try {
      const session = getSession();
      if (!session) {
        return { ok: false, error: "Not logged in" };
      }
      const catskincBaseUrl = getCatSkinCloudUrl(gameDirectory);
      const requestId = crypto.randomUUID();
      const formattedUuid = getFormattedMinecraftUuid(session);
      const response = await fetch(`${catskincBaseUrl}/selected?uuid=${formattedUuid}`, {
        method: "GET",
        headers: {
          "User-Agent": "catskinc/ServerApiClient",
          "x-catskinc-protocol": "2",
          "x-catskinc-request-id": requestId,
          "x-catskinc-content-sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        }
      });
      if (!response.ok) {
        return { ok: false, error: `Failed to fetch selected skin from CatSkinC (${response.status})` };
      }
      const data = await response.json() as any;
      let skinUrl = data.url;
      if (skinUrl === "" || skinUrl === null || skinUrl === "/public/system/updateyurmod.png") {
        skinUrl = undefined;
      }
      if (skinUrl && !skinUrl.startsWith("http://") && !skinUrl.startsWith("https://")) {
        skinUrl = `${catskincBaseUrl}${skinUrl}`;
      }
      let mouthUrl = data.mouth_open_url || data.mouthOpenUrl || data.mouth_url || data.mouthUrl;
      if (mouthUrl === "" || mouthUrl === null) {
        mouthUrl = undefined;
      }
      if (mouthUrl && !mouthUrl.startsWith("http://") && !mouthUrl.startsWith("https://")) {
        mouthUrl = `${catskincBaseUrl}${mouthUrl}`;
      }
      let skinDataUrl: string | undefined = undefined;
      if (skinUrl) {
        skinDataUrl = await fetchUrlAsDataUrl(skinUrl, { "x-catskinc-protocol": "2" });
      }
      let mouthDataUrl: string | undefined = undefined;
      if (mouthUrl) {
        mouthDataUrl = await fetchUrlAsDataUrl(mouthUrl, { "x-catskinc-protocol": "2" });
      }
      return {
        ok: true,
        url: skinDataUrl || undefined,
        mouthUrl: mouthDataUrl || undefined,
        slim: data.slim ?? false
      };
    } catch (error: any) {
      return { ok: false, error: error?.message || "Failed to query CatSkinC server." };
    }
  });

  ipcMain.handle(
    "catskinc-upload-skin",
    async (
      _event,
      payload: { dataUrl: string; slim: boolean; mouthOpenDataUrl?: string; gameDirectory?: string },
    ): Promise<{ ok: boolean; error?: string; message?: string }> => {
      try {
        const session = getSession();
        if (!session) {
          return { ok: false, error: "Not logged in" };
        }

        if (session.type !== "microsoft") {
          return { ok: false, error: "Microsoft account is required to authenticate with CatSkinC." };
        }

        const skinBuffer = parsePngDataUrl(payload.dataUrl || "");
        if (!skinBuffer) {
          return { ok: false, error: "Invalid skin image format. Only PNG is supported." };
        }

        const mouthOpenBuffer = payload.mouthOpenDataUrl ? parsePngDataUrl(payload.mouthOpenDataUrl) : null;

        const refreshResult = await refreshMicrosoftTokenIfNeeded();
        if (!refreshResult.ok) {
          return {
            ok: false,
            error: refreshResult.error || "Could not refresh Microsoft token.",
          };
        }
        const accessToken = refreshResult.session?.accessToken || session.accessToken;
        if (!accessToken) {
          return { ok: false, error: "Microsoft access token not found." };
        }

        const serverIdBytes = crypto.randomBytes(20);
        const serverId = serverIdBytes.toString("hex");

        const mojangJoinResponse = await fetch("https://sessionserver.mojang.com/session/minecraft/join", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            accessToken,
            selectedProfile: session.uuid,
            serverId,
          }),
        });

        if (!mojangJoinResponse.ok) {
          let errorText = `Mojang joinServer verification failed (${mojangJoinResponse.status})`;
          try {
            const errorData = await mojangJoinResponse.json();
            errorText = errorData?.errorMessage || errorData?.error || errorText;
          } catch {}
          return { ok: false, error: errorText };
        }

        const catskincBaseUrl = getCatSkinCloudUrl(payload.gameDirectory);
        const formattedUuid = getFormattedMinecraftUuid(session);

        const authPayload = {
          username: session.username,
          uuid: formattedUuid,
          server_id: serverId,
        };
        const authBody = JSON.stringify(authPayload);
        const authBodyBytes = Buffer.from(authBody, "utf-8");
        const authBodySha256 = crypto.createHash("sha256").update(authBodyBytes).digest("hex");
        const authRequestId = crypto.randomUUID();

        const authResponse = await fetch(`${catskincBaseUrl}/auth/session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "x-catskinc-protocol": "2",
            "x-catskinc-request-id": authRequestId,
            "x-catskinc-content-sha256": authBodySha256,
          },
          body: authBody,
        });

        if (!authResponse.ok) {
          let errorText = `CatSkinC session authentication failed (${authResponse.status})`;
          try {
            const errorData = await authResponse.json();
            errorText = errorData?.message || errorData?.error || errorText;
          } catch {}
          return { ok: false, error: errorText };
        }

        const authData = await authResponse.json() as any;
        const sessionToken = authData?.session_token;
        if (!sessionToken) {
          return { ok: false, error: "Failed to retrieve session token from CatSkinC." };
        }

        const form = new FormData();
        form.append("uuid", formattedUuid);
        form.append("slim", String(payload.slim));
        form.append(
          "file",
          new Blob([Uint8Array.from(skinBuffer)], { type: "image/png" }),
          "skin.png",
        );

        if (mouthOpenBuffer) {
          form.append(
            "mouth_open",
            new Blob([Uint8Array.from(mouthOpenBuffer)], { type: "image/png" }),
            "mouth-open.png",
          );
          form.append(
            "mouth",
            new Blob([Uint8Array.from(mouthOpenBuffer)], { type: "image/png" }),
            "mouth-open.png",
          );
        }

        const canonicalHash = computeUploadContentHash(
          formattedUuid,
          payload.slim,
          skinBuffer,
          mouthOpenBuffer,
        );

        const uploadRequestId = crypto.randomUUID();

        const uploadResponse = await fetch(`${catskincBaseUrl}/upload`, {
          method: "POST",
          headers: {
            "x-catskinc-protocol": "2",
            "x-catskinc-request-id": uploadRequestId,
            "x-catskinc-session": sessionToken,
            "x-catskinc-content-sha256": canonicalHash,
          },
          body: form,
        });

        if (!uploadResponse.ok) {
          let errorText = `Skin upload to CatSkinC failed (${uploadResponse.status})`;
          try {
            const errorData = await uploadResponse.json() as any;
            errorText = errorData?.message || errorData?.error || errorText;
          } catch {}
          return { ok: false, error: errorText };
        }

        return { ok: true, message: "Skin synced to CatSkinC successfully" };
      } catch (error: any) {
        return { ok: false, error: error?.message || "Failed to upload to CatSkinC." };
      }
    },
  );

  ipcMain.handle(
    "catskinc-clear-assets",
    async (
      _event,
      payload: { mode: "all" | "skin" | "mouth"; gameDirectory?: string },
    ): Promise<{ ok: boolean; error?: string; message?: string }> => {
      try {
        const session = getSession();
        if (!session) {
          return { ok: false, error: "Not logged in" };
        }

        if (session.type !== "microsoft") {
          return { ok: false, error: "Microsoft account is required to authenticate with CatSkinC." };
        }

        const refreshResult = await refreshMicrosoftTokenIfNeeded();
        if (!refreshResult.ok) {
          return {
            ok: false,
            error: refreshResult.error || "Could not refresh Microsoft token.",
          };
        }
        const accessToken = refreshResult.session?.accessToken || session.accessToken;
        if (!accessToken) {
          return { ok: false, error: "Microsoft access token not found." };
        }

        const serverIdBytes = crypto.randomBytes(20);
        const serverId = serverIdBytes.toString("hex");

        const mojangJoinResponse = await fetch("https://sessionserver.mojang.com/session/minecraft/join", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            accessToken,
            selectedProfile: session.uuid,
            serverId,
          }),
        });

        if (!mojangJoinResponse.ok) {
          let errorText = `Mojang joinServer verification failed (${mojangJoinResponse.status})`;
          try {
            const errorData = await mojangJoinResponse.json();
            errorText = errorData?.errorMessage || errorData?.error || errorText;
          } catch {}
          return { ok: false, error: errorText };
        }

        const catskincBaseUrl = getCatSkinCloudUrl(payload.gameDirectory);
        const formattedUuid = getFormattedMinecraftUuid(session);

        const authPayload = {
          username: session.username,
          uuid: formattedUuid,
          server_id: serverId,
        };
        const authBody = JSON.stringify(authPayload);
        const authBodyBytes = Buffer.from(authBody, "utf-8");
        const authBodySha256 = crypto.createHash("sha256").update(authBodyBytes).digest("hex");
        const authRequestId = crypto.randomUUID();

        const authResponse = await fetch(`${catskincBaseUrl}/auth/session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "x-catskinc-protocol": "2",
            "x-catskinc-request-id": authRequestId,
            "x-catskinc-content-sha256": authBodySha256,
          },
          body: authBody,
        });

        if (!authResponse.ok) {
          let errorText = `CatSkinC session authentication failed (${authResponse.status})`;
          try {
            const errorData = await authResponse.json();
            errorText = errorData?.message || errorData?.error || errorText;
          } catch {}
          return { ok: false, error: errorText };
        }

        const authData = await authResponse.json() as any;
        const sessionToken = authData?.session_token;
        if (!sessionToken) {
          return { ok: false, error: "Failed to retrieve session token from CatSkinC." };
        }

        const selectBody = {
          uuid: formattedUuid,
          clear: payload.mode,
        };
        const selectBodyStr = JSON.stringify(selectBody);
        const selectBodyBytes = Buffer.from(selectBodyStr, "utf-8");
        const selectBodySha256 = crypto.createHash("sha256").update(selectBodyBytes).digest("hex");
        const selectRequestId = crypto.randomUUID();

        const selectResponse = await fetch(`${catskincBaseUrl}/select`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "x-catskinc-protocol": "2",
            "x-catskinc-request-id": selectRequestId,
            "x-catskinc-session": sessionToken,
            "x-catskinc-content-sha256": selectBodySha256,
          },
          body: selectBodyStr,
        });

        if (!selectResponse.ok) {
          let errorText = `Clear operation failed (${selectResponse.status})`;
          try {
            const errorData = await selectResponse.json() as any;
            errorText = errorData?.message || errorData?.error || errorText;
          } catch {}
          return { ok: false, error: errorText };
        }

        return { ok: true, message: "Cleared assets successfully." };
      } catch (error: any) {
        return { ok: false, error: error?.message || "Failed to clear assets." };
      }
    },
  );

  ipcMain.handle("read-local-file-as-data-url", async (_event, filePath: string): Promise<string | null> => {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const fileData = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();

      const mimeTypes: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
      };

      const mimeType = mimeTypes[ext] || "image/png";
      return `data:${mimeType};base64,${fileData.toString("base64")}`;
    } catch (error) {
      console.error("[Utility] Failed to read local file:", error);
      return null;
    }
  });

  console.log("[IPC] Utility handlers registered");
}
