/** Absolute http(s) URL with a host, normalised by the URL parser; anything else is null. */
export function getSafeExternalUrl(rawUrl?: string | null): string | null {
    if (typeof rawUrl !== "string") return null;
    try {
        const parsed = new URL(rawUrl.trim());
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
        if (!parsed.hostname) return null;
        return parsed.toString();
    } catch {
        return null;
    }
}
