import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type LauncherConfig } from '../types/launcher';

interface ConfigState extends LauncherConfig {
    // Actions
    setConfig: (config: Partial<LauncherConfig>) => void;
    resetConfig: () => void;
    setTheme: (theme: LauncherConfig['theme']) => void;
    setLanguage: (lang: LauncherConfig['language']) => void;
}

const defaultConfig: LauncherConfig = {
    username: "Player",
    selectedVersion: "1.20.1",
    ramMB: 2048,
    theme: "light",
    colorTheme: "yellow",
    language: "th",
    windowWidth: 1024,
    windowHeight: 700,
    windowAuto: true,
    closeOnLaunch: false,
    downloadSpeedLimit: 0,
    discordRPCEnabled: true,
    clickSoundEnabled: true,
    notificationSoundEnabled: true,
    rainbowMode: false,
    fullscreen: false,
    javaArguments: "",
    maxConcurrentDownloads: 5,
    telemetryEnabled: true,
    autoUpdateEnabled: true,
};

export const useConfigStore = create<ConfigState>()(
    persist(
        (set) => ({
            ...defaultConfig,
            setConfig: (newConfig) => set((state) => ({ ...state, ...newConfig })),
            resetConfig: () => set(defaultConfig),
            setTheme: (theme) => set({ theme }),
            setLanguage: (language) => set({ language }),
        }),
        {
            name: 'reality_config', // name of item in the storage (must match old key for migration)
            // storage is localStorage by default, which matches our needs
        }
    )
);
