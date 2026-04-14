

import { app } from "electron";
import { getConfig, setConfig } from "./config.js";
import { getSession } from "./auth.js";


import { API_URL } from "./lib/constants.js";


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


function getClientId(): string {
    const config = getConfig();

    
    if ((config as any).clientId) {
        return (config as any).clientId;
    }

    
    const clientId = crypto.randomUUID();

    
    setConfig({ clientId } as any);

    return clientId;
}


function isTelemetryEnabled(): boolean {
    const config = getConfig();
    return config.telemetryEnabled !== false; 
}


function getLauncherVersion(): string {
    return app.getVersion();
}


function getPlatform(): string {
    return process.platform; 
}


function getLocale(): string {
    const config = getConfig();
    return config.language || "th";
}


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


export function trackAppClose(): void {
    let sessionDuration = 0;

    if (sessionStartTime) {
        sessionDuration = Math.floor((Date.now() - sessionStartTime.getTime()) / 1000);
    }

    queueEvent(TELEMETRY_EVENTS.APP_CLOSE, {
        sessionDuration,
    });
}


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


export function trackGameClose(instanceId: string, userId?: string): void {
    const startTime = gameStartTimes.get(instanceId);
    let playtime = 0;

    if (startTime) {
        playtime = Math.floor((Date.now() - startTime.getTime()) / 1000);
        gameStartTimes.delete(instanceId);
    }

    
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


export function trackError(
    message: string,
    context?: string,
    stack?: string
): void {
    queueEvent(TELEMETRY_EVENTS.ERROR, {
        message: message.substring(0, 500), 
        context,
        stack: stack ? stack.substring(0, 1000) : undefined, 
    });
}






export function initTelemetry(): void {
    console.log("[Telemetry] Initializing...");
    console.log("[Telemetry] Enabled:", isTelemetryEnabled());
    console.log("[Telemetry] Client ID:", getClientId());
    void resolveTelemetryUserIdForSession();

    
    trackAppOpen();
}


export async function cleanupTelemetry(): Promise<void> {
    console.log("[Telemetry] Cleaning up...");

    
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
