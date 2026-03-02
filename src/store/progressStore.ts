import { create } from "zustand";
import type { InstallProgress } from "../types/launcher";

interface ProgressState {
  // Export State
  isExporting: boolean;
  exportProgress: InstallProgress | null;
  isExportMinimized: boolean;
  exportingInstanceId: string | null;

  // Install/Repair State
  isInstalling: boolean;
  installProgress: InstallProgress | null;
  isInstallMinimized: boolean;
  operationType: "install" | "repair" | "sync" | null;
  installingInstanceId: string | null;

  // Actions
  setExporting: (isExporting: boolean) => void;
  setExportProgress: (progress: InstallProgress | null) => void;
  setExportMinimized: (isMinimized: boolean) => void;
  setExportingInstanceId: (id: string | null) => void;

  setInstalling: (isInstalling: boolean) => void;
  setInstallProgress: (progress: InstallProgress | null) => void;
  setInstallMinimized: (isMinimized: boolean) => void;
  setOperationType: (type: "install" | "repair" | "sync" | null) => void;
  setInstallingInstanceId: (id: string | null) => void;

  // Composite Actions
  startExport: (instanceId: string, initialProgress: InstallProgress) => void;
  resetExport: () => void;
}

export const useProgressStore = create<ProgressState>((set) => ({
  isExporting: false,
  exportProgress: null,
  isExportMinimized: false,
  exportingInstanceId: null,

  isInstalling: false,
  installProgress: null,
  isInstallMinimized: false,
  operationType: null,
  installingInstanceId: null,

  setExporting: (isExporting) => set({ isExporting }),
  setExportProgress: (exportProgress) => set({ exportProgress }),
  setExportMinimized: (isExportMinimized) => set({ isExportMinimized }),
  setExportingInstanceId: (exportingInstanceId) => set({ exportingInstanceId }),

  setInstalling: (isInstalling) => set({ isInstalling }),
  setInstallProgress: (installProgress) => set({ installProgress }),
  setInstallMinimized: (isInstallMinimized) => set({ isInstallMinimized }),
  setOperationType: (operationType) => set({ operationType }),
  setInstallingInstanceId: (installingInstanceId) =>
    set({ installingInstanceId }),

  startExport: (instanceId, initialProgress) =>
    set({
      isExporting: true,
      exportingInstanceId: instanceId,
      exportProgress: initialProgress,
      isExportMinimized: false,
    }),

  resetExport: () =>
    set({
      isExporting: false,
      exportingInstanceId: null,
      exportProgress: null,
      isExportMinimized: false,
    }),
}));
