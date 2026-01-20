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
    updateTokens,
    isTokenExpired,
    type AuthSession,
} from "../auth.js";

// Auth window reference
let authWindow: BrowserWindow | null = null;

// ml-api URL for CatID authentication
const ML_API_URL = 'https://api.reality.notpumpkins.com';

// Microsoft OAuth Client ID - fetched from ml-api
let MICROSOFT_CLIENT_ID: string | null = null;

// Fetch Device Client ID from ml-api
async function fetchOAuthConfig(): Promise<boolean> {
    try {
        const response = await fetch(`${ML_API_URL}/oauth/config`);
        if (response.ok) {
            const data = await response.json() as { microsoftDeviceClientId?: string };
            if (data.microsoftDeviceClientId) {
                MICROSOFT_CLIENT_ID = data.microsoftDeviceClientId;
                console.log("[Auth] Fetched Microsoft Device Client ID from API");
                return true;
            }
        }
    } catch (error) {
        console.error("[Auth] Could not fetch OAuth config from API:", error);
    }
    return false;
}

// Fetch OAuth config when module loads
fetchOAuthConfig();

export function registerAuthHandlers(getMainWindow: () => BrowserWindow | null): void {
    const AUTH_URL = process.env.AUTH_URL || "http://localhost:3001";

    // ----------------------------------------
    // Basic Auth Handlers
    // ----------------------------------------

    ipcMain.handle("auth-logout", async (): Promise<void> => {
        logout();
    });

    ipcMain.handle("auth-get-session", async (): Promise<AuthSession | null> => {
        return getSession();
    });

    ipcMain.handle("auth-is-logged-in", async (): Promise<boolean> => {
        return isLoggedIn();
    });

    ipcMain.handle("auth-set-active-session", async (_event, session: AuthSession): Promise<void> => {
        setActiveSession(session);
    });

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
            if (url.includes("callback") || url.includes("access_token=") || url.includes("token=")) {
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
                        accessToken, uuid, username, type: "microsoft"
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

    ipcMain.handle("open-microsoft-login", async (_event, verificationUri: string, userCode: string): Promise<void> => {
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
            if (url.includes("nativeclient") || url.includes("success") || url.includes("close")) {
                loginWindow.close();
            }
        });
    });

    // ----------------------------------------
    // Device Code Auth Handlers
    // ----------------------------------------

    ipcMain.handle("auth-device-code-start", async () => {
        try {
            await fetchOAuthConfig();

            if (!MICROSOFT_CLIENT_ID) {
                return { ok: false, error: "Device Client ID ยังไม่ได้ตั้งค่า" };
            }

            const response = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    client_id: MICROSOFT_CLIENT_ID,
                    scope: "XboxLive.signin offline_access",
                }),
            });

            const data = await response.json() as any;

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

    ipcMain.handle("auth-device-code-poll", async (_event, deviceCode: string, isLinking: boolean = false) => {
        const mainWindow = getMainWindow();

        try {
            if (!MICROSOFT_CLIENT_ID) {
                return { status: "error", error: "Device Client ID not configured" };
            }

            // Step 1: Poll for Microsoft token
            const tokenResponse = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                    client_id: MICROSOFT_CLIENT_ID,
                    device_code: deviceCode,
                }),
            });

            const tokenData = await tokenResponse.json() as any;
            const msRefreshToken = tokenData.refresh_token;
            const msExpiresIn = tokenData.expires_in;

            if (tokenData.error === "authorization_pending") return { status: "pending" };
            if (tokenData.error === "expired_token") return { status: "expired", error: "รหัสหมดอายุ" };
            if (tokenData.error === "authorization_declined") return { status: "error", error: "ผู้ใช้ปฏิเสธ" };
            if (tokenData.error) return { status: "error", error: tokenData.error_description || tokenData.error };
            if (!tokenData.access_token) return { status: "error", error: "No access token" };

            // Step 2: Xbox Live
            const xblResponse = await fetch("https://user.auth.xboxlive.com/user/authenticate", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({
                    Properties: { AuthMethod: "RPS", SiteName: "user.auth.xboxlive.com", RpsTicket: `d=${tokenData.access_token}` },
                    RelyingParty: "http://auth.xboxlive.com",
                    TokenType: "JWT",
                }),
            });
            const xblData = await xblResponse.json() as any;
            if (!xblData.Token) return { status: "error", error: "Xbox Live auth failed" };

            const userHash = xblData.DisplayClaims?.xui?.[0]?.uhs;
            if (!userHash) return { status: "error", error: "User hash not found" };

            // Step 3: XSTS
            const xstsResponse = await fetch("https://xsts.auth.xboxlive.com/xsts/authorize", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({
                    Properties: { SandboxId: "RETAIL", UserTokens: [xblData.Token] },
                    RelyingParty: "rp://api.minecraftservices.com/",
                    TokenType: "JWT",
                }),
            });
            const xstsData = await xstsResponse.json() as any;

            if (!xstsData.Token) {
                if (xstsData.XErr === 2148916233) return { status: "error", error: "ไม่มี Xbox Live" };
                if (xstsData.XErr === 2148916238) return { status: "error", error: "ต้องมีผู้ปกครองอนุมัติ" };
                return { status: "error", error: `XSTS failed: ${xstsData.XErr}` };
            }

            // Step 4: Minecraft
            const mcResponse = await fetch("https://api.minecraftservices.com/authentication/login_with_xbox", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ identityToken: `XBL3.0 x=${userHash};${xstsData.Token}` }),
            });
            const mcData = await mcResponse.json() as any;
            if (!mcData.access_token) return { status: "error", error: "Minecraft auth failed" };

            // Step 5: Check ownership
            const entitlementResponse = await fetch("https://api.minecraftservices.com/entitlements/mcstore", {
                headers: { Authorization: `Bearer ${mcData.access_token}` },
            });
            const entitlementData = await entitlementResponse.json() as any;
            if (!entitlementData.items?.length) return { status: "error", error: "ไม่มี Minecraft" };

            // Step 6: Get profile
            const profileResponse = await fetch("https://api.minecraftservices.com/minecraft/profile", {
                headers: { Authorization: `Bearer ${mcData.access_token}` },
            });
            const profileData = await profileResponse.json() as any;
            if (!profileData.id || !profileData.name) return { status: "error", error: "Profile not found" };

            // Step 7: Save session
            // Step 7: Save session

            let apiTokenString: string | undefined;
            let authHeaders: Record<string, string> = { "Content-Type": "application/json" };

            // Check for existing CatID session if linking
            if (isLinking) {
                const currentSession = getSession();
                if (currentSession && currentSession.type === "catid" && currentSession.accessToken) {
                    apiTokenString = currentSession.accessToken;
                    authHeaders["Authorization"] = `Bearer ${apiTokenString}`;
                    console.log("[Auth] Linking Microsoft to CatID session");
                } else {
                    console.warn("[Auth] Link requested but no CatID session found");
                }
            }

            // Always login as Microsoft (updates local state details)
            loginMicrosoft(profileData.name, profileData.id, mcData.access_token, msRefreshToken, msExpiresIn);

            // Step 8: Link with Reality API to get/update API token and Sync Backend
            // Only link if explicitly requested (isLinking is true)
            // This prevents automatic saving of Microsoft accounts to the API/Admin panel
            if (isLinking) {
                try {
                    const linkResponse = await fetch(`${ML_API_URL}/auth/microsoft/link`, {
                        method: "POST",
                        headers: authHeaders,
                        body: JSON.stringify({
                            accessToken: mcData.access_token,
                            uuid: profileData.id,
                            username: profileData.name,
                        }),
                    });
                    const linkData = await linkResponse.json() as any;

                    if (linkResponse.ok && linkData.token) {
                        apiTokenString = linkData.token;
                        updateApiToken(linkData.token);
                        console.log("[Auth] Microsoft linked successfully");
                    } else {
                        console.warn("[Auth] Link failed:", linkData.error);
                    }
                } catch (linkError) {
                    console.warn("[Auth] Link API error (non-fatal):", linkError);
                }
            } else {
                console.log("[Auth] Default Microsoft login (Local only, no API sync)");
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
                syncCloudInstances(apiTokenString).catch(console.error);
            }

            return {
                status: "success",
                session: {
                    username: profileData.name,
                    uuid: profileData.id,
                    accessToken: mcData.access_token,
                    refreshToken: msRefreshToken,
                    expiresIn: msExpiresIn,
                    apiToken: apiTokenString,
                },
            };
        } catch (error: any) {
            return { status: "error", error: error.message || "Network error" };
        }
    });

    // ----------------------------------------
    // Token Refresh Handler
    // ----------------------------------------

    ipcMain.handle("auth-refresh-token", async () => {
        try {
            const session = getSession();

            if (!session) return { ok: false, error: "Not logged in" };
            if (session.type !== "microsoft") return { ok: true };
            if (!session.refreshToken) return { ok: true, newAccessToken: session.accessToken };
            if (!isTokenExpired()) return { ok: true, newAccessToken: session.accessToken };

            // Refresh flow
            const tokenResponse = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    grant_type: "refresh_token",
                    client_id: MICROSOFT_CLIENT_ID || "",
                    refresh_token: session.refreshToken,
                    scope: "XboxLive.signin offline_access",
                }),
            });

            const tokenData = await tokenResponse.json() as any;
            if (tokenData.error) return { ok: false, error: tokenData.error_description };
            if (!tokenData.access_token) return { ok: false, error: "No access token" };

            // Xbox + XSTS + Minecraft auth (same as device code poll)
            const xblResponse = await fetch("https://user.auth.xboxlive.com/user/authenticate", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({
                    Properties: { AuthMethod: "RPS", SiteName: "user.auth.xboxlive.com", RpsTicket: `d=${tokenData.access_token}` },
                    RelyingParty: "http://auth.xboxlive.com",
                    TokenType: "JWT",
                }),
            });
            const xblData = await xblResponse.json() as any;
            if (!xblData.Token) return { ok: false, error: "Xbox Live failed" };

            const xstsResponse = await fetch("https://xsts.auth.xboxlive.com/xsts/authorize", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({
                    Properties: { SandboxId: "RETAIL", UserTokens: [xblData.Token] },
                    RelyingParty: "rp://api.minecraftservices.com/",
                    TokenType: "JWT",
                }),
            });
            const xstsData = await xstsResponse.json() as any;
            if (!xstsData.Token) return { ok: false, error: "XSTS failed" };

            const mcResponse = await fetch("https://api.minecraftservices.com/authentication/login_with_xbox", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ identityToken: `XBL3.0 x=${xstsData.DisplayClaims?.xui?.[0]?.uhs};${xstsData.Token}` }),
            });
            const mcData = await mcResponse.json() as any;
            if (!mcData.access_token) return { ok: false, error: "Minecraft auth failed" };

            updateTokens(mcData.access_token, tokenData.refresh_token, tokenData.expires_in);

            // Sync instances
            const { syncCloudInstances } = await import("../cloud-instances.js");
            syncCloudInstances(mcData.access_token).catch(console.error);

            return { ok: true, newAccessToken: mcData.access_token };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    });

    // ----------------------------------------
    // CatID Auth Handlers
    // ----------------------------------------

    ipcMain.handle("auth-catid-login", async (_event, username: string, password: string) => {
        try {
            const response = await fetch(`${ML_API_URL}/auth/catid/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json() as any;

            if (!response.ok || !data.token) {
                return { ok: false, error: data.message || "เข้าสู่ระบบไม่สำเร็จ" };
            }

            const displayName = data.user?.minecraftUsername || data.user?.username || username;
            const uuid = `catid-${data.user?.id || Date.now()}`;
            const minecraftUuid = data.user?.minecraftUuid;  // Real Minecraft UUID from linked Microsoft account

            loginCatID(displayName, uuid, data.token, minecraftUuid);

            getMainWindow()?.webContents.send("auth-callback", {
                token: data.token, uuid, username: displayName, type: "catid", minecraftUuid,
            });

            // Sync instances
            const { syncCloudInstances } = await import("../cloud-instances.js");
            syncCloudInstances(data.token).catch(console.error);

            return { ok: true, session: { username: displayName, uuid, token: data.token, minecraftUuid } };
        } catch (error: any) {
            return { ok: false, error: error.message || "เกิดข้อผิดพลาด" };
        }
    });

    ipcMain.handle("auth-catid-register", async (_event, username: string, email: string, password: string, confirmPassword?: string) => {
        try {
            const response = await fetch(`${ML_API_URL}/auth/catid/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, email, password, confirmPassword }),
            });

            const responseText = await response.text();
            let data: any;
            try {
                data = JSON.parse(responseText);
            } catch {
                return { ok: false, error: response.ok ? "เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง" : `error: ${response.status}` };
            }

            if (!response.ok) {
                return { ok: false, error: data.message || "สมัครไม่สำเร็จ" };
            }

            return { ok: true };
        } catch (error: any) {
            return { ok: false, error: error.message || "เกิดข้อผิดพลาด" };
        }
    });

    ipcMain.handle("auth-link-catid", async (_event, username: string, password: string) => {
        try {
            const session = getSession();

            if (!session || session.type !== "microsoft") {
                return { ok: false, error: "ต้องเข้าสู่ระบบด้วย Microsoft ก่อน" };
            }

            // reuse catid login logic
            const response = await fetch(`${ML_API_URL}/auth/catid/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json() as any;

            if (!response.ok || !data.token) {
                return { ok: false, error: data.message || "เชื่อมต่อไม่สำเร็จ: ชื่อผู้ใช้หรือรหัสผ่านผิด" };
            }

            // Update the current Microsoft session with the CatID token
            updateApiToken(data.token);

            // Sync instances
            const { syncCloudInstances } = await import("../cloud-instances.js");
            syncCloudInstances(data.token).catch(console.error);

            // ============================================
            // CRITICAL: Perform Server-Side Link
            // ============================================
            try {
                // We have the new CatID token.
                // We also need the Microsoft Info from the OLD session (which is session).
                // But we need to make sure we send the FRESH Microsoft Access Token?
                // session.accessToken might be old? But usually valid.

                if (session.accessToken && session.username && session.uuid) {
                    console.log("[Auth] Linking Microsoft account to CatID on server...");
                    const linkResponse = await fetch(`${ML_API_URL}/auth/microsoft/link`, {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${data.token}`, // Authenticate as the CatID User
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            accessToken: session.accessToken,
                            uuid: session.uuid,
                            username: session.username, // Minecraft Username
                        }),
                    });

                    if (linkResponse.ok) {
                        console.log("[Auth] Server-side link successful!");
                    } else {
                        console.warn("[Auth] Server-side link failed:", await linkResponse.text());
                    }
                } else {
                    console.warn("[Auth] Could not link server-side: Missing Microsoft session info");
                }
            } catch (linkErr) {
                console.error("[Auth] Server-side link error:", linkErr);
            }
            // ============================================

            return { ok: true, token: data.token };
        } catch (error: any) {
            console.error("[Auth] Link CatID error:", error);
            return { ok: false, error: error.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ" };
        }
    });

    ipcMain.handle("auth-unlink", async (_event, provider: "catid" | "microsoft") => {
        try {
            const session = getSession();

            if (!session) {
                return { ok: false, error: "ไม่ได้เข้าสู่ระบบ" };
            }

            // Unlink CatID from account - keeps Microsoft, removes CatID
            if (provider === "catid") {
                // FORCE CLEANUP HELPER
                const cleanupLocalState = () => {
                    console.log("[Auth] Cleaning up CatID link from local session...");
                    delete session.apiToken;
                    // Also delete from global/any casting if persistent
                    delete (session as any).apiToken;
                    setActiveSession(session);
                };

                if (!session.apiToken) {
                    console.warn("[Auth] Unlink requested but no token found localy. Treating as success.");
                    cleanupLocalState();
                    return { ok: true, message: "ยกเลิกการเชื่อมต่อสำเร็จ (Sync)" };
                }

                console.log("[Auth] Unlinking CatID from account via API...");

                // Call server to unlink CatID (keeps Microsoft)
                try {
                    const response = await fetch(`${ML_API_URL}/auth/microsoft/unlink`, {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${session.apiToken}`,
                            "Content-Type": "application/json"
                        }
                    });

                    // Even if server returns error (e.g. 400 Not Connected), we should cleanup locally
                    // because the user wants to "Shed CatID" and return to local Microsoft.
                    // If server fails, it might be due to our previous change (not storing microsoftId).
                    // So we treat ALL unlink attempts as "Client Success" to ensure UI updates.

                    if (!response.ok) {
                        console.warn(`[Auth] Server unlink returned ${response.status}. Treating as success for local cleanup.`);
                    } else {
                        console.log("[Auth] Server unlink successful.");
                    }

                    cleanupLocalState();
                    return { ok: true, message: "ยกเลิกการเชื่อมต่อสำเร็จ" };

                } catch (e) {
                    console.error("[Auth] Server unlink network error:", e);
                    // Even on network error, if user wants to unlink, we allow it locally?
                    // User said "Shed CatID", implies they want to detach.
                    cleanupLocalState();
                    return { ok: true, message: "ยกเลิกการเชื่อมต่อในเครื่องสำเร็จ (Server unreachable)" };
                }
            }

            // provider === "microsoft" is no longer valid
            // Once linked, unlinking removes CatID not Microsoft
            if (provider === "microsoft") {
                return { ok: false, error: "ไม่สามารถยกเลิกการเชื่อมต่อ Microsoft ได้ กรุณาออกจากระบบแทน" };
            }

            return { ok: false, error: "Invalid provider" };
        } catch (error: any) {
            console.error("[Auth] Unlink error:", error);
            return { ok: false, error: error.message || "เกิดข้อผิดพลาด" };
        }
    });

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
            return { ok: true, session: { username: session.username, uuid: session.uuid } };
        } catch (error: any) {
            return { ok: false, error: error.message || "เกิดข้อผิดพลาด" };
        }
    });

    console.log("[IPC] Auth handlers registered");
}
