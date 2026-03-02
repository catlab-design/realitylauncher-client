import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const customRequire = createRequire(__filename);
let nativeModuleCache: any | null = null;

function resolveNativeModulePath(): string {
  const candidates = [
    path.join(app.getAppPath(), "native", "index.cjs"),
    path.join(process.cwd(), "native", "index.cjs"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Native module not found. Tried: ${candidates.join(", ")}`,
  );
}

export function getNativeModule(): any {
  if (nativeModuleCache) {
    return nativeModuleCache;
  }

  const nativePath = resolveNativeModulePath();
  nativeModuleCache = customRequire(nativePath);
  return nativeModuleCache;
}

