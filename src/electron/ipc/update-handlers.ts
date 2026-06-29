

import { ipcMain, app } from "electron";
import { autoUpdater } from "electron-updater";
import { API_URL } from "../lib/constants.js";

const isDev = !app.isPackaged;

// Compare two semver-ish versions. Returns 1 if a>b, -1 if a<b, 0 if equal.
// Pre-release/build suffixes are ignored (only the numeric core is compared).
function compareVersions(a: string, b: string): number {
    const core = (v: string): number[] =>
        String(v || "")
            .trim()
            .replace(/^v/i, "")
            .split(/[-+]/)[0]
            .split(".")
            .map((n) => parseInt(n, 10) || 0);

    const pa = core(a);
    const pb = core(b);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const da = pa[i] ?? 0;
        const db = pb[i] ?? 0;
        if (da > db) return 1;
        if (da < db) return -1;
    }
    return 0;
}

function getPlatformKey(): "windows" | "macos" | "linux" {
    if (process.platform === "darwin") return "macos";
    if (process.platform === "linux") return "linux";
    return "windows";
}

type LatestReleasePayload = {
    version: string;
    releaseDate?: string;
    changelog?: string;
    downloads?: Record<string, string>;
};

export type LatestVersionResult = {
    ok: boolean;
    current: string;
    latest?: string;
    updateAvailable?: boolean;
    releaseDate?: string;
    changelog?: string;
    downloadUrl?: string;
    error?: string;
};

export function registerUpdateHandlers(): void {

    ipcMain.handle("check-for-updates", async (): Promise<void> => {
        if (!isDev) {
            await autoUpdater.checkForUpdates();
        }
    });


    ipcMain.handle("download-update", async (): Promise<void> => {
        if (!isDev) {
            await autoUpdater.downloadUpdate();
        }
    });


    ipcMain.handle("install-update", async (): Promise<void> => {
        if (!isDev) {
            autoUpdater.quitAndInstall();
        }
    });


    ipcMain.handle("get-app-version", async (): Promise<string> => {
        return app.getVersion();
    });


    ipcMain.handle("is-dev-mode", async (): Promise<boolean> => {
        return isDev;
    });

    // Resolve the latest release straight from ml-api (/launcher/latest),
    // the single source of truth published via ml-admin. This decouples version
    // reporting from electron-updater's GitHub feed so the launcher always
    // reflects what the admin actually released.
    ipcMain.handle("check-latest-version", async (): Promise<LatestVersionResult> => {
        const current = app.getVersion();
        try {
            const response = await fetch(`${API_URL}/launcher/latest`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = (await response.json()) as LatestReleasePayload;
            const latest = String(data.version || "").trim();
            if (!latest) {
                throw new Error("Missing version in launcher manifest");
            }

            return {
                ok: true,
                current,
                latest,
                updateAvailable: compareVersions(latest, current) > 0,
                releaseDate: data.releaseDate || "",
                changelog: data.changelog || "",
                downloadUrl: data.downloads?.[getPlatformKey()] || "",
            };
        } catch (error: any) {
            console.error("[Update] Failed to check latest version:", error);
            return {
                ok: false,
                current,
                error: error?.message || "Failed to check latest version",
            };
        }
    });

    console.log("[IPC] Update handlers registered");
}
