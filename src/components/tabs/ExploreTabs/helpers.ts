import type { ProjectType, ModVersion } from "./types";

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

export function hasValidFilesForType(version: ModVersion, projectType: ProjectType): boolean {
    if (!version.files || version.files.length === 0) {
        
        return true;
    }
    const validExtensions = getValidExtensionsForType(projectType);
    return version.files.some(f =>
        validExtensions.some(ext => f.filename.toLowerCase().endsWith(ext))
    );
}

export function formatNumber(num: number): string {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
    return num.toString();
}

export function matchesVersion(modVersion: string, instanceVersion: string): boolean {
    if (modVersion === instanceVersion) return true;

    if (modVersion.endsWith('.x')) {
        const prefix = modVersion.slice(0, -1);
        return instanceVersion.startsWith(prefix);
    }

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

export function normalizeImageUrl(raw: any, source: 'modrinth' | 'curseforge' | 'unknown' = 'unknown'): string | null {
    if (!raw) return null;
    if (typeof raw === 'object') {
        return raw.url || raw.rawUrl || raw.raw_url || null;
    }
    if (typeof raw !== 'string') return null;

    let s = raw.trim();
    if (!s) return null;

    if (s.startsWith('//')) s = 'https:' + s;

    // relative path starting with '/' - assume Modrinth CDN when source is modrinth
    if (s.startsWith('/') && source === 'modrinth') {
        return 'https://cdn.modrinth.com' + s;
    }

    return s;
}
