// ========================================
// Helper Functions for Explore Component
// ========================================

import type { ProjectType, ModVersion } from "./types";

/**
 * Get valid file extensions for content type
 */
export function getValidExtensionsForType(projectType: ProjectType): string[] {
    switch (projectType) {
        case "mod":
            return [".jar"];
        case "shader":
            return [".zip"];
        case "resourcepack":
            return [".zip"];
        case "datapack":
            return [".zip"];
        case "modpack":
            return [".mrpack", ".zip"];
        default:
            return [".jar", ".zip"];
    }
}

/**
 * Check if version has valid files for the content type
 */
export function hasValidFilesForType(version: ModVersion, projectType: ProjectType): boolean {
    if (!version.files || version.files.length === 0) {
        // If no files info, allow it (backend will handle)
        return true;
    }
    const validExtensions = getValidExtensionsForType(projectType);
    return version.files.some(f =>
        validExtensions.some(ext => f.filename.toLowerCase().endsWith(ext))
    );
}

/**
 * Format large numbers for display (e.g., 1.5M, 10.2k)
 */
export function formatNumber(num: number): string {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
    return num.toString();
}

/**
 * Smart version matching - handles wildcards and ranges
 */
export function matchesVersion(modVersion: string, instanceVersion: string): boolean {
    if (modVersion === instanceVersion) return true;

    // Handle wildcard versions like "1.20.x"
    if (modVersion.endsWith('.x')) {
        const prefix = modVersion.slice(0, -1);
        return instanceVersion.startsWith(prefix);
    }

    // Handle version ranges like "1.20.1-1.20.4"
    const rangeMatch = modVersion.match(/^([\d.]+)[–-]([\d.]+)$/);
    if (rangeMatch) {
        const [, start, end] = rangeMatch;
        const instanceParts = instanceVersion.split('.').map(Number);
        const startParts = start.split('.').map(Number);
        const endParts = end.split('.').map(Number);

        const compareVersions = (a: number[], b: number[]): number => {
            for (let i = 0; i < Math.max(a.length, b.length); i++) {
                const av = a[i] || 0;
                const bv = b[i] || 0;
                if (av !== bv) return av - bv;
            }
            return 0;
        };

        return compareVersions(instanceParts, startParts) >= 0 &&
            compareVersions(instanceParts, endParts) <= 0;
    }

    return false;
}
