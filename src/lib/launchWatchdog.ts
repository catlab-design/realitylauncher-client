/**
 * Flags a launch as stalled after `stallMs` without progress. A slow first
 * launch (server mod sync, downloads, Forge installer) keeps reporting
 * progress, so only a launch that has gone quiet trips it. Tripping only
 * reports: the launch keeps running and may still start the game.
 */
export const LAUNCH_STALL_MS = 5 * 60_000;

export interface LaunchWatchdog {
  touch(): void;
  stop(): void;
  readonly stalled: boolean;
}

export interface WatchdogTimers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const defaultTimers: WatchdogTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createLaunchWatchdog(
  onStall: () => void,
  stallMs = LAUNCH_STALL_MS,
  timers: WatchdogTimers = defaultTimers,
): LaunchWatchdog {
  let handle: unknown = null;
  let stalled = false;
  let stopped = false;

  const arm = () => {
    if (handle !== null) timers.clear(handle);
    handle = timers.set(() => {
      handle = null;
      if (stopped) return;
      stalled = true;
      onStall();
    }, stallMs);
  };
  arm();

  return {
    touch() {
      if (!stalled && !stopped) arm();
    },
    stop() {
      stopped = true;
      if (handle !== null) timers.clear(handle);
      handle = null;
    },
    get stalled() {
      return stalled;
    },
  };
}
