import os from "os";

/**
 * Filter certain arguments that might cause issues if their values are invalid or empty.
 * For example: --quickPlayPath . (directory) causes silent exit.
 * --clientId (empty) might be harmless but cleaner to remove.
 */
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

export function getOptimizedJvmArgs(): string[] {
  const cpuCores = os.cpus().length;
  const gcThreads = Math.max(2, Math.min(Math.floor(cpuCores / 2), 8));

  return [
    "-XX:+UseG1GC",
    "-XX:+ParallelRefProcEnabled",
    "-XX:MaxGCPauseMillis=50",
    "-XX:+UnlockExperimentalVMOptions",
    "-XX:+DisableExplicitGC",
    "-XX:G1NewSizePercent=30",
    "-XX:G1MaxNewSizePercent=40",
    "-XX:G1HeapRegionSize=16M",
    "-XX:G1ReservePercent=20",
    "-XX:InitiatingHeapOccupancyPercent=15",
    `-XX:ParallelGCThreads=${gcThreads}`,
    "-Dfile.encoding=UTF-8",
    // Force English locale to prevent log parsing issues with Buddhist year (2569)
    "-Duser.language=en",
    "-Duser.country=US",
  ];
}
