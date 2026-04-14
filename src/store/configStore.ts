import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type LauncherConfig } from '../types/launcher';

interface ConfigState extends LauncherConfig {
    
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
    maxConcurrentDownloads: 8,
    telemetryEnabled: true,
    autoUpdateEnabled: true,
};

export const useConfigStore = create<ConfigState>()(
    persist(
        (set) => ({
            ...defaultConfig,
            setConfig: (newConfig) => set((state) => ({ ...state, ...newConfig })),
            resetConfig: () => {
                
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
            name: 'reality_config', 
            
            
            migrate: (persistedState: any) => {
                if (persistedState && typeof persistedState.closeOnLaunch === 'boolean') {
                    
                    persistedState.closeOnLaunch = persistedState.closeOnLaunch ? 'hide-reopen' : 'keep-open';
                }
                return persistedState;
            },
            version: 1,
        }
    )
);
