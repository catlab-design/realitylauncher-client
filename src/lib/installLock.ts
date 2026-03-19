import type { GameInstance } from "../types/launcher";

export interface InstallLockState {
  isInstalling: boolean;
  operationType: "install" | "repair" | "sync" | null;
  installingInstanceId: string | null;
}

export function isInstallTargetActive(
  targetId: string | null | undefined,
  state: InstallLockState,
): boolean {
  return (
    state.isInstalling &&
    state.operationType === "install" &&
    !!targetId &&
    state.installingInstanceId === targetId
  );
}

export function isInstanceInstallLocked(
  instance: Pick<GameInstance, "id" | "cloudId"> | null | undefined,
  state: InstallLockState,
): boolean {
  if (!instance) return false;

  return (
    state.isInstalling &&
    state.operationType === "install" &&
    !!state.installingInstanceId &&
    (instance.id === state.installingInstanceId ||
      instance.cloudId === state.installingInstanceId)
  );
}
