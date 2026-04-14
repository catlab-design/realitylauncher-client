import { app, safeStorage } from "electron";
import path from "node:path";
import fs from "node:fs";

// Session type definition - represents an authenticated user session
export interface AuthSession {
  username: string;
  uuid: string;
  minecraftUuid?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  apiToken?: string;
  apiTokenExpiresAt?: number;
  type: "catid" | "microsoft" | "offline";
  createdAt: number;
}

// Global session storage - shared across module instances for Electron multi-process
const globalAny = global as any;
if (!globalAny.__AUTH_SESSION_LOCK__) {
  globalAny.__AUTH_SESSION_LOCK__ = false;
}
let currentSession: AuthSession | null = globalAny.__AUTH_SESSION__ || null;

// Sync helpers for global state
function syncFromGlobal() {
  currentSession = globalAny.__AUTH_SESSION__ || null;
}

function syncToGlobal() {
  globalAny.__AUTH_SESSION__ = currentSession;
}

// File path helpers
function getSessionPath(): string {
  return path.join(app.getPath("userData"), "session.dat");
}

function getLegacySessionPath(): string {
  return path.join(app.getPath("userData"), "session.json");
}

// Load session from disk - tries encrypted first, falls back to legacy unencrypted
function loadSession(): AuthSession | null {
  try {
    const sessionPath = getSessionPath();
    const legacyPath = getLegacySessionPath();

    // Try loading encrypted session first
    if (fs.existsSync(sessionPath)) {
      const fileData = fs.readFileSync(sessionPath);

      if (safeStorage.isEncryptionAvailable()) {
        try {
          const decrypted = safeStorage.decryptString(fileData);
          currentSession = JSON.parse(decrypted) as AuthSession;
          syncToGlobal();
          console.log("[Auth] Session restored (encrypted) for:", currentSession.username);
          return currentSession;
        } catch (e) {
          console.error("[Auth] Failed to decrypt session:", e);
        }
      }
    }

    // Try legacy unencrypted session for migration
    if (fs.existsSync(legacyPath)) {
      const data = fs.readFileSync(legacyPath, "utf-8");
      currentSession = JSON.parse(data) as AuthSession;
      syncToGlobal();
      console.log("[Auth] Legacy session restored for:", currentSession.username);

      // Migrate to encrypted storage
      saveSession();

      // Remove legacy file after successful migration
      try {
        fs.unlinkSync(legacyPath);
        console.log("[Auth] Migrated legacy session to encrypted storage");
      } catch { }

      return currentSession;
    }
  } catch (error) {
    console.error("[Auth] Failed to load session:", error);
  }
  return null;
}

// Save session to disk - uses encryption if available
function saveSession(): void {
  try {
    syncToGlobal();
    const sessionPath = getSessionPath();
    const dir = path.dirname(sessionPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (currentSession) {
      const data = JSON.stringify(currentSession);

      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(data);
        fs.writeFileSync(sessionPath, encrypted);
        console.log("[Auth] Session saved (encrypted)");
      } else {
        // Fallback to plain text if encryption not available (security risk)
        fs.writeFileSync(sessionPath, data);
        console.warn("[Auth] Encryption not available, session saved as plain text");
      }
    } else {
      // Remove session file if no active session
      if (fs.existsSync(sessionPath)) {
        fs.unlinkSync(sessionPath);
      }
    }
  } catch (error) {
    console.error("[Auth] Failed to save session:", error);
  }
}

// Initialize auth module on startup
export function initAuth(): void {
  loadSession();
  if (currentSession) {
    console.log("[Auth] Restored session for:", currentSession.username);
  } else {
    console.log("[Auth] No saved session found");
  }
}

// CatID login - stores CatID authentication session
export function loginCatID(
  username: string,
  uuid: string,
  token: string,
  minecraftUuid?: string,
  expiresAt?: string
): AuthSession {
  currentSession = {
    username,
    uuid,
    minecraftUuid,
    accessToken: token,
    type: "catid",
    createdAt: Date.now(),
    tokenExpiresAt: expiresAt ? new Date(expiresAt).getTime() : undefined,
  };

  saveSession();
  console.log("[Auth] CatID login successful:", username, "UUID:", uuid, "MC:", minecraftUuid, "Expires:", expiresAt);

  return currentSession;
}

// Microsoft login - stores Microsoft authentication session
export function loginMicrosoft(
  username: string,
  uuid: string,
  accessToken: string,
  refreshToken?: string,
  expiresIn?: number
): AuthSession {
  currentSession = {
    username,
    uuid,
    accessToken,
    refreshToken,
    tokenExpiresAt: expiresIn ? Date.now() + (expiresIn * 1000) : undefined,
    type: "microsoft",
    createdAt: Date.now(),
  };

  saveSession();
  console.log("[Auth] Microsoft login successful:", username, "UUID:", uuid);

  return currentSession;
}

// Update Microsoft tokens after refresh
export function updateTokens(accessToken: string, refreshToken?: string, expiresIn?: number): boolean {
  if (!currentSession || currentSession.type !== "microsoft") {
    return false;
  }

  currentSession.accessToken = accessToken;
  if (refreshToken) {
    currentSession.refreshToken = refreshToken;
  }
  if (expiresIn) {
    currentSession.tokenExpiresAt = Date.now() + (expiresIn * 1000);
  }

  saveSession();
  console.log("[Auth] Tokens updated for:", currentSession.username);
  return true;
}

// Update Reality API token (for cloud features)
export function updateApiToken(apiToken: string, expiresAt?: string): boolean {
  if (!currentSession) {
    return false;
  }

  currentSession.apiToken = apiToken;
  if (expiresAt) {
    currentSession.apiTokenExpiresAt = new Date(expiresAt).getTime();
  }
  saveSession();
  console.log("[Auth] API token updated for:", currentSession.username, "Expires:", expiresAt);
  return true;
}

// Clear Reality API token
export function clearApiToken(): boolean {
  if (!currentSession) {
    return false;
  }

  currentSession.apiToken = undefined;
  currentSession.apiTokenExpiresAt = undefined;
  saveSession();
  console.log("[Auth] API token cleared for:", currentSession.username);
  return true;
}

// Get current Reality API token if valid
export function getApiToken(): string | undefined {
  const session = getSession();
  if (!session) return undefined;

  // For CatID, use access token as API token
  if (session.type === "catid") {
    if (session.tokenExpiresAt && Date.now() > session.tokenExpiresAt) {
      return undefined;
    }
    return session.accessToken;
  }

  // For other types, use dedicated API token
  if (session.apiTokenExpiresAt && Date.now() > session.apiTokenExpiresAt) {
    return undefined;
  }

  return session.apiToken;
}

// Check if Microsoft access token is expired (with 5 min buffer)
export function isTokenExpired(): boolean {
  currentSession = globalAny.__AUTH_SESSION__ || currentSession;

  if (!currentSession || currentSession.type !== "microsoft") {
    return false;
  }

  // If no expiry time, assume 24 hours from creation
  if (!currentSession.tokenExpiresAt) {
    const assumed24Hours = currentSession.createdAt + (24 * 60 * 60 * 1000);
    return Date.now() > assumed24Hours;
  }

  // Consider expired 5 minutes before actual expiry to allow refresh
  const fiveMinutes = 5 * 60 * 1000;
  return Date.now() > (currentSession.tokenExpiresAt - fiveMinutes);
}

// Offline login - generates UUID from username using Minecraft's offline algorithm
export function loginOffline(username: string): AuthSession {
  const crypto = require('node:crypto');
  const hash = crypto.createHash('md5').update(`OfflinePlayer:${username}`).digest('hex');

  // Format hash as UUID v3 (offline player UUID format)
  const uuid = [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '3' + hash.substring(13, 16),
    ((parseInt(hash.charAt(16), 16) & 0x3) | 0x8).toString(16) + hash.substring(17, 20),
    hash.substring(20, 32)
  ].join('-');

  currentSession = {
    username,
    uuid,
    accessToken: "",
    type: "offline",
    createdAt: Date.now(),
  };

  saveSession();
  console.log("[Auth] Offline login successful:", username, "UUID:", uuid);

  return currentSession;
}

// Switch to a different session (e.g., account switching)
export function setActiveSession(session: AuthSession): void {
  console.log("[Auth DEBUG] setActiveSession called with token present:", !!session.apiToken);
  currentSession = session;
  saveSession();
  console.log("[Auth] Active session switched to:", session.username);

  // Update Discord RPC with new player info
  try {
    const { setPlayerInfo } = require("./discord.js");
    setPlayerInfo(session.minecraftUuid || session.uuid, session.username);
  } catch {
    // Discord module may not be loaded yet
  }
}

// Logout and clear session
export function logout(): void {
  currentSession = null;
  saveSession();
  console.log("[Auth] Logged out");
}

// Get current session with token validation
export function getSession(): AuthSession | null {
  currentSession = globalAny.__AUTH_SESSION__ || currentSession;

  if (currentSession) {
    const sessionWithToken = { ...currentSession };
    const now = Date.now();

    // Clear expired API token
    if (sessionWithToken.apiTokenExpiresAt && now > sessionWithToken.apiTokenExpiresAt) {
      sessionWithToken.apiToken = undefined;
    }

    // For CatID, set API token from access token if not expired
    if (sessionWithToken.type === "catid") {
      if (sessionWithToken.tokenExpiresAt && now > sessionWithToken.tokenExpiresAt) {
        sessionWithToken.apiToken = undefined;
      } else if (!sessionWithToken.apiToken) {
        sessionWithToken.apiToken = sessionWithToken.accessToken;
      }
    }

    return sessionWithToken;
  }
  return null;
}

// Check if user is logged in
export function isLoggedIn(): boolean {
  return currentSession !== null;
}
