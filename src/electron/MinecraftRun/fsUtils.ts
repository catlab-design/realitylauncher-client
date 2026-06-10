import fs from "fs";

export function logPerfStep(step: string, startedAt: number): void {
  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs >= 200) {
    console.log(`[RustLauncher][Perf] ${step}: ${elapsedMs}ms`);
  }
}

export function readJsonFileSafe<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}
