/**
 * ========================================
 * Auth System - ระบบ Authentication
 * ========================================
 * 
 * ไฟล์นี้จัดการระบบ login/logout ของ Launcher
 * 
 * ปัจจุบันรองรับ:
 * - Offline Mode - login ด้วยชื่อผู้เล่นอย่างเดียว
 * 
 * อนาคต (TODO):
 * - Microsoft Auth - login ด้วย Microsoft account
 * - Mojang Auth - login ด้วย Mojang account (deprecated)
 * 
 * โครงสร้างออกแบบให้ขยายได้ง่าย โดยใช้ AuthSession interface
 */

import { app } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

// ========================================
// Types - ประเภทข้อมูล
// ========================================

/**
 * AuthType - ประเภทการ authentication
 * 
 * @value 'offline' - login แบบ offline (ไม่ต้องใช้ account)
 * @value 'microsoft' - login ด้วย Microsoft account (TODO)
 */
export type AuthType = "offline" | "microsoft";

/**
 * AuthSession - ข้อมูล session หลัง login
 * 
 * @property type - ประเภทการ auth ('offline' หรือ 'microsoft')
 * @property username - ชื่อผู้เล่น (จะแสดงใน game)
 * @property uuid - Unique ID ของผู้เล่น (ใช้สำหรับ skin และ data)
 * @property accessToken - token สำหรับ auth กับ Minecraft servers (optional สำหรับ offline)
 * @property refreshToken - token สำหรับ refresh accessToken (optional)
 * @property expiresAt - timestamp ที่ token หมดอายุ (optional)
 * @property skinUrl - URL รูป skin (optional)
 */
export interface AuthSession {
    type: AuthType;
    username: string;
    uuid: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    skinUrl?: string;
}

// ========================================
// Paths - ที่อยู่ไฟล์
// ========================================

/**
 * getSessionPath - หา path ไปยังไฟล์ session.json
 * 
 * ไฟล์นี้เก็บ session ปัจจุบัน (ถ้า login อยู่)
 * บน Windows: %APPDATA%/ml-client/session.json
 */
function getSessionPath(): string {
    const userDataPath = app.getPath("userData");
    return path.join(userDataPath, "session.json");
}

// ========================================
// UUID Generation - สร้าง UUID
// ========================================

/**
 * generateOfflineUUID - สร้าง UUID สำหรับ offline mode
 * 
 * @param username - ชื่อผู้เล่น
 * @returns string - UUID v3 format (Minecraft-style)
 * 
 * Minecraft ใช้ UUID v3 โดย hash จาก "OfflinePlayer:" + username
 * ทำให้ UUID คงที่สำหรับชื่อเดียวกัน
 */
function generateOfflineUUID(username: string): string {
    // สร้าง MD5 hash จาก "OfflinePlayer:" + username
    // นี่คือวิธีที่ Minecraft server ใช้สำหรับ offline mode
    const data = `OfflinePlayer:${username}`;
    const hash = crypto.createHash("md5").update(data).digest("hex");

    // แปลงเป็น UUID format: xxxxxxxx-xxxx-3xxx-yxxx-xxxxxxxxxxxx
    // byte 6-7 = version 3
    // byte 8 = variant (8, 9, a, b)
    const uuid = [
        hash.substring(0, 8),
        hash.substring(8, 12),
        "3" + hash.substring(13, 16), // version 3
        ((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16) +
        hash.substring(18, 20), // variant
        hash.substring(20, 32),
    ].join("-");

    return uuid;
}

// ========================================
// Session Management - จัดการ Session
// ========================================

// In-memory session cache (เพื่อไม่ต้องอ่านไฟล์บ่อย)
let currentSession: AuthSession | null = null;

/**
 * loadSession - โหลด session จากไฟล์
 * 
 * @returns AuthSession | null - session ที่บันทึกไว้ หรือ null ถ้าไม่มี
 * 
 * เรียกตอน app เริ่มต้น เพื่อ restore session เดิม
 */
function loadSession(): AuthSession | null {
    const sessionPath = getSessionPath();

    try {
        if (!fs.existsSync(sessionPath)) {
            return null;
        }

        const rawData = fs.readFileSync(sessionPath, "utf-8");
        const session = JSON.parse(rawData) as AuthSession;

        // ตรวจสอบว่า session ยังไม่หมดอายุ (ถ้ามี expiresAt)
        if (session.expiresAt && Date.now() > session.expiresAt) {
            console.log("[Auth] Session expired, clearing...");
            clearSession();
            return null;
        }

        currentSession = session;
        return session;
    } catch (error) {
        console.error("[Auth] Error loading session:", error);
        return null;
    }
}

/**
 * saveSession - บันทึก session ลงไฟล์
 * 
 * @param session - session ที่ต้องการบันทึก
 */
function saveSession(session: AuthSession): void {
    const sessionPath = getSessionPath();
    const sessionDir = path.dirname(sessionPath);

    try {
        // สร้างโฟลเดอร์ถ้ายังไม่มี
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2), "utf-8");
        currentSession = session;
        console.log("[Auth] Session saved for:", session.username);
    } catch (error) {
        console.error("[Auth] Error saving session:", error);
        throw error;
    }
}

/**
 * clearSession - ลบ session (logout)
 */
function clearSession(): void {
    const sessionPath = getSessionPath();

    try {
        if (fs.existsSync(sessionPath)) {
            fs.unlinkSync(sessionPath);
        }
        currentSession = null;
        console.log("[Auth] Session cleared");
    } catch (error) {
        console.error("[Auth] Error clearing session:", error);
    }
}

// ========================================
// Public API - ฟังก์ชันสำหรับเรียกใช้
// ========================================

/**
 * loginOffline - Login แบบ offline mode
 * 
 * @param username - ชื่อผู้เล่น (3-16 ตัวอักษร, A-Za-z0-9_)
 * @returns AuthSession - session ที่สร้างขึ้น
 * @throws Error - ถ้า username ไม่ถูกต้อง
 * 
 * Offline mode:
 * - ไม่ต้องใช้ account
 * - UUID สร้างจาก username (คงที่สำหรับชื่อเดียวกัน)
 * - ใช้เล่นได้เฉพาะ server ที่ offline-mode=true
 * 
 * การใช้งาน:
 * ```typescript
 * const session = loginOffline("Player123");
 * console.log(session.uuid); // "a1b2c3d4-..."
 * ```
 */
export function loginOffline(username: string): AuthSession {
    // ========================================
    // Validation - ตรวจสอบ username
    // ========================================

    // Trim whitespace
    const trimmedName = username.trim();

    // ตรวจสอบความยาว (3-16 ตัวอักษร)
    if (trimmedName.length < 3 || trimmedName.length > 16) {
        throw new Error("Username must be 3-16 characters long");
    }

    // ตรวจสอบตัวอักษร (A-Za-z0-9_ เท่านั้น)
    const validPattern = /^[A-Za-z0-9_]+$/;
    if (!validPattern.test(trimmedName)) {
        throw new Error("Username can only contain letters, numbers, and underscores");
    }

    // ========================================
    // Create Session
    // ========================================

    const session: AuthSession = {
        type: "offline",
        username: trimmedName,
        uuid: generateOfflineUUID(trimmedName),
        // ไม่มี accessToken สำหรับ offline mode
        // ไม่มี expiresAt - offline session ไม่หมดอายุ
    };

    // บันทึก session
    saveSession(session);

    console.log("[Auth] Logged in offline as:", trimmedName);
    return session;
}

/**
 * logout - Logout จาก session ปัจจุบัน
 * 
 * ลบ session file และ clear memory
 */
export function logout(): void {
    clearSession();
    console.log("[Auth] Logged out");
}

/**
 * getSession - ดึง session ปัจจุบัน
 * 
 * @returns AuthSession | null - session ปัจจุบัน หรือ null ถ้าไม่ได้ login
 * 
 * ถ้ายังไม่เคย load จะ load จากไฟล์ก่อน
 */
export function getSession(): AuthSession | null {
    // ถ้ายังไม่ได้ load จาก file ให้ load ก่อน
    if (currentSession === null) {
        loadSession();
    }
    return currentSession;
}

/**
 * isLoggedIn - ตรวจสอบว่า login อยู่หรือไม่
 * 
 * @returns boolean - true ถ้า login อยู่
 */
export function isLoggedIn(): boolean {
    return getSession() !== null;
}

/**
 * initAuth - Initialize auth system
 * 
 * เรียกตอน app เริ่มต้น เพื่อ load session เดิม (ถ้ามี)
 */
export function initAuth(): void {
    loadSession();
    if (currentSession) {
        console.log("[Auth] Restored session for:", currentSession.username);
    }
}

// ========================================
// Future: Microsoft Auth (TODO)
// ========================================

/**
 * TODO: loginMicrosoft - Login ด้วย Microsoft account
 *
 * ขั้นตอน:
 * 1. เปิด browser ไปหน้า Microsoft login
 * 2. รับ authorization code
 * 3. แลก code เป็น access token
 * 4. ใช้ token ดึง Xbox Live token
 * 5. ใช้ Xbox token ดึง Minecraft token
 * 6. สร้าง AuthSession
 *
 * Reference: https://wiki.vg/Microsoft_Authentication_Scheme
 */
// export async function loginMicrosoft(): Promise<AuthSession> {
//   throw new Error("Microsoft Auth not implemented yet");
// }
