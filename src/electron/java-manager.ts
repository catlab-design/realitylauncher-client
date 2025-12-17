/**
 * ========================================
 * Java Manager - จัดการ Java Installations
 * ========================================
 * 
 * ตรวจจับ ทดสอบ และเลือก Java อัตโนมัติ
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { exec, execSync } from "node:child_process";
import { promisify } from "node:util";
import { getConfig, setConfig } from "./config.js";

const execAsync = promisify(exec);

// ========================================
// Types
// ========================================

export interface JavaInstallation {
    path: string;
    version: string;
    majorVersion: number;
    vendor: string;
    is64Bit: boolean;
    isValid: boolean;
}

export interface JavaTestResult {
    success: boolean;
    version?: string;
    majorVersion?: number;
    vendor?: string;
    is64Bit?: boolean;
    error?: string;
}

// ========================================
// Constants
// ========================================

// Common Java installation paths on Windows
const WINDOWS_JAVA_PATHS = [
    // Program Files
    "C:\\Program Files\\Java",
    "C:\\Program Files (x86)\\Java",
    "C:\\Program Files\\Eclipse Adoptium",
    "C:\\Program Files\\Temurin",
    "C:\\Program Files\\AdoptOpenJDK",
    "C:\\Program Files\\Zulu",
    "C:\\Program Files\\Amazon Corretto",
    "C:\\Program Files\\Microsoft",
    "C:\\Program Files\\BellSoft",
    // User paths
    `${process.env.LOCALAPPDATA}\\Programs\\Eclipse Adoptium`,
    `${process.env.USERPROFILE}\\.jdks`,
    // Minecraft runtime
    `${process.env.APPDATA}\\.minecraft\\runtime`,
];

// Common Java installation paths on macOS
const MACOS_JAVA_PATHS = [
    "/Library/Java/JavaVirtualMachines",
    "/System/Library/Frameworks/JavaVM.framework/Versions",
    `${process.env.HOME}/Library/Java/JavaVirtualMachines`,
    `${process.env.HOME}/.sdkman/candidates/java`,
];

// Common Java installation paths on Linux
const LINUX_JAVA_PATHS = [
    "/usr/lib/jvm",
    "/usr/java",
    "/opt/java",
    `${process.env.HOME}/.sdkman/candidates/java`,
    `${process.env.HOME}/.jdks`,
];

// ========================================
// Functions
// ========================================

/**
 * getJavaSearchPaths - ดึง paths ที่จะค้นหา Java
 */
function getJavaSearchPaths(): string[] {
    const platform = process.platform;

    if (platform === "win32") {
        return WINDOWS_JAVA_PATHS.filter(p => p && fs.existsSync(p));
    } else if (platform === "darwin") {
        return MACOS_JAVA_PATHS.filter(p => p && fs.existsSync(p));
    } else {
        return LINUX_JAVA_PATHS.filter(p => p && fs.existsSync(p));
    }
}

/**
 * findJavaExecutable - หา java executable ในโฟลเดอร์
 */
function findJavaExecutable(javaHome: string): string | null {
    const platform = process.platform;
    const binDir = path.join(javaHome, "bin");

    if (!fs.existsSync(binDir)) return null;

    const executable = platform === "win32" ? "java.exe" : "java";
    const javaPath = path.join(binDir, executable);

    if (fs.existsSync(javaPath)) {
        return javaPath;
    }

    return null;
}

/**
 * testJava - ทดสอบ Java executable
 */
export async function testJava(javaPath: string): Promise<JavaTestResult> {
    if (!fs.existsSync(javaPath)) {
        return { success: false, error: "File not found" };
    }

    try {
        const { stderr } = await execAsync(`"${javaPath}" -version`, { timeout: 10000 });

        // Java -version outputs to stderr
        const output = stderr.toLowerCase();

        // Parse version
        let version = "unknown";
        let majorVersion = 0;

        const versionMatch = output.match(/version "([^"]+)"/);
        if (versionMatch) {
            version = versionMatch[1];

            // Parse major version
            if (version.startsWith("1.")) {
                // Old format: 1.8.0_xxx
                majorVersion = parseInt(version.split(".")[1], 10);
            } else {
                // New format: 17.0.1, 21.0.1
                majorVersion = parseInt(version.split(".")[0], 10);
            }
        }

        // Parse vendor
        let vendor = "Unknown";
        if (output.includes("openjdk")) vendor = "OpenJDK";
        else if (output.includes("temurin")) vendor = "Eclipse Temurin";
        else if (output.includes("adoptopenjdk")) vendor = "AdoptOpenJDK";
        else if (output.includes("zulu")) vendor = "Azul Zulu";
        else if (output.includes("corretto")) vendor = "Amazon Corretto";
        else if (output.includes("graalvm")) vendor = "GraalVM";
        else if (output.includes("hotspot")) vendor = "HotSpot";
        else if (output.includes("microsoft")) vendor = "Microsoft";
        else if (output.includes("bellsoft")) vendor = "BellSoft Liberica";

        // Check if 64-bit
        const is64Bit = output.includes("64-bit") || output.includes("amd64") || output.includes("x86_64");

        console.log(`[JavaManager] Tested ${javaPath}: ${vendor} ${version} (${majorVersion})`);

        return {
            success: true,
            version,
            majorVersion,
            vendor,
            is64Bit,
        };
    } catch (error: any) {
        console.error(`[JavaManager] Error testing Java at ${javaPath}:`, error.message);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * detectSystemJava - ค้นหา Java ในระบบ
 */
export async function detectSystemJava(): Promise<JavaInstallation[]> {
    console.log("[JavaManager] Detecting Java installations...");

    const installations: JavaInstallation[] = [];
    const checkedPaths = new Set<string>();

    // 1. Check JAVA_HOME environment variable
    if (process.env.JAVA_HOME) {
        const javaHome = process.env.JAVA_HOME;
        const javaPath = findJavaExecutable(javaHome);
        if (javaPath && !checkedPaths.has(javaPath)) {
            checkedPaths.add(javaPath);
            const result = await testJava(javaPath);
            if (result.success) {
                installations.push({
                    path: javaPath,
                    version: result.version!,
                    majorVersion: result.majorVersion!,
                    vendor: result.vendor!,
                    is64Bit: result.is64Bit!,
                    isValid: true,
                });
            }
        }
    }

    // 2. Check PATH
    try {
        const platform = process.platform;
        const whichCmd = platform === "win32" ? "where java" : "which java";
        const { stdout } = await execAsync(whichCmd);
        const pathJava = stdout.trim().split("\n")[0].trim();

        if (pathJava && !checkedPaths.has(pathJava)) {
            checkedPaths.add(pathJava);
            const result = await testJava(pathJava);
            if (result.success) {
                installations.push({
                    path: pathJava,
                    version: result.version!,
                    majorVersion: result.majorVersion!,
                    vendor: result.vendor!,
                    is64Bit: result.is64Bit!,
                    isValid: true,
                });
            }
        }
    } catch {
        // Java not in PATH
    }

    // 3. Scan common directories
    const searchPaths = getJavaSearchPaths();

    for (const searchPath of searchPaths) {
        try {
            const entries = fs.readdirSync(searchPath, { withFileTypes: true });

            for (const entry of entries) {
                if (!entry.isDirectory()) continue;

                const javaHome = path.join(searchPath, entry.name);
                const javaPath = findJavaExecutable(javaHome);

                // macOS: Check inside Contents/Home
                let macJavaPath = null;
                if (process.platform === "darwin") {
                    const macHome = path.join(javaHome, "Contents", "Home");
                    macJavaPath = findJavaExecutable(macHome);
                }

                const effectivePath = javaPath || macJavaPath;

                if (effectivePath && !checkedPaths.has(effectivePath)) {
                    checkedPaths.add(effectivePath);
                    const result = await testJava(effectivePath);
                    if (result.success) {
                        installations.push({
                            path: effectivePath,
                            version: result.version!,
                            majorVersion: result.majorVersion!,
                            vendor: result.vendor!,
                            is64Bit: result.is64Bit!,
                            isValid: true,
                        });
                    }
                }
            }
        } catch {
            // Directory not accessible
        }
    }

    // 4. Check saved paths in config
    const config = getConfig();
    const savedPaths = [config.java8Path, config.java17Path, config.java21Path, config.javaPath]
        .filter(Boolean) as string[];

    for (const savedPath of savedPaths) {
        if (!checkedPaths.has(savedPath)) {
            checkedPaths.add(savedPath);
            const result = await testJava(savedPath);
            if (result.success) {
                installations.push({
                    path: savedPath,
                    version: result.version!,
                    majorVersion: result.majorVersion!,
                    vendor: result.vendor!,
                    is64Bit: result.is64Bit!,
                    isValid: true,
                });
            }
        }
    }

    // Sort by major version (descending)
    installations.sort((a, b) => b.majorVersion - a.majorVersion);

    console.log(`[JavaManager] Found ${installations.length} Java installations`);
    return installations;
}

/**
 * getRecommendedJavaVersion - ดึง Java version ที่แนะนำสำหรับ MC version
 */
export function getRecommendedJavaVersion(mcVersion: string): 8 | 17 | 21 {
    // Parse MC version
    const match = mcVersion.match(/^1\.(\d+)(?:\.(\d+))?/);

    if (!match) {
        // Unknown format, default to Java 21
        return 21;
    }

    const minor = parseInt(match[1], 10);
    const patch = match[2] ? parseInt(match[2], 10) : 0;

    // 1.21+ or 1.20.5+ requires Java 21
    if (minor >= 21 || (minor === 20 && patch >= 5)) {
        return 21;
    }

    // 1.18 - 1.20.4 requires Java 17
    if (minor >= 18) {
        return 17;
    }

    // 1.17 requires Java 16+ but Java 17 works
    if (minor === 17) {
        return 17;
    }

    // 1.16 and below requires Java 8
    return 8;
}

/**
 * selectBestJava - เลือก Java ที่เหมาะสมที่สุดสำหรับ MC version
 */
export async function selectBestJava(mcVersion: string): Promise<string | null> {
    const recommendedMajor = getRecommendedJavaVersion(mcVersion);
    const config = getConfig();

    console.log(`[JavaManager] Selecting Java for MC ${mcVersion}, recommended: Java ${recommendedMajor}`);

    // 1. Check if we have a saved path for this Java version
    let savedPath: string | undefined;
    if (recommendedMajor === 8) savedPath = config.java8Path;
    else if (recommendedMajor === 17) savedPath = config.java17Path;
    else if (recommendedMajor === 21) savedPath = config.java21Path;

    if (savedPath) {
        const result = await testJava(savedPath);
        if (result.success && result.majorVersion === recommendedMajor) {
            console.log(`[JavaManager] Using saved Java ${recommendedMajor}: ${savedPath}`);
            return savedPath;
        }
    }

    // 2. Detect all Java installations
    const installations = await detectSystemJava();

    // 3. Find exact match
    const exactMatch = installations.find(j => j.majorVersion === recommendedMajor);
    if (exactMatch) {
        console.log(`[JavaManager] Found exact match: ${exactMatch.path}`);
        // Save for future use
        if (recommendedMajor === 8) setConfig({ java8Path: exactMatch.path });
        else if (recommendedMajor === 17) setConfig({ java17Path: exactMatch.path });
        else if (recommendedMajor === 21) setConfig({ java21Path: exactMatch.path });
        return exactMatch.path;
    }

    // 4. Find compatible version (higher is OK for most cases)
    const compatible = installations.find(j => j.majorVersion >= recommendedMajor);
    if (compatible) {
        console.log(`[JavaManager] Using compatible Java ${compatible.majorVersion}: ${compatible.path}`);
        return compatible.path;
    }

    // 5. Fallback to any available Java
    if (installations.length > 0) {
        console.log(`[JavaManager] Fallback to available Java: ${installations[0].path}`);
        return installations[0].path;
    }

    console.warn("[JavaManager] No Java installation found!");
    return null;
}

/**
 * getJavaForVersion - Convenience function สำหรับ auto selection
 */
export async function getJavaForVersion(mcVersion: string): Promise<{
    javaPath: string | null;
    recommendedVersion: number;
    actualVersion: number | null;
    isExactMatch: boolean;
}> {
    const recommendedVersion = getRecommendedJavaVersion(mcVersion);
    const javaPath = await selectBestJava(mcVersion);

    if (!javaPath) {
        return {
            javaPath: null,
            recommendedVersion,
            actualVersion: null,
            isExactMatch: false,
        };
    }

    const result = await testJava(javaPath);

    return {
        javaPath,
        recommendedVersion,
        actualVersion: result.majorVersion || null,
        isExactMatch: result.majorVersion === recommendedVersion,
    };
}
