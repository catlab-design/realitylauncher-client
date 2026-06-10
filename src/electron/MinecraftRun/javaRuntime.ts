import fs from "fs";
import { getConfig } from "../config.js";

const JAVA_DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000;
const JAVA_MAJOR_CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_JAVA_PATH_CACHE = 32;
const MAX_JAVA_MAJOR_CACHE = 32;

let javaInstallationsCache: { installs: any[]; cachedAt: number } | null = null;

const javaPathSelectionCache = new Map<
  string,
  { path: string; cachedAt: number }
>();
const javaMajorVersionCache = new Map<
  string,
  { major: number; cachedAt: number }
>();

export function getRequiredJavaVersion(mcVersion?: string, versionData?: any): number {
  const manifestJavaMajor = Number(versionData?.javaVersion?.majorVersion);
  if (Number.isFinite(manifestJavaMajor) && manifestJavaMajor > 0) {
    console.log(
      `[RustLauncher] Version Check: mcVersion=${mcVersion || "unknown"}, manifestJava=${manifestJavaMajor} -> targetJavaVersion=${manifestJavaMajor}`,
    );
    return manifestJavaMajor;
  }

  let targetJavaVersion = 17;
  if (!mcVersion) return targetJavaVersion;

  const match = mcVersion.trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return targetJavaVersion;

  const major = Number.parseInt(match[1] || "", 10);
  const minor = Number.parseInt(match[2] || "0", 10);
  const patch = Number.parseInt(match[3] || "0", 10);
  if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) {
    return targetJavaVersion;
  }

  if (major > 1) {
    targetJavaVersion = 21;
  } else if (minor < 17) {
    targetJavaVersion = 8;
  } else if (minor > 20 || (minor === 20 && patch >= 5)) {
    targetJavaVersion = 21;
  }

  console.log(
    `[RustLauncher] Version Check: mcVersion=${mcVersion}, major=${major}, minor=${minor}, patch=${patch} -> targetJavaVersion=${targetJavaVersion}`,
  );
  return targetJavaVersion;
}

function addBoundedCacheEntry<K, V>(
  map: Map<K, V>,
  key: K,
  value: V,
  maxEntries: number,
): void {
  map.set(key, value);
  if (map.size <= maxEntries) return;
  const oldestKey = map.keys().next().value as K | undefined;
  if (oldestKey !== undefined) map.delete(oldestKey);
}

export async function getJavaMajorVersion(
  javaPath: string,
  fallbackMajor: number,
  allowFallback = true,
): Promise<number> {
  let statMtime = "na";
  try {
    statMtime = String(Math.floor(fs.statSync(javaPath).mtimeMs));
  } catch {

  }

  const cacheKey = `${javaPath}|${statMtime}`;
  const now = Date.now();
  const cached = javaMajorVersionCache.get(cacheKey);
  if (cached && now - cached.cachedAt < JAVA_MAJOR_CACHE_TTL_MS) {
    return cached.major;
  }

  const { spawn } = await import("child_process");
  try {
    const javaVer = await new Promise<string>((resolve, reject) => {
      const child = spawn(javaPath, ["-version"], {
        windowsHide: true,
        shell: false,
      });
      let output = "";
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("Java version probe timed out"));
      }, 5000);

      child.stdout?.on("data", (data: Buffer) => {
        output += data.toString();
      });
      child.stderr?.on("data", (data: Buffer) => {
        output += data.toString();
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", () => {
        clearTimeout(timeout);
        resolve(output);
      });
    });

    const versionMatch = javaVer.match(/version "(.*?)"/);
    if (versionMatch) {
      const versionString = versionMatch[1] || "";
      const parts = versionString.split(".");
      const major =
        parts[0] === "1"
          ? Number.parseInt(parts[1] || "", 10)
          : Number.parseInt(parts[0] || "", 10);

      if (Number.isFinite(major) && major > 0) {
        addBoundedCacheEntry(
          javaMajorVersionCache,
          cacheKey,
          { major, cachedAt: now },
          MAX_JAVA_MAJOR_CACHE,
        );
        return major;
      }
    }
  } catch (error) {
    console.warn(
      `[RustLauncher] Failed to detect Java version, fallback to Java ${fallbackMajor}: ${error}`,
    );
  }

  if (!allowFallback) {
    return 0;
  }

  addBoundedCacheEntry(
    javaMajorVersionCache,
    cacheKey,
    { major: fallbackMajor, cachedAt: now },
    MAX_JAVA_MAJOR_CACHE,
  );
  return fallbackMajor;
}



export async function getJavaPath(
  customJavaPath: string | undefined,
  configJavaPath: string | undefined,
  native: any,
  mcVersion?: string,
  requiredJavaVersion?: number,
): Promise<string> {
  const targetJavaVersion =
    requiredJavaVersion || getRequiredJavaVersion(mcVersion);

  const isValidJavaPath = (p: string | undefined): p is string => {
    return !!p && p !== "/path/to/java" && fs.existsSync(p);
  };

  const isCompatibleJavaPath = async (
    p: string | undefined,
  ): Promise<boolean> => {
    if (!isValidJavaPath(p)) return false;
    const major = await getJavaMajorVersion(p, targetJavaVersion, false);
    const compatible =
      targetJavaVersion === 8
        ? major === 8
        : major >= targetJavaVersion;
    if (!compatible) {
      console.warn(
        `[RustLauncher] Skipping incompatible Java path for target ${targetJavaVersion}: ${p} (detected Java ${major || "unknown"})`,
      );
    }
    return compatible;
  };

  const pickFirstCompatibleJavaPath = async (
    candidates: Array<string | undefined>,
  ): Promise<string | undefined> => {
    for (const candidate of candidates) {
      if (await isCompatibleJavaPath(candidate)) {
        return candidate;
      }
    }
    return undefined;
  };

  const config = getConfig();
  const javaPaths = config.javaPaths || {};
  const cacheKey = [
    targetJavaVersion,
    customJavaPath || "",
    configJavaPath || "",
    javaPaths.java8 || "",
    javaPaths.java17 || "",
    javaPaths.java21 || "",
    javaPaths.java25 || "",
  ].join("|");

  const cacheHit = javaPathSelectionCache.get(cacheKey);
  if (
    cacheHit &&
    Date.now() - cacheHit.cachedAt < JAVA_DISCOVERY_CACHE_TTL_MS &&
    await isCompatibleJavaPath(cacheHit.path)
  ) {
    return cacheHit.path;
  }


  let javaPath: string | undefined;
  if (isValidJavaPath(customJavaPath)) {
    if (await isCompatibleJavaPath(customJavaPath)) {
      javaPath = customJavaPath;
      console.log(`[RustLauncher] Using custom Java path: ${javaPath}`);
    } else {
      throw new Error(
        `Selected Java is not compatible. Please choose Java ${targetJavaVersion}${targetJavaVersion === 8 ? "" : "+"}.`,
      );
    }
  }


  if (!javaPath) {
    if (
      targetJavaVersion === 8 &&
      await isCompatibleJavaPath(javaPaths.java8)
    ) {
      javaPath = javaPaths.java8;
      console.log(`[RustLauncher] Using configured Java 8: ${javaPath}`);
    } else if (targetJavaVersion >= 25) {
      const candidates = [javaPaths.java25];
      javaPath = await pickFirstCompatibleJavaPath(candidates);
      if (javaPath) {
        console.log(`[RustLauncher] Using configured Java 25+: ${javaPath}`);
      }
    } else if (targetJavaVersion >= 21) {
      const candidates = [javaPaths.java21, javaPaths.java25];
      javaPath = await pickFirstCompatibleJavaPath(candidates);
      if (javaPath) {
        console.log(`[RustLauncher] Using configured Java (21+): ${javaPath}`);
      }
    } else if (targetJavaVersion >= 17) {
      const candidates = [javaPaths.java17, javaPaths.java21, javaPaths.java25];
      javaPath = await pickFirstCompatibleJavaPath(candidates);
      if (javaPath) {
        console.log(`[RustLauncher] Using configured Java (17+): ${javaPath}`);
      }
    }
  }


  if (!javaPath || javaPath === "auto") {
    const canProbe =
      native && typeof native.findJavaInstallations === "function";
    let javaInstalls: any[] = [];

    if (canProbe) {
      if (
        javaInstallationsCache &&
        Date.now() - javaInstallationsCache.cachedAt <
          JAVA_DISCOVERY_CACHE_TTL_MS
      ) {
        javaInstalls = javaInstallationsCache.installs;
      } else {
        javaInstalls = await native.findJavaInstallations();
        javaInstallationsCache = {
          installs: Array.isArray(javaInstalls) ? javaInstalls : [],
          cachedAt: Date.now(),
        };
      }
    }

    if (canProbe) {
      console.log(
        `[RustLauncher] Detected Java installations (Target: Java ${targetJavaVersion}):`,
        JSON.stringify(javaInstalls, null, 2),
      );
    } else {
      console.log(
        "[RustLauncher] Native java finder unavailable, skipping auto-detect",
      );
    }

    if (javaInstalls.length > 0) {
      const exactMatch = javaInstalls.find(
        (j: any) => j.majorVersion === targetJavaVersion,
      );
      const newerMatch =
        targetJavaVersion >= 17
          ? javaInstalls.find((j: any) => j.majorVersion >= targetJavaVersion)
          : undefined;

      javaPath = exactMatch?.path || newerMatch?.path;
    }
  }


  if (!javaPath && await isCompatibleJavaPath(configJavaPath)) {
    javaPath = configJavaPath;
    console.log(`[RustLauncher] Using legacy configured javaPath: ${javaPath}`);
  }

  if (!javaPath) {
    throw new Error(
      targetJavaVersion === 8
        ? "Java 8 not found. Please install Java 8 for older Minecraft versions."
        : targetJavaVersion >= 25
          ? "Java 25+ not found. Please install Java 25 or newer."
        : `Java ${targetJavaVersion}+ not found. Please install Java ${targetJavaVersion} or newer.`,
    );
  }

  addBoundedCacheEntry(
    javaPathSelectionCache,
    cacheKey,
    { path: javaPath, cachedAt: Date.now() },
    MAX_JAVA_PATH_CACHE,
  );
  return javaPath;
}
