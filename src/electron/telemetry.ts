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
import { getSession } from "./auth.js";

// API URL (hardcoded for bundled Electron - process.env doesn't work in production)
import { API_URL } from "./lib/constants.js";

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
let flushTimer: NodeJS.Timeout | null = null;
let isFlushing = false;

const telemetryQueue: Array<{
    eventType: TelemetryEventType;
    clientId: string;
    userId?: string;
    data?: Record<string, any>;
    launcherVersion: string;
    platform: string;
    locale: string;
}> = [];

const TELEMETRY_BATCH_SIZE = 20;
const TELEMETRY_FLUSH_INTERVAL_MS = 30 * 1000;
const TELEMETRY_MAX_QUEUE_SIZE = 500;
const TELEMETRY_USER_ID_CACHE_MS = 10 * 60 * 1000;
const TELEMETRY_USER_ID_RESOLVE_TIMEOUT_MS = 2000;

let cachedTokenUserId: string | null = null;
let cachedTokenValue: string | null = null;
let cachedTokenResolvedAt = 0;
let tokenUserIdResolvePromise: Promise<string | undefined> | null = null;

function extractCatIdUserId(uuid?: string | null): string | undefined {
    if (!uuid || !uuid.startsWith("catid-")) {
        return undefined;
    }

    const extracted = uuid.slice("catid-".length).trim();
    return extracted || undefined;
}

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
 * Flush queued telemetry events to API
 */
async function flushTelemetryQueue(force: boolean = false): Promise<void> {
    if (isFlushing) return;
    if (telemetryQueue.length === 0) return;

    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }

    isFlushing = true;
    const batchSize = force ? telemetryQueue.length : Math.min(telemetryQueue.length, TELEMETRY_BATCH_SIZE);
    const events = telemetryQueue.splice(0, batchSize);

    try {
        const response = await fetch(`${API_URL}/telemetry/batch`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ events }),
        });

        if (!response.ok) {
            throw new Error(`Batch send failed (${response.status})`);
        }
    } catch (error) {
        // Requeue on failure, preserving order
        telemetryQueue.unshift(...events);
        if (telemetryQueue.length > TELEMETRY_MAX_QUEUE_SIZE) {
            telemetryQueue.splice(0, telemetryQueue.length - TELEMETRY_MAX_QUEUE_SIZE);
        }
        console.error("[Telemetry] Batch flush error:", error);
    } finally {
        isFlushing = false;
    }

    if (telemetryQueue.length > 0 && !force) {
        scheduleTelemetryFlush();
    }
}

function scheduleTelemetryFlush(): void {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        void flushTelemetryQueue();
    }, TELEMETRY_FLUSH_INTERVAL_MS);
}

function getCachedTokenUserId(token?: string): string | undefined {
    if (!token) {
        return undefined;
    }

    if (cachedTokenValue !== token || !cachedTokenUserId) {
        return undefined;
    }

    if (Date.now() - cachedTokenResolvedAt > TELEMETRY_USER_ID_CACHE_MS) {
        return undefined;
    }

    return cachedTokenUserId;
}

/**
 * Resolve CatID user ID from active session with cache + API fallback.
 * Uses /auth/session/me for linked Microsoft sessions that don't have catid-* UUID.
 */
export async function resolveTelemetryUserIdForSession(sessionOverride?: {
    uuid?: string;
    apiToken?: string;
} | null): Promise<string | undefined> {
    const session = sessionOverride || getSession();
    if (!session) {
        return undefined;
    }

    const fromUuid = extractCatIdUserId(session.uuid);
    if (fromUuid) {
        return fromUuid;
    }

    const token = session.apiToken?.trim();
    if (!token) {
        return undefined;
    }

    const cached = getCachedTokenUserId(token);
    if (cached) {
        return cached;
    }

    if (tokenUserIdResolvePromise && cachedTokenValue === token) {
        return tokenUserIdResolvePromise;
    }

    cachedTokenValue = token;
    tokenUserIdResolvePromise = (async () => {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), TELEMETRY_USER_ID_RESOLVE_TIMEOUT_MS);

            try {
                const response = await fetch(`${API_URL}/auth/session/me`, {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                    signal: controller.signal,
                });

                if (!response.ok) {
                    return undefined;
                }

                const payload = await response.json() as { id?: string };
                const resolvedId = payload.id?.trim();
                if (!resolvedId) {
                    return undefined;
                }

                cachedTokenUserId = resolvedId;
                cachedTokenResolvedAt = Date.now();
                return resolvedId;
            } finally {
                clearTimeout(timeout);
            }
        } catch {
            return undefined;
        } finally {
            tokenUserIdResolvePromise = null;
        }
    })();

    return tokenUserIdResolvePromise;
}

/**
 * Resolve current authenticated user ID for queueing without waiting on network.
 */
function resolveTelemetryUserId(explicitUserId?: string): string | undefined {
    if (explicitUserId && explicitUserId.trim()) {
        return explicitUserId.trim();
    }

    const session = getSession();
    if (!session) {
        return undefined;
    }

    const fromUuid = extractCatIdUserId(session.uuid);
    if (fromUuid) {
        return fromUuid;
    }

    const token = session.apiToken?.trim();
    const cached = getCachedTokenUserId(token);
    if (cached) {
        return cached;
    }

    return undefined;
}

/**
 * Queue telemetry event for batched API send
 */
function queueEvent(
    eventType: TelemetryEventType,
    data?: Record<string, any>,
    userId?: string
): void {
    if (!isTelemetryEnabled()) {
        return;
    }

    const resolvedUserId = resolveTelemetryUserId(userId);
    if (!resolvedUserId) {
        // Best effort background resolve for linked Microsoft sessions.
        void resolveTelemetryUserIdForSession();
    }

    telemetryQueue.push({
        eventType,
        clientId: getClientId(),
        userId: resolvedUserId,
        data: data || undefined,
        launcherVersion: getLauncherVersion(),
        platform: getPlatform(),
        locale: getLocale(),
    });

    if (telemetryQueue.length > TELEMETRY_MAX_QUEUE_SIZE) {
        telemetryQueue.splice(0, telemetryQueue.length - TELEMETRY_MAX_QUEUE_SIZE);
    }

    if (telemetryQueue.length >= TELEMETRY_BATCH_SIZE) {
        void flushTelemetryQueue();
    } else {
        scheduleTelemetryFlush();
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

    queueEvent(TELEMETRY_EVENTS.APP_OPEN, {
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

    queueEvent(TELEMETRY_EVENTS.APP_CLOSE, {
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

    queueEvent(TELEMETRY_EVENTS.GAME_LAUNCH, {
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

    // Also clean up any stale entries older than 24 hours
    const now = Date.now();
    for (const [id, time] of gameStartTimes) {
        if (now - time.getTime() > 24 * 60 * 60 * 1000) {
            gameStartTimes.delete(id);
        }
    }

    queueEvent(TELEMETRY_EVENTS.GAME_CLOSE, {
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
    queueEvent(TELEMETRY_EVENTS.INSTANCE_CREATE, {
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
    queueEvent(TELEMETRY_EVENTS.MOD_INSTALL, {
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
    queueEvent(TELEMETRY_EVENTS.ERROR, {
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
    void resolveTelemetryUserIdForSession();

    // Track app open
    trackAppOpen();
}

/**
 * Cleanup telemetry
 * Call this before app quit
 */
export async function cleanupTelemetry(): Promise<void> {
    console.log("[Telemetry] Cleaning up...");

    // Queue app close and flush immediately before quit
    trackAppClose();
    await flushTelemetryQueue(true);
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
