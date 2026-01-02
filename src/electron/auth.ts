/**
 * ========================================
 * Auth System - จัดการ Login/Logout
 * ========================================
 */

import { app } from "electron";
import path from "node:path";
import fs from "node:fs";

// ========================================
// Types
// ========================================

export interface AuthSession {
    username: string;
    uuid: string;
    accessToken?: string;
    type: "catid" | "microsoft" | "offline";
    createdAt: number;
}

// ========================================
// Auth State
// ========================================

let currentSession: AuthSession | null = null;

/**
 * Get the path to the session file
 */
function getSessionPath(): string {
    return path.join(app.getPath("userData"), "session.json");
}

/**
 * Load session from disk
 */
function loadSession(): AuthSession | null {
    try {
        const sessionPath = getSessionPath();
        if (fs.existsSync(sessionPath)) {
            const data = fs.readFileSync(sessionPath, "utf-8");
            currentSession = JSON.parse(data) as AuthSession;
            console.log("[Auth] Session restored for:", currentSession.username);
            return currentSession;
        }
    } catch (error) {
        console.error("[Auth] Failed to load session:", error);
    }
    return null;
}

/**
 * Save session to disk
 */
function saveSession(): void {
    try {
        const sessionPath = getSessionPath();
        const dir = path.dirname(sessionPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        if (currentSession) {
            fs.writeFileSync(sessionPath, JSON.stringify(currentSession, null, 2));
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
export function loginCatID(username: string, uuid: string, token: string): AuthSession {
    currentSession = {
        username,
        uuid,
        accessToken: token,
        type: "catid",
        createdAt: Date.now(),
    };

    saveSession();
    console.log("[Auth] CatID login successful:", username, "UUID:", uuid);

    return currentSession;
}

/**
 * Login with Microsoft (stores Minecraft access token)
 */
export function loginMicrosoft(username: string, uuid: string, accessToken: string): AuthSession {
    currentSession = {
        username,
        uuid,
        accessToken,
        type: "microsoft",
        createdAt: Date.now(),
    };

    saveSession();
    console.log("[Auth] Microsoft login successful:", username, "UUID:", uuid);

    return currentSession;
}

/**
 * Login with offline account (username only, generates deterministic UUID)
 */
export function loginOffline(username: string): AuthSession {
    // Generate deterministic UUID based on username (offline UUIDs start with 0-)
    const hash = username.split("").reduce((acc, char) => {
        return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);
    const uuid = `0-0-0-0-${Math.abs(hash).toString(16).padStart(12, "0")}`;

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
    return currentSession ? { ...currentSession } : null;
}

/**
 * Check if user is logged in
 */
export function isLoggedIn(): boolean {
    return currentSession !== null;
}
