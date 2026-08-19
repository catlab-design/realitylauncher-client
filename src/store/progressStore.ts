import { create } from "zustand";
import type { InstallProgress } from "../types/launcher";

interface ProgressState {
  isInstalling: boolean;
  installProgress: InstallProgress | null;
  isInstallMinimized: boolean;
  operationType: "install" | "repair" | "sync" | null;
  installingInstanceId: string | null;

  setInstalling: (isInstalling: boolean) => void;
  setInstallProgress: (progress: InstallProgress | null) => void;
  setInstallMinimized: (isMinimized: boolean) => void;
  setOperationType: (type: "install" | "repair" | "sync" | null) => void;
  setInstallingInstanceId: (id: string | null) => void;

}

export const useProgressStore = create<ProgressState>((set) => ({
  isInstalling: false,
  installProgress: null,
  isInstallMinimized: false,
  operationType: null,
  installingInstanceId: null,

  setInstalling: (isInstalling) => set({ isInstalling }),
  setInstallProgress: (installProgress) => set({ installProgress }),
  setInstallMinimized: (isInstallMinimized) => set({ isInstallMinimized }),
  setOperationType: (operationType) => set({ operationType }),
  setInstallingInstanceId: (installingInstanceId) =>
    set({ installingInstanceId }),

}));
