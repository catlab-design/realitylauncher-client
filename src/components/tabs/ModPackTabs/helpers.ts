// ========================================
// Helper Functions for Instance/ModPack
// ========================================

/**
 * Format bytes to human readable size
 */
export function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format play time in minutes to human readable
 */
export function formatPlayTime(minutes: number): string {
    if (minutes < 60) return `${minutes} นาที`;
    const hours = Math.floor(minutes / 60);
    return `${hours} ชั่วโมง`;
}

/**
 * Get display label for loader type
 */
export function getLoaderLabel(loader: string): string {
    const labels: Record<string, string> = {
        vanilla: "Vanilla",
        fabric: "Fabric",
        forge: "Forge",
        neoforge: "NeoForge",
        quilt: "Quilt",
    };
    return labels[loader] || loader;
}
