/**
 * ========================================
 * Discord RPC - ระบบแสดงสถานะบน Discord
 * ========================================
 * 
 * แสดงสถานะ "กำลังเล่น Reality Launcher" บน Discord
 * 
 * หมายเหตุ: ต้อง install discord-rpc package:
 * bun add discord-rpc
 */

// CommonJS format - require is available natively

// Discord Application ID (ต้องสร้างใน Discord Developer Portal)
const CLIENT_ID = "1449834700079366174"; // TODO: เปลี่ยนเป็น ID จริง

// ========================================
// Types
// ========================================

interface RPCActivity {
    details?: string;
    state?: string;
    largeImageKey?: string;
    largeImageText?: string;
    smallImageKey?: string;
    smallImageText?: string;
    startTimestamp?: number;
}

// ========================================
// RPC State
// ========================================

// Type for discord-rpc Client (using the installed @types/discord-rpc)
import type { Client as DiscordRPCClient } from "discord-rpc";

let rpcEnabled = true;
let rpcClient: DiscordRPCClient | null = null;
let startTimestamp = Date.now();

// ========================================
// Functions
// ========================================

/**
 * initDiscordRPC - เริ่มต้น Discord RPC
 */
export async function initDiscordRPC(): Promise<boolean> {
    if (!rpcEnabled) return false;

    try {
        // ใช้ require แทน dynamic import
        let RPC: any;
        try {
            RPC = require("discord-rpc");
        } catch (e) {
            console.log("[Discord RPC] Package not installed, skipping");
            return false;
        }

        rpcClient = new RPC.Client({ transport: "ipc" });

        rpcClient.on("ready", () => {
            console.log("[Discord RPC] Connected!");
            updateRPC("idle");
        });

        await rpcClient.login({ clientId: CLIENT_ID });
        return true;
    } catch (error) {
        console.error("[Discord RPC] Failed to initialize:", error);
        return false;
    }
}

/**
 * updateRPC - อัปเดตสถานะ Discord
 */
export async function updateRPC(
    status: "idle" | "playing" | "launching",
    serverName?: string
): Promise<void> {
    if (!rpcClient || !rpcEnabled) return;

    try {
        let activity: RPCActivity = {
            largeImageKey: "logo",
            largeImageText: "Reality Launcher",
            startTimestamp,
        };

        switch (status) {
            case "idle":
                activity.details = "อยู่หน้าหลัก";
                activity.state = "เลือกเซิร์ฟเวอร์...";
                break;
            case "launching":
                activity.details = "กำลังเปิดเกม...";
                activity.state = serverName || "Minecraft";
                break;
            case "playing":
                activity.details = "กำลังเล่น";
                activity.state = serverName || "Minecraft";
                activity.smallImageKey = "playing";
                activity.smallImageText = "กำลังเล่น";
                break;
        }

        await rpcClient.setActivity(activity);
    } catch (error) {
        console.error("[Discord RPC] Failed to update:", error);
    }
}

/**
 * destroyRPC - ปิด Discord RPC
 */
export async function destroyRPC(): Promise<void> {
    if (rpcClient) {
        try {
            // Clear activity first to remove status from Discord
            await rpcClient.clearActivity();
            console.log("[Discord RPC] Activity cleared");
        } catch (e) {
            console.log("[Discord RPC] Could not clear activity:", e);
        }

        try {
            rpcClient.destroy();
            rpcClient = null;
            console.log("[Discord RPC] Disconnected");
        } catch {
            // ignore
        }
    }
}

/**
 * setRPCEnabled - เปิด/ปิด Discord RPC
 */
export async function setRPCEnabled(enabled: boolean): Promise<void> {
    rpcEnabled = enabled;
    console.log("[Discord RPC] setRPCEnabled called:", enabled);
    if (!enabled) {
        await destroyRPC();
    } else if (!rpcClient) {
        await initDiscordRPC();
    }
}

/**
 * isRPCConnected - ตรวจสอบว่า RPC เชื่อมต่ออยู่หรือไม่
 */
export function isRPCConnected(): boolean {
    return rpcClient !== null;
}
