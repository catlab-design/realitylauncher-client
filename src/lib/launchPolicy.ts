export type LaunchPolicyInstance = {
  cloudId?: string | null;
  autoUpdate?: boolean;
};

export type InstanceLaunchOptions = {
  skipServerModSync?: boolean;
};

export type LaunchPolicy = {
  isServerBacked: boolean;
  launchOptions: { skipServerModSync: boolean };
  shouldSyncServerMods: boolean;
  suppressInstallProgressModal: boolean;
};

const SYNC_LAUNCH_PROGRESS_TYPES = new Set([
  "sync-start",
  "sync-check",
  "sync-download",
  "sync-clean",
  "sync-complete",
  "sync-warning",
  "sync-error",
  "cancelled",
]);

export function isServerBackedInstance(
  instance?: LaunchPolicyInstance | null,
): boolean {
  if (!instance?.cloudId) return false;
  return instance.cloudId.trim().length > 0;
}

export function isSyncLaunchProgressType(type?: string): boolean {
  if (!type) return false;
  return SYNC_LAUNCH_PROGRESS_TYPES.has(type);
}

export function shouldRevealServerSyncLoading(progress: {
  type?: string;
  current?: number;
  total?: number;
  percent?: number;
}): boolean {
  if (progress.type !== "sync-download") return false;

  if (typeof progress.total === "number") {
    return progress.total > 0;
  }

  if (typeof progress.current === "number") {
    return progress.current > 0;
  }

  return typeof progress.percent === "number" ? progress.percent > 0 : true;
}

export function shouldShowStopButton(
  isLaunching: boolean,
  isPlaying: boolean,
): boolean {
  return isLaunching || isPlaying;
}

export function shouldShowLaunchSpinner(
  isLaunching: boolean,
  isPlaying: boolean,
): boolean {
  return isLaunching && !isPlaying;
}

export function getLaunchPolicyForInstance(
  instance?: LaunchPolicyInstance | null,
  options?: InstanceLaunchOptions,
): LaunchPolicy {
  const isServerBacked = isServerBackedInstance(instance);
  const skipServerModSync =
    options?.skipServerModSync === true || !isServerBacked;
  const shouldSyncServerMods =
    isServerBacked &&
    instance?.autoUpdate !== false &&
    !skipServerModSync;

  return {
    isServerBacked,
    launchOptions: { skipServerModSync },
    shouldSyncServerMods,
    suppressInstallProgressModal: !isServerBacked,
  };
}
