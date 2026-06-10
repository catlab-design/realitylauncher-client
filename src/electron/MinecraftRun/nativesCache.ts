import path from "path";
import fs from "fs";
import crypto from "crypto";
import { readJsonFileSafe } from "./fsUtils.js";

interface NativeExtractionMeta {
  fingerprint: string;
  nativeSourceCount: number;
  platform: string;
  arch: string;
  extractedAt: string;
}

export function computeNativeFingerprint(
  versionData: any,
  librariesDir: string,
  osKey: string,
  archBits: string,
): {
  fingerprint: string;
  nativeSourceCount: number;
  missingSourceCount: number;
} {
  const sourceEntries: string[] = [];
  let missingSourceCount = 0;
  for (const lib of versionData.libraries || []) {
    const classifierTemplate = lib.natives?.[osKey];
    if (!classifierTemplate) continue;
    const classifierKey = String(classifierTemplate).replace(
      "${arch}",
      archBits,
    );
    const classifier = lib.downloads?.classifiers?.[classifierKey];
    if (!classifier?.path) continue;

    const nativeJarPath = path.join(librariesDir, classifier.path);
    let descriptor = `${classifier.path}`;
    try {
      const stats = fs.statSync(nativeJarPath);
      descriptor += `|${stats.size}|${Math.floor(stats.mtimeMs)}`;
    } catch {
      descriptor += "|missing";
      missingSourceCount += 1;
    }
    sourceEntries.push(descriptor);
  }

  sourceEntries.sort((a, b) => a.localeCompare(b));
  const fingerprint = crypto
    .createHash("sha1")
    .update(
      [versionData.id || "", osKey, archBits, ...sourceEntries].join("\n"),
    )
    .digest("hex");

  return {
    fingerprint,
    nativeSourceCount: sourceEntries.length,
    missingSourceCount,
  };
}

function hasNativeBinary(dirPath: string): boolean {
  if (!fs.existsSync(dirPath)) return false;

  const stack = [dirPath];
  while (stack.length > 0) {
    const currentDir = stack.pop()!;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (
        entry.name.endsWith(".dll") ||
        entry.name.endsWith(".so") ||
        entry.name.endsWith(".dylib") ||
        entry.name.endsWith(".jnilib")
      ) {
        return true;
      }
    }
  }
  return false;
}

export function canReuseExtractedNatives(
  nativesDir: string,
  expectedFingerprint: string,
): boolean {
  const markerPath = path.join(nativesDir, ".extract-meta.json");
  const marker = readJsonFileSafe<NativeExtractionMeta>(markerPath);
  if (!marker) return false;
  if (marker.fingerprint !== expectedFingerprint) return false;
  if (marker.platform !== process.platform || marker.arch !== process.arch)
    return false;

  
  if (marker.nativeSourceCount <= 0) return true;
  return hasNativeBinary(nativesDir);
}

export function saveNativeExtractionMarker(
  nativesDir: string,
  fingerprint: string,
  nativeSourceCount: number,
): void {
  const markerPath = path.join(nativesDir, ".extract-meta.json");
  const marker: NativeExtractionMeta = {
    fingerprint,
    nativeSourceCount,
    platform: process.platform,
    arch: process.arch,
    extractedAt: new Date().toISOString(),
  };
  fs.writeFileSync(markerPath, JSON.stringify(marker));
}
