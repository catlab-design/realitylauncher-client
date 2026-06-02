import os from "os";

export function filterGameArgs(args: any[]): any[] {
  const result: any[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg === "string") {
      if (arg === "--quickPlayPath") {
        i++;
        continue;
      }
      if (arg === "--clientId") {
        i++;
        continue;
      }
    }
    result.push(arg);
  }
  return result;
}

/**
 * Resolve the heap size handed to the JVM.
 *
 * Xms is pinned to Xmx so the JVM commits the whole heap up front and never
 * resizes it mid-session. A growing heap is the classic cause of in-game
 * stutter while walking/loading chunks, so we trade a slightly slower launch
 * for steady frametimes. The max is still capped at 70% of system RAM as a
 * main-process safety net against OOM/swap on low-spec machines, regardless of
 * what the UI requests.
 */
export function computeSafeHeapMb(requestedMb: number): {
  minMb: number;
  maxMb: number;
} {
  const totalSystemMb = Math.floor(os.totalmem() / (1024 * 1024));
  const maxMb = Math.max(
    1024,
    Math.min(requestedMb, Math.floor(totalSystemMb * 0.7)),
  );
  return { minMb: maxMb, maxMb };
}

/**
 * Platform-specific JVM args.
 * macOS (LWJGL3/GLFW) requires -XstartOnFirstThread or it crashes when the
 * window opens. Added defensively; a duplicate is harmless if the native core
 * already supplies it.
 */
export function getPlatformJvmArgs(): string[] {
  return process.platform === "darwin" ? ["-XstartOnFirstThread"] : [];
}

/**
 * G1GC tuning derived from Aikar's flags, adapted for the client.
 *
 * Paired with Xms == Xmx and AlwaysPreTouch, this keeps frametimes steady:
 * the heap is fully committed at startup so chunk loading no longer triggers
 * heap growth or first-touch page faults, and a 200ms pause target avoids the
 * over-frequent young GCs an aggressive target would cause.
 */
export function getOptimizedJvmArgs(maxHeapMb: number): string[] {
  const cpuCores = os.cpus().length;
  const gcThreads = Math.max(2, Math.min(Math.floor(cpuCores / 2), 8));

  // Bigger G1 regions only help large heaps; small heaps keep the JVM default
  // so they still get a healthy region count.
  const bigHeapRegion = maxHeapMb >= 12288 ? ["-XX:G1HeapRegionSize=16M"] : [];

  return [
    "-XX:+UseG1GC",
    "-XX:+ParallelRefProcEnabled",
    "-XX:MaxGCPauseMillis=200",
    "-XX:+UnlockExperimentalVMOptions",
    "-XX:+DisableExplicitGC",
    "-XX:+AlwaysPreTouch",
    "-XX:G1NewSizePercent=30",
    "-XX:G1MaxNewSizePercent=40",
    ...bigHeapRegion,
    "-XX:G1ReservePercent=20",
    "-XX:G1HeapWastePercent=5",
    "-XX:G1MixedGCCountTarget=4",
    "-XX:InitiatingHeapOccupancyPercent=15",
    "-XX:G1MixedGCLiveThresholdPercent=90",
    "-XX:G1RSetUpdatingPauseTimePercent=5",
    "-XX:SurvivorRatio=32",
    "-XX:+PerfDisableSharedMem",
    "-XX:MaxTenuringThreshold=1",
    `-XX:ParallelGCThreads=${gcThreads}`,
    "-Dfile.encoding=UTF-8",
    // Force a stable locale so mods that parse numbers don't break on locales
    // that use a comma decimal separator.
    "-Duser.language=en",
    "-Duser.country=US",
  ];
}
