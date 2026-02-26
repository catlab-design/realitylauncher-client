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

import { createRequire } from "module";

// CJS-compatible require for discord-rpc (esbuild outputs CJS)
const customRequire = createRequire(__filename);

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
  buttons?: Array<{ label: string; url: string }>;
}

const DEFAULT_LARGE_IMAGE_KEY = "logo";
const DEFAULT_LARGE_IMAGE_TEXT = "Reality Launcher";
const INSTANCE_SMALL_IMAGE_KEY = "r_nobg";
const INSTANCE_SMALL_IMAGE_TEXT = "Reality Launcher";

const ASSET_KEY_PATTERN = /^[a-z0-9_.-]+$/i;

function resolveLargeImageKey(icon?: string): string | undefined {
  if (!icon) return undefined;
  const trimmed = icon.trim();
  if (!trimmed) return undefined;

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return trimmed;
  }

  if (lower.startsWith("data:") || lower.startsWith("file://")) {
    return undefined;
  }

  if (trimmed.includes("/") || trimmed.includes("\\")) {
    return undefined;
  }

  if (!ASSET_KEY_PATTERN.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}

/**
 * Get Minecraft head URL from UUID (via mc-heads.net)
 */
function getPlayerHeadUrl(uuid?: string): string | undefined {
  if (!uuid) return undefined;
  // mc-heads.net provides head renders, works as Discord RPC image URL
  return `https://mc-heads.net/avatar/${uuid}/128`;
}

// ========================================
// RPC State
// ========================================

// Type for discord-rpc Client (using the installed @types/discord-rpc)
import type { Client as DiscordRPCClient } from "discord-rpc";

let rpcEnabled = true;
let rpcClient: DiscordRPCClient | null = null;
let startTimestamp = Date.now();
let isReady = false;
let isInitializing = false;
let pendingActivity: {
  status:
    | "idle"
    | "playing"
    | "launching"
    | "browsing_modpacks"
    | "browsing_servers";
  serverName?: string;
  serverIcon?: string;
  serverSocialUrl?: string;
} | null = null;

// Player info for small image
let playerUuid: string | undefined;
let playerUsername: string | undefined;

// ========================================
// Functions
// ========================================

/**
 * setPlayerInfo - ตั้งค่าข้อมูลผู้เล่น (สำหรับแสดง MC head)
 */
export function setPlayerInfo(uuid?: string, username?: string): void {
  playerUuid = uuid;
  playerUsername = username;
  console.log("[Discord RPC] Player info set:", { uuid, username });
}

/**
 * initDiscordRPC - เริ่มต้น Discord RPC
 */
export async function initDiscordRPC(): Promise<boolean> {
  if (!rpcEnabled) return false;
  if (isInitializing) return false;
  if (rpcClient && isReady) return true;

  isInitializing = true;
  try {
    // ใช้ customRequire สำหรับ CJS compatibility
    let RPC: any;
    try {
      RPC = customRequire("discord-rpc");
    } catch (e) {
      console.log("[Discord RPC] Package not installed, skipping");
      return false;
    }

    rpcClient = new RPC.Client({ transport: "ipc" });

    rpcClient!.on("ready", () => {
      console.log("[Discord RPC] Connected!");
      isReady = true;
      isInitializing = false;
      // Add small delay to ensure socket is fully initialized
      setTimeout(() => {
        if (pendingActivity) {
          void updateRPC(
            pendingActivity.status,
            pendingActivity.serverName,
            pendingActivity.serverIcon,
            pendingActivity.serverSocialUrl,
          );
          pendingActivity = null;
        } else {
          void updateRPC("idle");
        }
      }, 500);
    });

    await rpcClient!.login({ clientId: CLIENT_ID });
    isInitializing = false;
    return true;
  } catch (error) {
    console.error("[Discord RPC] Failed to initialize:", error);
    isReady = false;
    isInitializing = false;
    return false;
  }
}

/**
 * updateRPC - อัปเดตสถานะ Discord
 */
export async function updateRPC(
  status:
    | "idle"
    | "playing"
    | "launching"
    | "browsing_modpacks"
    | "browsing_servers",
  serverName?: string,
  serverIcon?: string,
  serverSocialUrl?: string,
): Promise<void> {
  if (!rpcEnabled) return;

  pendingActivity = { status, serverName, serverIcon, serverSocialUrl };

  if (!rpcClient || !isReady) {
    void initDiscordRPC();
    return;
  }

  try {
    const defaultButtons = [];
    if (serverSocialUrl) {
      let label = "Server Link";
      if (
        serverSocialUrl.includes("discord.gg") ||
        serverSocialUrl.includes("discord.com")
      ) {
        label = "Discord";
      } else if (
        serverSocialUrl.includes("youtube.com") ||
        serverSocialUrl.includes("youtu.be")
      ) {
        label = "YouTube";
      } else if (serverSocialUrl.includes("facebook.com")) {
        label = "Facebook";
      } else {
        label = "Website";
      }
      defaultButtons.push({ label, url: serverSocialUrl });
    }
    defaultButtons.push({
      label: "Reality Launcher",
      url: "https://reality.catlabdesign.space/",
    });

    const activity: RPCActivity = {
      startTimestamp,
      buttons: defaultButtons,
    };

    const resolvedIcon = resolveLargeImageKey(serverIcon);
    const headUrl = getPlayerHeadUrl(playerUuid);

    switch (status) {
      case "idle":
        // Idle: Large = Reality Launcher logo, Small = Player MC head
        activity.largeImageKey = DEFAULT_LARGE_IMAGE_KEY;
        activity.largeImageText = DEFAULT_LARGE_IMAGE_TEXT;
        if (headUrl) {
          activity.smallImageKey = headUrl;
          activity.smallImageText = playerUsername || "Player";
        }
        activity.details = "On Main Menu";
        activity.state = "Choosing a server...";
        break;

      case "launching":
        // Launching: Large = instance icon or logo, Small = r_nobg
        if (resolvedIcon) {
          activity.largeImageKey = resolvedIcon;
          activity.largeImageText = serverName || DEFAULT_LARGE_IMAGE_TEXT;
        } else {
          activity.largeImageKey = DEFAULT_LARGE_IMAGE_KEY;
          activity.largeImageText = DEFAULT_LARGE_IMAGE_TEXT;
        }
        activity.smallImageKey = INSTANCE_SMALL_IMAGE_KEY;
        activity.smallImageText = INSTANCE_SMALL_IMAGE_TEXT;
        activity.details = "Launching...";
        activity.state = serverName || "Minecraft";
        break;

      case "playing":
        // Playing: Large = instance icon or logo, Small = r_nobg
        if (resolvedIcon) {
          activity.largeImageKey = resolvedIcon;
          activity.largeImageText = serverName || DEFAULT_LARGE_IMAGE_TEXT;
        } else {
          activity.largeImageKey = DEFAULT_LARGE_IMAGE_KEY;
          activity.largeImageText = DEFAULT_LARGE_IMAGE_TEXT;
        }
        activity.smallImageKey = INSTANCE_SMALL_IMAGE_KEY;
        activity.smallImageText = INSTANCE_SMALL_IMAGE_TEXT;
        activity.details = "Playing";
        activity.state = serverName || "Minecraft";
        break;

      case "browsing_modpacks":
        activity.largeImageKey = "modpack";
        activity.largeImageText = "Browsing Modpacks";
        activity.details = "Browsing Modpacks";
        activity.state = "Looking for modpacks";
        break;

      case "browsing_servers":
        activity.largeImageKey = "server";
        activity.largeImageText = "Browsing Servers";
        activity.details = "Browsing Servers";
        activity.state = "Looking for a server to play";
        break;
    }

    await rpcClient.setActivity(activity);
  } catch (error) {
    console.error("[Discord RPC] Failed to update:", error);
    isReady = false;
    await destroyRPC();
    void initDiscordRPC();
  }
}

/**
 * destroyRPC - ปิด Discord RPC
 */
export async function destroyRPC(): Promise<void> {
  const client = rpcClient;
  rpcClient = null;
  isReady = false;
  isInitializing = false;
  pendingActivity = null;

  if (!client) return;

  try {
    await client.clearActivity();
    console.log("[Discord RPC] Activity cleared");
  } catch {
    // Socket may already be closed
  }

  try {
    await client.destroy();
    console.log("[Discord RPC] Disconnected");
  } catch {
    // ignore
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
    startTimestamp = Date.now(); // Reset timestamp on reconnect
    await initDiscordRPC();
  }
}

/**
 * isRPCConnected - ตรวจสอบว่า RPC เชื่อมต่ออยู่หรือไม่
 */
export function isRPCConnected(): boolean {
  return rpcClient !== null && isReady;
}
