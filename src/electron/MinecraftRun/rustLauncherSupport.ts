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
 * จำกัด max heap ไม่ให้เกิน 70% ของ RAM ทั้งเครื่อง กัน OOM/swap บนเครื่องสเปกต่ำ
 * เป็น safety net ฝั่ง main process ไม่ว่า UI จะส่งค่ามาเท่าไร
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
  const minMb = Math.min(maxMb, 2048);
  return { minMb, maxMb };
}

/**
 * JVM args เฉพาะแพลตฟอร์ม
 * macOS (LWJGL3/GLFW) บังคับต้องมี -XstartOnFirstThread ไม่งั้น crash ตอนเปิดหน้าต่าง
 * ใส่แบบ defensive — ถ้า native core ใส่ให้อยู่แล้วการซ้ำก็ไม่มีผลกับ JVM
 */
export function getPlatformJvmArgs(): string[] {
  return process.platform === "darwin" ? ["-XstartOnFirstThread"] : [];
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
    
    "-Duser.language=en",
    "-Duser.country=US",
  ];
}
