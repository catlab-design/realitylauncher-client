/**
 * ========================================
 * Auth System - จัดการ Login/Logout
 * ========================================
 */

import { app, safeStorage } from "electron";
import path from "node:path";
import fs from "node:fs";

// ========================================
// ========================================
// Types
// ========================================

const AUTH_MODULE_ID = Math.random().toString(36).substring(7);
console.log(`[Auth] Module loaded. ID: ${AUTH_MODULE_ID}`);

export interface AuthSession {
    username: string;
    uuid: string;
    minecraftUuid?: string;     // Real Minecraft UUID (from Microsoft linking)
    accessToken?: string;
    refreshToken?: string;      // Microsoft refresh token
    tokenExpiresAt?: number;    // Unix timestamp when accessToken expires
    apiToken?: string;          // Reality API token for cloud features (instances, etc.)
    apiTokenExpiresAt?: number; // Unix timestamp when apiToken expires (from API session)
    type: "catid" | "microsoft" | "offline";
    createdAt: number;
}

// ========================================
// Auth State
// ========================================

// Use global variable to ensure singleton across multiple module instances
// This prevents race conditions when the module is loaded multiple times (e.g., HMR)
const globalAny = global as any;
if (!globalAny.__AUTH_SESSION_LOCK__) {
    globalAny.__AUTH_SESSION_LOCK__ = false;
}
let currentSession: AuthSession | null = globalAny.__AUTH_SESSION__ || null;

function syncFromGlobal() {
    currentSession = globalAny.__AUTH_SESSION__ || null;
}

function syncToGlobal() {
    globalAny.__AUTH_SESSION__ = currentSession;
}

/**
 * Get the path to the session file
 */
function getSessionPath(): string {
    return path.join(app.getPath("userData"), "session.dat");
}

/**
 * Get legacy session path (for migration)
 */
function getLegacySessionPath(): string {
    return path.join(app.getPath("userData"), "session.json");
}

/**
 * Load session from disk (with encryption support)
 */
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

        // Try loading legacy plain text session (for migration)
        if (fs.existsSync(legacyPath)) {
            const data = fs.readFileSync(legacyPath, "utf-8");
            currentSession = JSON.parse(data) as AuthSession;
            syncToGlobal();
            console.log("[Auth] Legacy session restored for:", currentSession.username);

            // Migrate to encrypted storage
            saveSession();

            // Delete legacy file
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

/**
 * Save session to disk (with encryption)
 */
function saveSession(): void {
    try {
        syncToGlobal(); // Ensure global is in sync before saving
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
                // Fallback to plain text if encryption not available
                fs.writeFileSync(sessionPath, data);
                console.warn("[Auth] Encryption not available, session saved as plain text");
            }
        } else {
            // Delete session file if logged out
            if (fs.existsSync(sessionPath)) {
                fs.unlinkSync(sessionPath);
            }
        }
    } catch (error) {
        console.error("[Auth] Failed to save session:", error);
    }
}

/**
 * Initialize auth system (load saved session)
 */
export function initAuth(): void {
    loadSession();
    if (currentSession) {
        console.log("[Auth] Restored session for:", currentSession.username);
    } else {
        console.log("[Auth] No saved session found");
    }
}

/**
 * Login with CatID (username/password via ml-api)
 */
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
        minecraftUuid,  // Real Minecraft UUID if linked with Microsoft
        accessToken: token,
        type: "catid",
        createdAt: Date.now(),
        tokenExpiresAt: expiresAt ? new Date(expiresAt).getTime() : undefined,
    };

    saveSession();
    console.log("[Auth] CatID login successful:", username, "UUID:", uuid, "MC:", minecraftUuid, "Expires:", expiresAt);

    return currentSession;
}

/**
 * Login with Microsoft (stores Minecraft access token and refresh token)
 */
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

/**
 * Update tokens for current session (used for token refresh)
 */
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

/**
 * Update API token for current session (Reality API access)
 */
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

/**
 * Clear API token for current session (used when token is invalid/expired)
 */
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

/**
 * Get API token for cloud features (falls back to accessToken for CatID)
 */
export function getApiToken(): string | undefined {
    const session = getSession();
    if (!session) return undefined;

    // For CatID users, accessToken IS the API token
    if (session.type === "catid") {
        if (session.tokenExpiresAt && Date.now() > session.tokenExpiresAt) {
            return undefined;
        }
        return session.accessToken;
    }

    // For Microsoft users, use dedicated apiToken (if not expired)
    if (session.apiTokenExpiresAt && Date.now() > session.apiTokenExpiresAt) {
        return undefined;
    }

    return session.apiToken;
}

/**
 * Check if current session token is expired or about to expire
 */
export function isTokenExpired(): boolean {
    // Sync from global
    currentSession = globalAny.__AUTH_SESSION__ || currentSession;

    if (!currentSession || currentSession.type !== "microsoft") {
        return false;
    }

    if (!currentSession.tokenExpiresAt) {
        // No expiry info - assume valid for 24 hours from creation
        const assumed24Hours = currentSession.createdAt + (24 * 60 * 60 * 1000);
        return Date.now() > assumed24Hours;
    }

    // Check if token expires within 5 minutes
    const fiveMinutes = 5 * 60 * 1000;
    return Date.now() > (currentSession.tokenExpiresAt - fiveMinutes);
}

/**
 * Login with offline account (username only, generates deterministic UUID)
 */
export function loginOffline(username: string): AuthSession {
    // Generate deterministic UUID using crypto for better distribution
    // Offline UUIDs use v3-style namespace hashing
    const crypto = require('node:crypto');
    const hash = crypto.createHash('md5').update(`OfflinePlayer:${username}`).digest('hex');
    // Format as UUID v3 (set version bits)
    const uuid = [
        hash.substring(0, 8),
        hash.substring(8, 12),
        '3' + hash.substring(13, 16), // version 3
        ((parseInt(hash.charAt(16), 16) & 0x3) | 0x8).toString(16) + hash.substring(17, 20), // variant bits
        hash.substring(20, 32)
    ].join('-');

    currentSession = {
        username,
        uuid,
        accessToken: "",  // No access token for offline
        type: "offline",
        createdAt: Date.now(),
    };

    saveSession();
    console.log("[Auth] Offline login successful:", username, "UUID:", uuid);

    return currentSession;
}

/**
 * Set active session (used when switching accounts)
 */
export function setActiveSession(session: AuthSession): void {
    console.log("[Auth DEBUG] setActiveSession called with token present:", !!session.apiToken);
    currentSession = session;
    saveSession();
    console.log("[Auth] Active session switched to:", session.username);
}

/**
 * Logout from current session
 */
export function logout(): void {
    currentSession = null;
    saveSession();
    console.log("[Auth] Logged out");
}

/**
 * Get current session
 */
export function getSession(): AuthSession | null {
    // Sync from global to get latest state from any module
    currentSession = globalAny.__AUTH_SESSION__ || currentSession;

    if (currentSession) {
        const sessionWithToken = { ...currentSession };
        const now = Date.now();

        // Clear expired Microsoft API token for safer callers
        if (sessionWithToken.apiTokenExpiresAt && now > sessionWithToken.apiTokenExpiresAt) {
            sessionWithToken.apiToken = undefined;
        }

        // Polyfill apiToken for CatID users (who use accessToken as apiToken)
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

/**
 * Check if user is logged in
 */
export function isLoggedIn(): boolean {
    return currentSession !== null;
}
