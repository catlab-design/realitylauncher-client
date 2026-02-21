/**
 * ========================================
 * Auth IPC Handlers
 * ========================================
 *
 * Handles all authentication-related IPC:
 * - CatID login/register
 * - Microsoft Device Code Flow
 * - Offline mode
 * - Token refresh
 * - Auth window management
 */

import { ipcMain, BrowserWindow } from "electron";
import {
  logout,
  getSession,
  isLoggedIn,
  loginOffline,
  loginCatID,
  setActiveSession,
  updateApiToken,
  loginMicrosoft,
  type AuthSession,
} from "../auth.js";
import { createIpcLogger } from "../lib/logger.js";
import { refreshMicrosoftTokenIfNeeded } from "../auth-refresh.js";

// Create logger for auth handlers
const logger = createIpcLogger("Auth");

// Auth window reference
let authWindow: BrowserWindow | null = null;

import { API_URL } from "../lib/constants.js";

// ml-api URL for CatID authentication
const ML_API_URL = process.env.ML_API_URL || API_URL;

// Microsoft OAuth Client ID - fetched from ml-api
let MICROSOFT_CLIENT_ID: string | null = null;

type CatIDUserPayload = {
  id?: string | number | null;
  username?: string | null;
  minecraftUsername?: string | null;
  minecraftUuid?: string | null;
};

function getCatIDDisplayName(
  user: CatIDUserPayload | undefined,
  fallback: string,
): string {
  return user?.minecraftUsername || user?.username || fallback;
}

function getCatIDSessionUuid(
  user: CatIDUserPayload | undefined,
  fallback: string,
): string {
  if (!user?.id) return fallback;
  return `catid-${user.id}`;
}

async function syncCatIDSessionIdentity(
  session: AuthSession,
): Promise<AuthSession> {
  if (session.type !== "catid" || !session.accessToken) {
    return session;
  }

  const response = await fetch(`${ML_API_URL}/auth/catid/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      "X-Client-App": "RealityLauncher",
    },
  });

  if (!response.ok) {
    return session;
  }

  const data = (await response.json()) as { user?: CatIDUserPayload };
  const user = data.user;
  const normalizedUsername = getCatIDDisplayName(user, session.username);
  const normalizedUuid = getCatIDSessionUuid(user, session.uuid);
  const normalizedMinecraftUuid = user
    ? user.minecraftUuid || undefined
    : session.minecraftUuid;

  if (
    normalizedUsername === session.username &&
    normalizedUuid === session.uuid &&
    normalizedMinecraftUuid === session.minecraftUuid
  ) {
    return session;
  }

  return {
    ...session,
    username: normalizedUsername,
    uuid: normalizedUuid,
    minecraftUuid: normalizedMinecraftUuid || undefined,
  };
}

// Fetch Device Client ID from ml-api
async function fetchOAuthConfig(): Promise<boolean> {
  try {
    const response = await fetch(`${ML_API_URL}/oauth/config`);
    if (response.ok) {
      const data = (await response.json()) as {
        microsoftDeviceClientId?: string;
      };
      if (data.microsoftDeviceClientId) {
        MICROSOFT_CLIENT_ID = data.microsoftDeviceClientId;
        logger.info("Fetched Microsoft Device Client ID from API");
        return true;
      }
    }
  } catch (error) {
    logger.error("Could not fetch OAuth config from API", error);
  }
  return false;
}

// Fetch OAuth config when module loads (catch to avoid unhandled rejection)
fetchOAuthConfig().catch(() => {});

export function registerAuthHandlers(
  getMainWindow: () => BrowserWindow | null,
): void {
  const AUTH_URL =
    process.env.AUTH_URL || "https://reality.catlabdesign.space/login"; // Default to web login

  // ----------------------------------------
  // Basic Auth Handlers
  // ----------------------------------------

  ipcMain.handle("auth-logout", async (): Promise<void> => {
    logout();
  });

  ipcMain.handle("auth-get-session", async (): Promise<AuthSession | null> => {
    const session = getSession();

    // For Microsoft+CatID sessions missing apiTokenExpiresAt, fetch from API
    if (
      session &&
      session.type === "microsoft" &&
      session.apiToken &&
      !session.apiTokenExpiresAt
    ) {
      try {
        const res = await fetch(`${ML_API_URL}/auth/session/me`, {
          headers: { Authorization: `Bearer ${session.apiToken}` },
        });
        if (res.ok) {
          const data = (await res.json()) as any;
          if (data.sessionExpiresAt) {
            updateApiToken(
              session.apiToken,
              typeof data.sessionExpiresAt === "string"
                ? data.sessionExpiresAt
                : new Date(data.sessionExpiresAt).toISOString(),
            );
            return getSession(); // Return updated session
          }
        }
      } catch {
        // Non-fatal — just return session without expiry
      }
    }

    if (
      session &&
      session.type === "catid" &&
      session.accessToken &&
      (session.minecraftUuid || !session.uuid.startsWith("catid-"))
    ) {
      try {
        const normalizedSession = await syncCatIDSessionIdentity(session);
        if (
          normalizedSession.username !== session.username ||
          normalizedSession.uuid !== session.uuid ||
          normalizedSession.minecraftUuid !== session.minecraftUuid
        ) {
          setActiveSession(normalizedSession);
          return getSession();
        }
      } catch (error) {
        logger.warn("Could not sync CatID profile", { error: String(error) });
      }
    }

    return session;
  });

  ipcMain.handle("auth-is-logged-in", async (): Promise<boolean> => {
    return isLoggedIn();
  });

  ipcMain.handle(
    "auth-set-active-session",
    async (_event, session: AuthSession): Promise<AuthSession | null> => {
      let nextSession = session;

      if (session.type === "catid" && session.accessToken) {
        try {
          nextSession = await syncCatIDSessionIdentity(session);
        } catch (error) {
          logger.warn("Could not sync CatID profile while switching", {
            error: String(error),
          });
        }
      }

      setActiveSession(nextSession);
      if (nextSession.type !== "microsoft") {
        return getSession();
      }

      const refreshResult = await refreshMicrosoftTokenIfNeeded(logger);
      if (!refreshResult.ok) {
        logger.warn("Failed to refresh token while switching active session", {
          error: refreshResult.error,
          requiresRelogin: refreshResult.requiresRelogin,
        });
      }

      return refreshResult.session ?? getSession();
    },
  );

  // ----------------------------------------
  // Auth Window Handlers
  // ----------------------------------------

  ipcMain.handle("open-auth-window", async (): Promise<void> => {
    const mainWindow = getMainWindow();

    if (authWindow && !authWindow.isDestroyed()) {
      authWindow.focus();
      return;
    }

    authWindow = new BrowserWindow({
      width: 500,
      height: 700,
      parent: mainWindow!,
      modal: false,
      resizable: true,
      minimizable: false,
      maximizable: false,
      title: "เข้าสู่ระบบ - Reality Launcher",
      backgroundColor: "#1a1a1a",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    authWindow.loadURL(AUTH_URL);

    authWindow.on("closed", () => {
      authWindow = null;
    });

    authWindow.webContents.on("will-redirect", async (event, url) => {
      if (
        url.includes("callback") ||
        url.includes("access_token=") ||
        url.includes("token=")
      ) {
        const urlObj = new URL(url);
        const error = urlObj.searchParams.get("error");

        if (error) {
          mainWindow?.webContents.send("auth-callback", { error });
          authWindow?.close();
          return;
        }

        const accessToken = urlObj.searchParams.get("access_token");
        const uuid = urlObj.searchParams.get("uuid");
        const username = urlObj.searchParams.get("username");

        if (accessToken && uuid && username) {
          loginMicrosoft(username, uuid, accessToken);
          mainWindow?.webContents.send("auth-callback", {
            accessToken,
            uuid,
            username,
            type: "microsoft",
          });
          authWindow?.close();
          return;
        }

        const token = urlObj.searchParams.get("token");
        if (token) {
          mainWindow?.webContents.send("auth-callback", { token });
          authWindow?.close();
        }
      }
    });
  });

  ipcMain.handle("close-auth-window", async (): Promise<void> => {
    if (authWindow && !authWindow.isDestroyed()) {
      authWindow.close();
      authWindow = null;
    }
  });

  ipcMain.handle(
    "open-microsoft-login",
    async (
      _event,
      verificationUri: string,
      userCode: string,
    ): Promise<void> => {
      const loginWindow = new BrowserWindow({
        width: 500,
        height: 700,
        title: "Microsoft Login",
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          partition: "microsoft-login-" + Date.now(),
        },
        autoHideMenuBar: true,
        resizable: true,
        center: true,
      });

      await loginWindow.webContents.session.clearStorageData({
        storages: ["cookies", "localstorage"],
      });

      await loginWindow.loadURL(verificationUri);

      loginWindow.webContents.on("did-navigate", (_event, url) => {
        if (
          url.includes("nativeclient") ||
          url.includes("success") ||
          url.includes("close")
        ) {
          loginWindow.close();
        }
      });
    },
  );

  // ----------------------------------------
  // Device Code Auth Handlers
  // ----------------------------------------

  ipcMain.handle("auth-device-code-start", async () => {
    try {
      await fetchOAuthConfig();

      if (!MICROSOFT_CLIENT_ID) {
        return { ok: false, error: "Device Client ID ยังไม่ได้ตั้งค่า" };
      }

      const response = await fetch(
        "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: MICROSOFT_CLIENT_ID,
            scope: "XboxLive.signin offline_access",
          }),
        },
      );

      const data = (await response.json()) as any;

      if (!response.ok || data.error) {
        return { ok: false, error: data.error_description || data.error };
      }

      return {
        ok: true,
        deviceCode: data.device_code,
        userCode: data.user_code,
        verificationUri: data.verification_uri,
        expiresIn: data.expires_in,
        interval: data.interval,
        message: data.message,
      };
    } catch (error: any) {
      return { ok: false, error: error.message || "Network error" };
    }
  });

  ipcMain.handle(
    "auth-device-code-poll",
    async (_event, deviceCode: string, isLinking: boolean = false) => {
      const mainWindow = getMainWindow();

      try {
        if (!MICROSOFT_CLIENT_ID) {
          return { status: "error", error: "Device Client ID not configured" };
        }

        let linkSwitched = false;
        let oldCatID: string | null = null;

        // Step 1: Poll for Microsoft token
        const tokenResponse = await fetch(
          "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "urn:ietf:params:oauth:grant-type:device_code",
              client_id: MICROSOFT_CLIENT_ID,
              device_code: deviceCode,
            }),
          },
        );

        const tokenData = (await tokenResponse.json()) as any;
        const msRefreshToken = tokenData.refresh_token;
        const msExpiresIn = tokenData.expires_in;

        if (tokenData.error === "authorization_pending")
          return { status: "pending" };
        if (tokenData.error === "expired_token")
          return { status: "expired", error: "รหัสหมดอายุ" };
        if (tokenData.error === "authorization_declined")
          return { status: "error", error: "ผู้ใช้ปฏิเสธ" };
        if (tokenData.error)
          return {
            status: "error",
            error: tokenData.error_description || tokenData.error,
          };
        if (!tokenData.access_token)
          return { status: "error", error: "No access token" };

        // Step 2: Xbox Live
        const xblResponse = await fetch(
          "https://user.auth.xboxlive.com/user/authenticate",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              Properties: {
                AuthMethod: "RPS",
                SiteName: "user.auth.xboxlive.com",
                RpsTicket: `d=${tokenData.access_token}`,
              },
              RelyingParty: "http://auth.xboxlive.com",
              TokenType: "JWT",
            }),
          },
        );
        const xblData = (await xblResponse.json()) as any;
        if (!xblData.Token)
          return { status: "error", error: "Xbox Live auth failed" };

        const userHash = xblData.DisplayClaims?.xui?.[0]?.uhs;
        if (!userHash) return { status: "error", error: "User hash not found" };

        // Step 3: XSTS
        const xstsResponse = await fetch(
          "https://xsts.auth.xboxlive.com/xsts/authorize",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              Properties: { SandboxId: "RETAIL", UserTokens: [xblData.Token] },
              RelyingParty: "rp://api.minecraftservices.com/",
              TokenType: "JWT",
            }),
          },
        );
        const xstsData = (await xstsResponse.json()) as any;

        if (!xstsData.Token) {
          if (xstsData.XErr === 2148916233)
            return { status: "error", error: "ไม่มี Xbox Live" };
          if (xstsData.XErr === 2148916238)
            return { status: "error", error: "ต้องมีผู้ปกครองอนุมัติ" };
          return { status: "error", error: `XSTS failed: ${xstsData.XErr}` };
        }

        // Step 4: Minecraft
        const mcResponse = await fetch(
          "https://api.minecraftservices.com/authentication/login_with_xbox",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              identityToken: `XBL3.0 x=${userHash};${xstsData.Token}`,
            }),
          },
        );
        const mcData = (await mcResponse.json()) as any;
        if (!mcData.access_token)
          return { status: "error", error: "Minecraft auth failed" };

        // Step 5: Check ownership
        const entitlementResponse = await fetch(
          "https://api.minecraftservices.com/entitlements/mcstore",
          {
            headers: { Authorization: `Bearer ${mcData.access_token}` },
          },
        );
        const entitlementData = (await entitlementResponse.json()) as any;
        if (!entitlementData.items?.length)
          return { status: "error", error: "ไม่มี Minecraft" };

        // Step 6: Get profile
        const profileResponse = await fetch(
          "https://api.minecraftservices.com/minecraft/profile",
          {
            headers: { Authorization: `Bearer ${mcData.access_token}` },
          },
        );
        const profileData = (await profileResponse.json()) as any;
        if (!profileData.id || !profileData.name)
          return { status: "error", error: "Profile not found" };

        // Step 7: Save session
        // Step 7: Save session

        let apiTokenString: string | undefined;
        let apiTokenExpiresAt: string | undefined;
        let authHeaders: Record<string, string> = {
          "Content-Type": "application/json",
          "X-Client-App": "RealityLauncher",
        };

        // Check for existing CatID session if linking
        if (isLinking) {
          const currentSession = getSession();
          if (
            currentSession &&
            currentSession.type === "catid" &&
            currentSession.accessToken
          ) {
            apiTokenString = currentSession.accessToken;
            authHeaders["Authorization"] = `Bearer ${apiTokenString}`;
            logger.info(" Linking Microsoft to CatID session");
          } else {
            logger.warn(" Link requested but no CatID session found");
          }
        }

        // Always login as Microsoft (updates local state details)
        loginMicrosoft(
          profileData.name,
          profileData.id,
          mcData.access_token,
          msRefreshToken,
          msExpiresIn,
        );

        // Step 8: Link with Reality API to get/update API token and Sync Backend
        // Only link if explicitly requested (isLinking is true)
        // This prevents automatic saving of Microsoft accounts to the API/Admin panel
        if (isLinking) {
          try {
            const linkResponse = await fetch(
              `${ML_API_URL}/auth/microsoft/link`,
              {
                method: "POST",
                headers: authHeaders,
                body: JSON.stringify({
                  accessToken: mcData.access_token,
                  uuid: profileData.id,
                  username: profileData.name,
                }),
              },
            );
            let linkData: any;
            try {
              linkData = await linkResponse.json();
            } catch {
              logger.warn(" Link response is not valid JSON");
              linkData = {};
            }

            if (linkResponse.ok && linkData.token) {
              apiTokenString = linkData.token;
              apiTokenExpiresAt = linkData.expiresAt;
              updateApiToken(linkData.token, linkData.expiresAt);
              linkSwitched = !!linkData.linkSwitched;
              oldCatID = linkData.oldCatID;
              logger.info(" Microsoft linked successfully");
            } else {
              // Bug #2 Fix: Report link failure to user instead of silently ignoring
              const linkErrorMsg =
                linkData.error ||
                `เชื่อมต่อล้มเหลว (HTTP ${linkResponse.status})`;
              logger.warn("Link failed", { error: linkErrorMsg });
              return {
                status: "success",
                linkError: linkErrorMsg,
                session: {
                  username: profileData.name,
                  uuid: profileData.id,
                  accessToken: mcData.access_token,
                  refreshToken: msRefreshToken,
                  expiresIn: msExpiresIn,
                },
              };
            }
          } catch (linkError) {
            logger.warn("Link API error", { error: String(linkError) });
            return {
              status: "success",
              linkError: "เชื่อมต่อ API ล้มเหลว: " + String(linkError),
              session: {
                username: profileData.name,
                uuid: profileData.id,
                accessToken: mcData.access_token,
                refreshToken: msRefreshToken,
                expiresIn: msExpiresIn,
              },
            };
          }
        } else {
          logger.info(" Default Microsoft login (Local only, no API sync)");
        }

        mainWindow?.webContents.send("auth-callback", {
          accessToken: mcData.access_token,
          uuid: profileData.id,
          username: profileData.name,
          type: "microsoft",
          apiToken: apiTokenString,
        });

        // Sync instances using API token
        if (apiTokenString) {
          const { syncCloudInstances } = await import("../cloud-instances.js");
          syncCloudInstances(apiTokenString).catch((err) =>
            logger.error("Cloud sync failed", err),
          );
        }

        return {
          status: "success",
          linkSwitched,
          oldCatID,
          session: {
            username: profileData.name,
            uuid: profileData.id,
            accessToken: mcData.access_token,
            refreshToken: msRefreshToken,
            expiresIn: msExpiresIn,
            apiToken: apiTokenString,
            apiTokenExpiresAt,
          },
        };
      } catch (error: any) {
        return { status: "error", error: error.message || "Network error" };
      }
    },
  );

  // ----------------------------------------
  // Token Refresh Handler
  // ----------------------------------------

  ipcMain.handle("auth-refresh-token", async () => {
    const refreshResult = await refreshMicrosoftTokenIfNeeded(logger);
    if (!refreshResult.ok) {
      return {
        ok: false,
        error: refreshResult.error || "Token refresh failed",
        requiresRelogin: refreshResult.requiresRelogin || false,
      };
    }

    if (refreshResult.newApiToken) {
      const { syncCloudInstances } = await import("../cloud-instances.js");
      syncCloudInstances(refreshResult.newApiToken).catch((err) =>
        logger.error("Cloud sync failed", err),
      );
    }

    return {
      ok: true,
      refreshed: refreshResult.refreshed,
      newAccessToken: refreshResult.newAccessToken,
      newApiToken: refreshResult.newApiToken,
    };
  });

  // ----------------------------------------
  // CatID Auth Handlers
  // ----------------------------------------

  ipcMain.handle(
    "auth-catid-login",
    async (_event, username: string, password: string) => {
      try {
        const response = await fetch(`${ML_API_URL}/auth/catid/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Client-App": "RealityLauncher",
          },
          body: JSON.stringify({ username, password }),
        });

        let data: any;
        try {
          data = await response.json();
        } catch {
          return {
            ok: false,
            error: response.ok
              ? "เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง"
              : `เกิดข้อผิดพลาด: ${response.status}`,
          };
        }

        if (!response.ok || !data.token) {
          return { ok: false, error: data.message || "เข้าสู่ระบบไม่สำเร็จ" };
        }

        const displayName = getCatIDDisplayName(data.user, username);
        const uuid = getCatIDSessionUuid(data.user, `catid-${Date.now()}`);
        const minecraftUuid = data.user?.minecraftUuid; // Real Minecraft UUID from linked Microsoft account
        const expiresAt = data.expiresAt; // New field from API

        loginCatID(displayName, uuid, data.token, minecraftUuid, expiresAt);

        getMainWindow()?.webContents.send("auth-callback", {
          token: data.token,
          uuid,
          username: displayName,
          type: "catid",
          minecraftUuid,
          expiresAt,
        });

        // Sync instances
        const { syncCloudInstances } = await import("../cloud-instances.js");
        syncCloudInstances(data.token).catch((err) =>
          logger.error("Cloud sync failed", err),
        );

        return {
          ok: true,
          session: {
            username: displayName,
            uuid,
            token: data.token,
            minecraftUuid,
          },
        };
      } catch (error: any) {
        return { ok: false, error: error.message || "เกิดข้อผิดพลาด" };
      }
    },
  );

  ipcMain.handle(
    "auth-catid-register",
    async (
      _event,
      username: string,
      email: string,
      password: string,
      confirmPassword?: string,
    ) => {
      try {
        const response = await fetch(`${ML_API_URL}/auth/catid/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Client-App": "RealityLauncher",
          },
          body: JSON.stringify({ username, email, password, confirmPassword }),
        });

        const responseText = await response.text();

        // DEBUG LOGS
        logger.debug("Register request", { apiUrl: ML_API_URL });
        logger.debug("Register raw response", {
          response: responseText.slice(0, 200),
        });

        let data: any;
        try {
          data = JSON.parse(responseText);
        } catch {
          return {
            ok: false,
            error: response.ok
              ? "เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง"
              : `error: ${response.status}`,
          };
        }

        if (!response.ok) {
          return { ok: false, error: data.message || "สมัครไม่สำเร็จ" };
        }

        return {
          ok: true,
          message: data.message,
          requiresVerification: data.requiresVerification,
          verifyToken: data.verifyToken,
          expiresAt: data.expiresAt,
          expiresInSeconds: data.expiresInSeconds,
        };
      } catch (error: any) {
        return { ok: false, error: error.message || "เกิดข้อผิดพลาด" };
      }
    },
  );

  // Check registration verification status (for polling)
  ipcMain.handle(
    "auth-check-registration-status",
    async (_event, token: string) => {
      try {
        const response = await fetch(
          `${ML_API_URL}/auth/catid/register/status/${token}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          },
        );

        let data: any;
        try {
          data = await response.json();
        } catch {
          return { status: "error", message: "เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง" };
        }

        return data;
      } catch (error: any) {
        return { status: "error", message: error.message || "เกิดข้อผิดพลาด" };
      }
    },
  );

  ipcMain.handle("auth-forgot-password", async (_event, email: string) => {
    try {
      const response = await fetch(`${ML_API_URL}/auth/catid/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      let data: any;
      try {
        data = await response.json();
      } catch {
        return { ok: false, error: "Invalid response from server" };
      }

      if (!response.ok) {
        return { ok: false, error: data.message || "Failed to send OTP" };
      }

      return { ok: true, message: data.message };
    } catch (error: any) {
      return { ok: false, error: error.message || "Network error" };
    }
  });

  ipcMain.handle(
    "auth-reset-password",
    async (_event, email: string, otp: string, newPassword: string) => {
      try {
        const response = await fetch(
          `${ML_API_URL}/auth/catid/reset-password`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, otp, newPassword }),
          },
        );

        let data: any;
        try {
          data = await response.json();
        } catch {
          return { ok: false, error: "Invalid response from server" };
        }

        if (!response.ok) {
          return {
            ok: false,
            error: data.message || "Failed to reset password",
          };
        }

        return { ok: true, message: data.message };
      } catch (error: any) {
        return { ok: false, error: error.message || "Network error" };
      }
    },
  );

  ipcMain.handle(
    "auth-link-catid",
    async (_event, username: string, password: string) => {
      try {
        const session = getSession();

        if (!session || session.type !== "microsoft") {
          return { ok: false, error: "ต้องเข้าสู่ระบบด้วย Microsoft ก่อน" };
        }

        // reuse catid login logic
        const response = await fetch(`${ML_API_URL}/auth/catid/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Client-App": "RealityLauncher",
          },
          body: JSON.stringify({ username, password }),
        });

        let data: any;
        try {
          data = await response.json();
        } catch {
          return {
            ok: false,
            error: response.ok
              ? "เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง"
              : `เกิดข้อผิดพลาด: ${response.status}`,
          };
        }

        if (!response.ok || !data.token) {
          return {
            ok: false,
            error:
              data.message || "เชื่อมต่อไม่สำเร็จ: ชื่อผู้ใช้หรือรหัสผ่านผิด",
          };
        }

        // Link Microsoft account to CatID on server before accepting locally
        let linkError: string | null = null;
        let linkSwitched = false;
        let oldCatID: string | null = null;

        // ============================================
        // CRITICAL: Perform Server-Side Link
        // ============================================
        try {
          // We have the new CatID token.
          // We also need the Microsoft Info from the OLD session (which is session).
          // But we need to make sure we send the FRESH Microsoft Access Token?
          // session.accessToken might be old? But usually valid.

          if (session.accessToken && session.username && session.uuid) {
            logger.info(" Linking Microsoft account to CatID on server...");
            const msExpiresAt = session.tokenExpiresAt
              ? new Date(session.tokenExpiresAt).toISOString()
              : undefined;

            const linkResponse = await fetch(
              `${ML_API_URL}/auth/microsoft/link`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${data.token}`, // Authenticate as the CatID User
                  "Content-Type": "application/json",
                  "X-Client-App": "RealityLauncher",
                },
                body: JSON.stringify({
                  accessToken: session.accessToken,
                  uuid: session.uuid,
                  username: session.username, // Minecraft Username
                  accessTokenExpiresAt: msExpiresAt,
                }),
              },
            );

            if (linkResponse.ok) {
              try {
                const linkData = (await linkResponse.json()) as any;
                updateApiToken(data.token, linkData?.expiresAt);
                linkSwitched = !!linkData?.linkSwitched;
                oldCatID = linkData?.oldCatID;

                // Bug #1 Fix: Update minecraftUuid in local session after successful link
                if (linkData?.user?.minecraftUuid) {
                  const currentSess = getSession();
                  if (currentSess) {
                    currentSess.minecraftUuid = linkData.user.minecraftUuid;
                    setActiveSession(currentSess);
                  }
                }
              } catch {
                updateApiToken(data.token);
              }
              logger.info("Server-side link successful");
            } else {
              const errorText = await linkResponse.text();
              logger.warn("Server-side link failed", { error: errorText });
              linkError = errorText || "เชื่อมต่อไม่สำเร็จ";
            }
          } else {
            logger.warn(
              "Could not link server-side: Missing Microsoft session info",
            );
            linkError = "ไม่พบข้อมูล Microsoft ในเซสชัน";
          }
        } catch (linkErr) {
          logger.error("Server-side link error", linkErr as Error);
          linkError = (linkErr as Error).message || "เชื่อมต่อไม่สำเร็จ";
        }
        // ============================================

        if (linkError) {
          return { ok: false, error: linkError };
        }

        // Sync instances after successful link
        const { syncCloudInstances } = await import("../cloud-instances.js");
        syncCloudInstances(data.token).catch((err) =>
          logger.error("Cloud sync failed", err),
        );

        return { ok: true, token: data.token, linkSwitched, oldCatID };
      } catch (error: any) {
        logger.error("Link CatID error", error);
        return {
          ok: false,
          error: error.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ",
        };
      }
    },
  );

  ipcMain.handle("auth-catid-login-token", async (_event, token: string) => {
    try {
      logger.info("Logging in with token...");
      const response = await fetch(`${ML_API_URL}/auth/catid/me`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      let data: any;
      try {
        data = await response.json();
      } catch {
        return {
          ok: false,
          error: response.ok
            ? "เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง"
            : `เกิดข้อผิดพลาด: ${response.status}`,
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          error: data.message || "Session หมดอายุหรือใช้ไม่ได้",
        };
      }

      const displayName = getCatIDDisplayName(data.user, "Player");
      const uuid = getCatIDSessionUuid(data.user, `catid-${Date.now()}`);

      const session: AuthSession = {
        type: "catid" as const,
        username: displayName,
        uuid,
        accessToken: token,
        minecraftUuid: data.user.minecraftUuid,
        createdAt: Date.now(),
      };

      setActiveSession(session);
      return { ok: true, session };
    } catch (error: any) {
      logger.error("Login with token error", error);
      return {
        ok: false,
        error: error.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ",
      };
    }
  });

  ipcMain.handle(
    "auth-unlink",
    async (_event, provider: "catid" | "microsoft") => {
      try {
        const session = getSession();

        if (!session) {
          return { ok: false, error: "ไม่ได้เข้าสู่ระบบ" };
        }

        // Unlink CatID from account - keeps Microsoft, removes CatID
        if (provider === "catid") {
          // Bug #4 & #5 Fix: Full cleanup of local session state
          // Since API-side unlink revokes ALL sessions, we must force re-login
          const cleanupLocalState = (forceLogout: boolean = false) => {
            logger.info("Cleaning up CatID link from local session");
            if (forceLogout) {
              // Bug #5 Fix: Server revoked all sessions, force full logout
              logout();
            } else {
              // Bug #4 Fix: Remove all CatID-related fields from local session
              delete session.apiToken;
              delete (session as any).apiTokenExpiresAt;
              delete session.minecraftUuid;
              setActiveSession(session);
            }
          };

          if (!session.apiToken) {
            logger.warn(
              "Unlink requested but no token found locally. Treating as success.",
            );
            const updatedAccount = { ...session };
            delete updatedAccount.apiToken;
            delete (updatedAccount as any).apiTokenExpiresAt;
            delete updatedAccount.minecraftUuid;
            cleanupLocalState();
            return {
              ok: true,
              message: "ยกเลิกการเชื่อมต่อสำเร็จ (Sync)",
              updatedAccount,
            };
          }

          logger.info("Unlinking CatID from account via API");

          // Call server to unlink CatID (keeps Microsoft)
          try {
            const response = await fetch(
              `${ML_API_URL}/auth/microsoft/unlink`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${session.apiToken}`,
                  "Content-Type": "application/json",
                },
              },
            );

            if (!response.ok) {
              logger.warn(
                "Server unlink returned error, treating as success for local cleanup",
                { status: response.status },
              );
              cleanupLocalState();
            } else {
              logger.info(
                "Server unlink successful - forcing re-login since sessions were revoked",
              );
              // Bug #5 Fix: Server deleted all sessions, force logout so user re-authenticates
              cleanupLocalState(true);
            }

            const updatedAccount = { ...session };
            delete updatedAccount.apiToken;
            delete (updatedAccount as any).apiTokenExpiresAt;
            delete updatedAccount.minecraftUuid;

            return {
              ok: true,
              message: "ยกเลิกการเชื่อมต่อสำเร็จ",
              forceRelogin: true,
              updatedAccount,
            };
          } catch (e) {
            logger.error("Server unlink network error", e as Error);
            const updatedAccount = { ...session };
            delete updatedAccount.apiToken;
            delete (updatedAccount as any).apiTokenExpiresAt;
            delete updatedAccount.minecraftUuid;
            cleanupLocalState();
            return {
              ok: true,
              message: "ยกเลิกการเชื่อมต่อในเครื่องสำเร็จ (Server unreachable)",
              updatedAccount,
            };
          }
        }

        // provider === "microsoft" is no longer valid
        // Once linked, unlinking removes CatID not Microsoft
        if (provider === "microsoft") {
          return {
            ok: false,
            error:
              "ไม่สามารถยกเลิกการเชื่อมต่อ Microsoft ได้ กรุณาออกจากระบบแทน",
          };
        }

        return { ok: false, error: "Invalid provider" };
      } catch (error: any) {
        logger.error("Unlink error", error);
        return { ok: false, error: error.message || "เกิดข้อผิดพลาด" };
      }
    },
  );

  // ----------------------------------------
  // Offline Auth Handler
  // ----------------------------------------

  ipcMain.handle("auth-offline-login", async (_event, username: string) => {
    if (!username || username.trim().length < 1) {
      return { ok: false, error: "กรุณาใส่ชื่อผู้ใช้" };
    }

    if (username.length > 16) {
      return { ok: false, error: "ชื่อผู้ใช้ต้องไม่เกิน 16 ตัวอักษร" };
    }

    try {
      const session = loginOffline(username.trim());
      return {
        ok: true,
        session: { username: session.username, uuid: session.uuid },
      };
    } catch (error: any) {
      return { ok: false, error: error.message || "เกิดข้อผิดพลาด" };
    }
  });

  logger.info("Auth handlers registered");
}
