

import { app, safeStorage } from "electron";
import path from "node:path";
import fs from "node:fs";






const AUTH_MODULE_ID = Math.random().toString(36).substring(7);
console.log(`[Auth] Module loaded. ID: ${AUTH_MODULE_ID}`);

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


function getSessionPath(): string {
    return path.join(app.getPath("userData"), "session.dat");
}


function getLegacySessionPath(): string {
    return path.join(app.getPath("userData"), "session.json");
}


function loadSession(): AuthSession | null {
    try {
        const sessionPath = getSessionPath();
        const legacyPath = getLegacySessionPath();

        
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

        
        if (fs.existsSync(legacyPath)) {
            const data = fs.readFileSync(legacyPath, "utf-8");
            currentSession = JSON.parse(data) as AuthSession;
            syncToGlobal();
            console.log("[Auth] Legacy session restored for:", currentSession.username);

            
            saveSession();

            
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
                
                fs.writeFileSync(sessionPath, data);
                console.warn("[Auth] Encryption not available, session saved as plain text");
            }
        } else {
            
            if (fs.existsSync(sessionPath)) {
                fs.unlinkSync(sessionPath);
            }
        }
    } catch (error) {
        console.error("[Auth] Failed to save session:", error);
    }
}


export function initAuth(): void {
    loadSession();
    if (currentSession) {
        console.log("[Auth] Restored session for:", currentSession.username);
    } else {
        console.log("[Auth] No saved session found");
    }
}


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


export function getApiToken(): string | undefined {
    const session = getSession();
    if (!session) return undefined;

    
    if (session.type === "catid") {
        if (session.tokenExpiresAt && Date.now() > session.tokenExpiresAt) {
            return undefined;
        }
        return session.accessToken;
    }

    
    if (session.apiTokenExpiresAt && Date.now() > session.apiTokenExpiresAt) {
        return undefined;
    }

    return session.apiToken;
}


export function isTokenExpired(): boolean {
    
    currentSession = globalAny.__AUTH_SESSION__ || currentSession;

    if (!currentSession || currentSession.type !== "microsoft") {
        return false;
    }

    if (!currentSession.tokenExpiresAt) {
        
        const assumed24Hours = currentSession.createdAt + (24 * 60 * 60 * 1000);
        return Date.now() > assumed24Hours;
    }

    
    const fiveMinutes = 5 * 60 * 1000;
    return Date.now() > (currentSession.tokenExpiresAt - fiveMinutes);
}


export function loginOffline(username: string): AuthSession {
    
    
    const crypto = require('node:crypto');
    const hash = crypto.createHash('md5').update(`OfflinePlayer:${username}`).digest('hex');
    
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


export function setActiveSession(session: AuthSession): void {
    console.log("[Auth DEBUG] setActiveSession called with token present:", !!session.apiToken);
    currentSession = session;
    saveSession();
    console.log("[Auth] Active session switched to:", session.username);

    
    try {
        const { setPlayerInfo } = require("./discord.js");
        setPlayerInfo(session.minecraftUuid || session.uuid, session.username);
    } catch {
        
    }
}


export function logout(): void {
    currentSession = null;
    saveSession();
    console.log("[Auth] Logged out");
}


export function getSession(): AuthSession | null {
    
    currentSession = globalAny.__AUTH_SESSION__ || currentSession;

    if (currentSession) {
        const sessionWithToken = { ...currentSession };
        const now = Date.now();

        
        if (sessionWithToken.apiTokenExpiresAt && now > sessionWithToken.apiTokenExpiresAt) {
            sessionWithToken.apiToken = undefined;
        }

        
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


export function isLoggedIn(): boolean {
    return currentSession !== null;
}
