

import { getMinecraftDir } from "./config.js";


import { launchGame as launchGameNative } from "./MinecraftRun/rustLauncher.js";
import type { LaunchOptions, LaunchResult } from "./MinecraftRun/types.js";


export * from "./MinecraftRun/types";
export {
    setOnGameCloseCallback,
    setGameLogCallback,
    setProgressCallback,
} from "./MinecraftRun/callbacks";
export {
    isGameRunning,
    killGame,
    setActiveGameDirectory,
    resetLauncherState,
} from "./MinecraftRun/gameProcess";


export async function launchGame(options: LaunchOptions): Promise<LaunchResult> {
    
    return launchGameNative(options);
}

export async function getInstalledVersions(): Promise<string[]> {
    const minecraftDir = getMinecraftDir();
    const fs = await import("node:fs");
    const path = await import("node:path");
    const versionsDir = path.join(minecraftDir, "versions");
    try {
        if (!fs.existsSync(versionsDir)) return [];
        const dirs = fs.readdirSync(versionsDir, { withFileTypes: true });
        const versions: string[] = [];
        for (const dir of dirs) {
            if (dir.isDirectory()) {
                if (fs.existsSync(path.join(versionsDir, dir.name, `${dir.name}.json`))) {
                    versions.push(dir.name);
                }
            }
        }
        return versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    } catch (error) {
        return [];
    }
}
