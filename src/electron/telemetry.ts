/**
 * ========================================
 * Telemetry Service - ส่งข้อมูลการใช้งานไป API
 * ========================================
 * 
 * ส่งข้อมูล telemetry แบบ anonymous เพื่อปรับปรุง launcher
 * ผู้ใช้สามารถปิด telemetry ได้ใน Settings
 */

import { app } from "electron";
import { getConfig, setConfig } from "./config.js";

// API URL
const API_URL = process.env.API_URL || "https://api.reality.notpumpkins.com";

// Event types
export const TELEMETRY_EVENTS = {
    APP_OPEN: "app_open",
    APP_CLOSE: "app_close",
    GAME_LAUNCH: "game_launch",
    GAME_CLOSE: "game_close",
    INSTANCE_CREATE: "instance_create",
    MOD_INSTALL: "mod_install",
    ERROR: "error",
} as const;

export type TelemetryEventType = typeof TELEMETRY_EVENTS[keyof typeof TELEMETRY_EVENTS];

// Session tracking
let sessionStartTime: Date | null = null;
let gameStartTimes: Map<string, Date> = new Map();

/**
 * Get or generate unique client ID
 * This is anonymous and not linked to any user identity
 */
function getClientId(): string {
    const config = getConfig();

    // Check if clientId exists in config
    if ((config as any).clientId) {
        return (config as any).clientId;
    }

    // Generate new UUID
    const clientId = crypto.randomUUID();

    // Save to config
    setConfig({ clientId } as any);

    return clientId;
}

/**
 * Check if telemetry is enabled
 */
function isTelemetryEnabled(): boolean {
    const config = getConfig();
    return config.telemetryEnabled !== false; // Default to true if not set
}

/**
 * Get launcher version
 */
function getLauncherVersion(): string {
    return app.getVersion();
}

/**
 * Get platform
 */
function getPlatform(): string {
    return process.platform; // win32, darwin, linux
}

/**
 * Get locale from config
 */
function getLocale(): string {
    const config = getConfig();
    return config.language || "th";
}

/**
 * Send telemetry event to API
 */
async function sendEvent(
    eventType: TelemetryEventType,
    data?: Record<string, any>,
    userId?: string
): Promise<void> {
    // Check if telemetry is enabled
    if (!isTelemetryEnabled()) {
        console.log("[Telemetry] Disabled, skipping event:", eventType);
        return;
    }

    try {
        const payload = {
            eventType,
            clientId: getClientId(),
            userId: userId || undefined,
            data: data || undefined,
            launcherVersion: getLauncherVersion(),
            platform: getPlatform(),
            locale: getLocale(),
        };

        console.log("[Telemetry] Sending event:", eventType, data);

        const response = await fetch(`${API_URL}/telemetry/event`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            console.error("[Telemetry] Failed to send event:", response.status);
        }
    } catch (error) {
        // Silently fail - telemetry should not affect user experience
        console.error("[Telemetry] Error sending event:", error);
    }
}

// ========================================
// Event Tracking Functions
// ========================================

/**
 * Track app open
 */
export function trackAppOpen(): void {
    sessionStartTime = new Date();

    const config = getConfig();
    const isFirstLaunch = !(config as any).hasLaunchedBefore;

    if (isFirstLaunch) {
        setConfig({ hasLaunchedBefore: true } as any);
    }

    sendEvent(TELEMETRY_EVENTS.APP_OPEN, {
        firstLaunch: isFirstLaunch,
    });
}

/**
 * Track app close
 */
export function trackAppClose(): void {
    let sessionDuration = 0;

    if (sessionStartTime) {
        sessionDuration = Math.floor((Date.now() - sessionStartTime.getTime()) / 1000);
    }

    sendEvent(TELEMETRY_EVENTS.APP_CLOSE, {
        sessionDuration,
    });
}

/**
 * Track game launch
 */
export function trackGameLaunch(
    instanceId: string,
    version: string,
    loader?: string,
    userId?: string
): void {
    gameStartTimes.set(instanceId, new Date());

    sendEvent(TELEMETRY_EVENTS.GAME_LAUNCH, {
        instanceId,
        version,
        loader: loader || "vanilla",
    }, userId);
}

/**
 * Track game close
 */
export function trackGameClose(instanceId: string, userId?: string): void {
    const startTime = gameStartTimes.get(instanceId);
    let playtime = 0;

    if (startTime) {
        playtime = Math.floor((Date.now() - startTime.getTime()) / 1000);
        gameStartTimes.delete(instanceId);
    }

    sendEvent(TELEMETRY_EVENTS.GAME_CLOSE, {
        instanceId,
        playtime,
    }, userId);
}

/**
 * Track instance creation
 */
export function trackInstanceCreate(
    version: string,
    loader: string,
    source?: string,
    userId?: string
): void {
    sendEvent(TELEMETRY_EVENTS.INSTANCE_CREATE, {
        version,
        loader,
        source: source || "manual",
    }, userId);
}

/**
 * Track mod installation
 */
export function trackModInstall(
    modId: string,
    source: string,
    userId?: string
): void {
    sendEvent(TELEMETRY_EVENTS.MOD_INSTALL, {
        modId,
        source,
    }, userId);
}

/**
 * Track error
 */
export function trackError(
    message: string,
    context?: string,
    stack?: string
): void {
    sendEvent(TELEMETRY_EVENTS.ERROR, {
        message: message.substring(0, 500), // Limit message length
        context,
        stack: stack ? stack.substring(0, 1000) : undefined, // Limit stack length
    });
}

// ========================================
// Initialize & Cleanup
// ========================================

/**
 * Initialize telemetry
 * Call this when app is ready
 */
export function initTelemetry(): void {
    console.log("[Telemetry] Initializing...");
    console.log("[Telemetry] Enabled:", isTelemetryEnabled());
    console.log("[Telemetry] Client ID:", getClientId());

    // Track app open
    trackAppOpen();
}

/**
 * Cleanup telemetry
 * Call this before app quit
 */
export function cleanupTelemetry(): void {
    console.log("[Telemetry] Cleaning up...");

    // Track app close
    trackAppClose();
}

export default {
    initTelemetry,
    cleanupTelemetry,
    trackAppOpen,
    trackAppClose,
    trackGameLaunch,
    trackGameClose,
    trackInstanceCreate,
    trackModInstall,
    trackError,
    TELEMETRY_EVENTS,
};
