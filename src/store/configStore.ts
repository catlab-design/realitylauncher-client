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
    language: "en",
    windowWidth: 1024,
    windowHeight: 700,
    windowAuto: true,
    closeOnLaunch: "keep-open",
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
            resetConfig: () => {
                // Clear persisted storage first, but preserve Java paths
                const stored = localStorage.getItem('reality_config');
                let preservedJavaPath: string | undefined;
                let preservedJavaPaths: any | undefined;
                if (stored) {
                    try {
                        const parsed = JSON.parse(stored);
                        preservedJavaPath = parsed?.state?.javaPath;
                        preservedJavaPaths = parsed?.state?.javaPaths;
                    } catch {}
                }
                localStorage.removeItem('reality_config');
                set({ 
                    ...defaultConfig, 
                    javaPath: preservedJavaPath,
                    javaPaths: preservedJavaPaths 
                });
            },
            setTheme: (theme) => set({ theme }),
            setLanguage: (language) => set({ language }),
        }),
        {
            name: 'reality_config', // name of item in the storage (must match old key for migration)
            // storage is localStorage by default, which matches our needs
            // Migrate old boolean closeOnLaunch to new mode string
            migrate: (persistedState: any) => {
                if (persistedState && typeof persistedState.closeOnLaunch === 'boolean') {
                    // Convert old boolean to new mode string
                    persistedState.closeOnLaunch = persistedState.closeOnLaunch ? 'hide-reopen' : 'keep-open';
                }
                return persistedState;
            },
            version: 1,
        }
    )
);
