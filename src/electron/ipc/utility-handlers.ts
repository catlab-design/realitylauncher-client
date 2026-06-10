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
import { getSession } from "../auth.js";
import { refreshMicrosoftTokenIfNeeded } from "../auth-refresh.js";
import { API_URL } from "../lib/constants.js";

const ML_API_URL = process.env.ML_API_URL || API_URL;

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
            
            // Delete cache
            const cache = loadMinecraftProfileCache();
            delete cache[sessionKey];
            saveMinecraftProfileCache(cache);

            // Fetch updated profile
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

  console.log("[IPC] Utility handlers registered");
}
