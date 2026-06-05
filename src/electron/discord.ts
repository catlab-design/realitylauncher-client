

import { app } from "electron";
import { createRequire } from "module";
import { isGameRunning } from "./MinecraftRun/gameProcess.js";


const customRequire = createRequire(__filename);


const CLIENT_ID = "1449834700079366174"; 

let appVersion = "";
try {
  appVersion = app.getVersion();
} catch {
  // Safe fallback if called before app is ready
}
const versionSuffix = appVersion ? ` v${appVersion}` : "";





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

export type DiscordRPCStatus =
  | "idle"
  | "playing"
  | "launching"
  | "browsing_home"
  | "browsing_explore"
  | "browsing_settings"
  | "browsing_wardrobe"
  | "browsing_about"
  | "browsing_admin"
  | "browsing_modpacks"
  | "browsing_servers";

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

  if (lower.startsWith("data:") || lower.startsWith("file:")) {
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


function getPlayerAvatarUrl(
  uuid?: string,
  avatarUrl?: string,
  avatarSource?: string
): string | undefined {
  if (avatarSource === "catid_avatar" && avatarUrl) {
    return avatarUrl;
  }

  if (!uuid || uuid.startsWith("catid-")) {
    if (avatarUrl) return avatarUrl;
    if (playerUsername) {
      return `https://crafthead.net/avatar/${playerUsername}/128`;
    }
    return undefined;
  }

  return `https://crafthead.net/avatar/${uuid}/128`;
}






import type { Client as DiscordRPCClient } from "discord-rpc";

let rpcEnabled = true;
let rpcClient: DiscordRPCClient | null = null;
let startTimestamp = Date.now();
let isReady = false;
let isInitializing = false;
let pendingActivity: {
  status: DiscordRPCStatus;
  serverName?: string;
  serverIcon?: string;
  serverSocialUrl?: string;
} | null = null;
let lastGameActivity: {
  status: "launching" | "playing";
  serverName?: string;
  serverIcon?: string;
  serverSocialUrl?: string;
} | null = null;

function isGameStatus(status: DiscordRPCStatus): status is "launching" | "playing" {
  return status === "launching" || status === "playing";
}

function resolveEffectiveActivity(activity: {
  status: DiscordRPCStatus;
  serverName?: string;
  serverIcon?: string;
  serverSocialUrl?: string;
}): {
  status: DiscordRPCStatus;
  serverName?: string;
  serverIcon?: string;
  serverSocialUrl?: string;
} {
  if (isGameStatus(activity.status)) {
    lastGameActivity = {
      status: activity.status,
      serverName: activity.serverName,
      serverIcon: activity.serverIcon,
      serverSocialUrl: activity.serverSocialUrl,
    };
    return activity;
  }

  if (isGameRunning()) {
    if (lastGameActivity) {
      return {
        status: "playing",
        serverName: lastGameActivity.serverName,
        serverIcon: lastGameActivity.serverIcon,
        serverSocialUrl: lastGameActivity.serverSocialUrl,
      };
    }
    return {
      status: "playing",
      serverName: "Minecraft",
    };
  }

  if (activity.status === "idle") {
    lastGameActivity = null;
  }

  return activity;
}


let playerUuid: string | undefined;
let playerUsername: string | undefined;
let playerAvatarUrl: string | undefined;
let playerAvatarSource: string | undefined;

export function setPlayerInfo(
  uuid?: string,
  username?: string,
  avatarUrl?: string,
  avatarSource?: string
): void {
  playerUuid = uuid;
  playerUsername = username;
  playerAvatarUrl = avatarUrl;
  playerAvatarSource = avatarSource;
  console.log("[Discord RPC] Player info set:", { uuid, username, avatarUrl, avatarSource });

  if (pendingActivity) {
    void updateRPC(
      pendingActivity.status,
      pendingActivity.serverName,
      pendingActivity.serverIcon,
      pendingActivity.serverSocialUrl
    );
  }
}


export async function initDiscordRPC(): Promise<boolean> {
  if (!rpcEnabled) return false;
  if (isInitializing) return false;
  if (rpcClient && isReady) return true;

  isInitializing = true;
  try {
    
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
      
      setTimeout(() => {
        if (pendingActivity) {
          const activityToRestore = pendingActivity;
          void updateRPC(
            activityToRestore.status,
            activityToRestore.serverName,
            activityToRestore.serverIcon,
            activityToRestore.serverSocialUrl,
          );
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


export async function updateRPC(
  status: DiscordRPCStatus,
  serverName?: string,
  serverIcon?: string,
  serverSocialUrl?: string,
): Promise<void> {
  if (!rpcEnabled) return;

  pendingActivity = { status, serverName, serverIcon, serverSocialUrl };
  const effectiveActivity = resolveEffectiveActivity(pendingActivity);

  if (!rpcClient || !isReady) {
    void initDiscordRPC();
    return;
  }

  try {
    const defaultButtons = [];
    if (effectiveActivity.serverSocialUrl) {
      let label = "Server Link";
      if (
        effectiveActivity.serverSocialUrl.includes("discord.gg") ||
        effectiveActivity.serverSocialUrl.includes("discord.com")
      ) {
        label = "Discord";
      } else if (
        effectiveActivity.serverSocialUrl.includes("youtube.com") ||
        effectiveActivity.serverSocialUrl.includes("youtu.be")
      ) {
        label = "YouTube";
      } else if (effectiveActivity.serverSocialUrl.includes("facebook.com")) {
        label = "Facebook";
      } else {
        label = "Website";
      }
      defaultButtons.push({ label, url: effectiveActivity.serverSocialUrl });
    }
    defaultButtons.push({
      label: `Reality Launcher${versionSuffix}`,
      url: "https://reality.catlabdesign.space"
    });

    const activity: RPCActivity = {
      startTimestamp,
      buttons: defaultButtons,
    };

    const resolvedIcon = resolveLargeImageKey(effectiveActivity.serverIcon);
    const headUrl = getPlayerAvatarUrl(playerUuid, playerAvatarUrl, playerAvatarSource);

    if (headUrl) {
      activity.smallImageKey = headUrl;
      activity.smallImageText = playerUsername || "Player";
    }

    switch (effectiveActivity.status) {
      case "idle":
        
        activity.largeImageKey = DEFAULT_LARGE_IMAGE_KEY;
        activity.largeImageText = `${DEFAULT_LARGE_IMAGE_TEXT}${versionSuffix}`;
        activity.details = "On Main Menu";
        activity.state = "Choosing a server...";
        break;

      case "launching":
        
        if (resolvedIcon) {
          activity.largeImageKey = resolvedIcon;
          activity.largeImageText = effectiveActivity.serverName || `${DEFAULT_LARGE_IMAGE_TEXT}${versionSuffix}`;
        } else {
          activity.largeImageKey = DEFAULT_LARGE_IMAGE_KEY;
          activity.largeImageText = `${DEFAULT_LARGE_IMAGE_TEXT}${versionSuffix}`;
        }
        if (!activity.smallImageKey) {
          activity.smallImageKey = INSTANCE_SMALL_IMAGE_KEY;
          activity.smallImageText = `${INSTANCE_SMALL_IMAGE_TEXT}${versionSuffix}`;
        }
        activity.details = "Launching...";
        activity.state = effectiveActivity.serverName || "Minecraft";
        break;

      case "playing":
        
        if (resolvedIcon) {
          activity.largeImageKey = resolvedIcon;
          activity.largeImageText = effectiveActivity.serverName || `${DEFAULT_LARGE_IMAGE_TEXT}${versionSuffix}`;
        } else {
          activity.largeImageKey = DEFAULT_LARGE_IMAGE_KEY;
          activity.largeImageText = `${DEFAULT_LARGE_IMAGE_TEXT}${versionSuffix}`;
        }
        if (!activity.smallImageKey) {
          activity.smallImageKey = INSTANCE_SMALL_IMAGE_KEY;
          activity.smallImageText = `${INSTANCE_SMALL_IMAGE_TEXT}${versionSuffix}`;
        }
        activity.details = "Playing";
        activity.state = effectiveActivity.serverName || "Minecraft";
        break;

      case "browsing_home":
        activity.largeImageKey = DEFAULT_LARGE_IMAGE_KEY;
        activity.largeImageText = `Home${versionSuffix}`;
        activity.details = "Browsing Home";
        activity.state = "Checking launcher dashboard";
        break;

      case "browsing_explore":
        activity.largeImageKey = DEFAULT_LARGE_IMAGE_KEY;
        activity.largeImageText = `Explore${versionSuffix}`;
        activity.details = "Browsing Explore";
        activity.state = "Finding mods and modpacks";
        break;

      case "browsing_settings":
        activity.largeImageKey = DEFAULT_LARGE_IMAGE_KEY;
        activity.largeImageText = `Settings${versionSuffix}`;
        activity.details = "Adjusting Settings";
        activity.state = "Tweaking launcher preferences";
        break;

      case "browsing_wardrobe":
        activity.largeImageKey = DEFAULT_LARGE_IMAGE_KEY;
        activity.largeImageText = `Wardrobe${versionSuffix}`;
        activity.details = "Customizing Skin";
        activity.state = "Previewing player cosmetics";
        break;

      case "browsing_about":
        activity.largeImageKey = DEFAULT_LARGE_IMAGE_KEY;
        activity.largeImageText = `About${versionSuffix}`;
        activity.details = "Viewing About";
        activity.state = "Reading launcher information";
        break;

      case "browsing_admin":
        activity.largeImageKey = DEFAULT_LARGE_IMAGE_KEY;
        activity.largeImageText = `Admin${versionSuffix}`;
        activity.details = "Admin Panel";
        activity.state = "Managing launcher data";
        break;

      case "browsing_modpacks":
        activity.largeImageKey = "modpack";
        activity.largeImageText = `Browsing Modpacks${versionSuffix}`;
        activity.details = "Browsing Modpacks";
        activity.state = "Looking for modpacks";
        break;

      case "browsing_servers":
        activity.largeImageKey = "server";
        activity.largeImageText = `Browsing Servers${versionSuffix}`;
        activity.details = "Browsing Servers";
        activity.state = "Looking for a server to play";
        break;
    }

    await rpcClient.setActivity(activity);
  } catch (error) {
    console.error("[Discord RPC] Failed to update:", error);
    isReady = false;
    const activityToRestore = pendingActivity;
    await destroyRPC();
    if (activityToRestore) {
      pendingActivity = activityToRestore;
    }
    void initDiscordRPC();
  }
}


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
    
  }

  try {
    await client.destroy();
    console.log("[Discord RPC] Disconnected");
  } catch {
    
  }
}


export async function setRPCEnabled(enabled: boolean): Promise<void> {
  rpcEnabled = enabled;
  console.log("[Discord RPC] setRPCEnabled called:", enabled);
  if (!enabled) {
    await destroyRPC();
  } else if (!rpcClient) {
    startTimestamp = Date.now(); 
    await initDiscordRPC();
  }
}


export function isRPCConnected(): boolean {
  return rpcClient !== null && isReady;
}
