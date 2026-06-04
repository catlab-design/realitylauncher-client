import os from "os";
import fs from "fs";
import path from "path";

// Diagnostic: snapshot the resourcepacks folder so we can pinpoint when/where a
// user-added pack disappears (reported: pack vanishes after relaunching a cloud
// instance). Bracketing the launch flow tells us whether the launcher removed it
// or it was already gone before launch.
export function logResourcePacksState(label: string, gameDir: string): void {
  try {
    const rpDir = path.join(gameDir, "resourcepacks");
    let files: string[] = [];
    try {
      files = fs.readdirSync(rpDir).filter((f) => !f.startsWith("."));
    } catch {
      /* dir may not exist yet */
    }
    console.log(
      `[RustLauncher][RP] ${label}: ${files.length} pack(s)` +
        (files.length ? ` -> ${files.join(", ")}` : "") +
        ` @ ${rpDir}`,
    );
  } catch {
    /* never let diagnostics break launch */
  }
}

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
 * Xms is a small initial heap that the JVM grows lazily toward Xmx, mirroring
 * how Modrinth launches: nothing is committed or touched up front, so the game
 * window appears quickly instead of stalling while the whole heap is allocated.
 * Pinning Xms to Xmx (together with AlwaysPreTouch) was the previous behaviour
 * and the main reason large-RAM launches felt slow.
 *
 * Xmx is still capped at 70% of system RAM as a main-process safety net against
 * OOM/swap on low-spec machines, regardless of what the UI requests.
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
  // Small initial heap; pages are committed on demand as the game grows it.
  const minMb = Math.min(512, maxMb);
  return { minMb, maxMb };
}

/**
 * Platform-specific JVM args.
 * macOS (LWJGL3/GLFW) requires -XstartOnFirstThread for legacy versions (< 1.13),
 * but modern versions (1.13+) crash or hang if it is passed.
 */
export function getPlatformJvmArgs(mcVersion?: string): string[] {
  if (process.platform !== "darwin") return [];

  if (mcVersion) {
    const match = mcVersion.trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (match) {
      const major = Number.parseInt(match[1] || "", 10);
      const minor = Number.parseInt(match[2] || "0", 10);
      if (major > 1 || (major === 1 && minor >= 13)) {
        // LWJGL 3 (1.13+) does not need -XstartOnFirstThread and it causes startup hangs on macOS
        return [];
      }
    }
  }

  return ["-XstartOnFirstThread"];
}

/**
 * G1GC tuning derived from Aikar's flags, adapted for the client.
 *
 * These only shape G1's pause behaviour at runtime — they don't commit or touch
 * the heap up front, so they keep frametimes steady without slowing launch. We
 * deliberately dropped -XX:+AlwaysPreTouch (and the pinned Xms == Xmx, see
 * computeSafeHeapMb) because pre-touching the whole heap was the dominant cause
 * of slow startup on large-RAM configs; the 200ms pause target still avoids the
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
