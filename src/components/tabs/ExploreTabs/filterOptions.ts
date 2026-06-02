// ========================================
// Shared filter option lists for the Explore tab and InstanceContentBrowser.
// IDs double as i18n key suffixes (e.g. "category.adventure", "loader.fabric").
// Labels are resolved at render time via t().
// ========================================

import fabricIcon from "../../../assets/fabric.svg";
import forgeIcon from "../../../assets/forge.svg";
import neoforgeIcon from "../../../assets/neoforge.svg";
import quiltIcon from "../../../assets/quilt.svg";

export interface CategoryOption {
    id: string;
    icon: string;
}

export interface LoaderOption {
    id: string;
    /** SVG asset URL — preferred over a Font Awesome glyph when present. */
    svg?: string;
    /** Fallback Font Awesome class. */
    icon: string;
    color: string;
}

export interface EnvironmentOption {
    id: string;
    icon: string;
}

export interface SortOption {
    value: string;
    labelKey: string;
}

export const CATEGORIES: CategoryOption[] = [
    { id: "adventure", icon: "fa-solid fa-compass" },
    { id: "cursed", icon: "fa-solid fa-skull" },
    { id: "decoration", icon: "fa-solid fa-couch" },
    { id: "economy", icon: "fa-solid fa-dollar-sign" },
    { id: "equipment", icon: "fa-solid fa-shield" },
    { id: "food", icon: "fa-solid fa-utensils" },
    { id: "game-mechanics", icon: "fa-solid fa-gears" },
    { id: "library", icon: "fa-solid fa-book" },
    { id: "magic", icon: "fa-solid fa-wand-sparkles" },
    { id: "management", icon: "fa-solid fa-server" },
    { id: "minigame", icon: "fa-solid fa-gamepad" },
    { id: "mobs", icon: "fa-solid fa-paw" },
    { id: "optimization", icon: "fa-solid fa-bolt" },
    { id: "social", icon: "fa-solid fa-comments" },
    { id: "storage", icon: "fa-solid fa-box-archive" },
    { id: "technology", icon: "fa-solid fa-microchip" },
    { id: "transportation", icon: "fa-solid fa-truck" },
    { id: "utility", icon: "fa-solid fa-toolbox" },
    { id: "worldgen", icon: "fa-solid fa-earth-americas" },
];

// Loaders with SVG assets — fabric/forge/neoforge/quilt come from modrinth-style SVGs in /assets.
// LiteLoader/ModLoader/Rift ถูกตัดออกจากตัวกรองเพราะเลิกใช้แล้ว (legacy/ไม่รองรับ)
export const LOADERS: LoaderOption[] = [
    { id: "fabric", svg: (fabricIcon as any).src, icon: "fa-solid fa-diamond", color: "#dbb168" },
    { id: "forge", svg: (forgeIcon as any).src, icon: "fa-solid fa-hammer", color: "#5a7fa0" },
    { id: "neoforge", svg: (neoforgeIcon as any).src, icon: "fa-solid fa-fire", color: "#e07030" },
    { id: "quilt", svg: (quiltIcon as any).src, icon: "fa-solid fa-table-cells", color: "#9966cc" },
];

export const ENVIRONMENTS: EnvironmentOption[] = [
    { id: "client", icon: "fa-solid fa-desktop" },
    { id: "server", icon: "fa-solid fa-server" },
];

export const MC_VERSIONS: string[] = [
    "1.21.5", "1.21.4", "1.21.3", "1.21.2", "1.21.1", "1.21",
    "1.20.6", "1.20.4", "1.20.2", "1.20.1", "1.20",
    "1.19.4", "1.19.2", "1.19.1", "1.19",
    "1.18.2", "1.18.1", "1.18",
    "1.17.1", "1.17",
    "1.16.5", "1.16.4", "1.16.3", "1.16.2", "1.16.1", "1.16",
    "1.15.2", "1.15.1", "1.15",
    "1.14.4", "1.14.3", "1.14.2", "1.14.1", "1.14",
    "1.13.2", "1.13.1", "1.13",
    "1.12.2", "1.12.1", "1.12",
    "1.11.2", "1.11",
    "1.10.2", "1.10",
    "1.9.4", "1.9",
    "1.8.9", "1.8",
    "1.7.10", "1.7.2",
];

export const SORT_OPTIONS: SortOption[] = [
    { value: "relevance", labelKey: "sort.relevance" },
    { value: "downloads", labelKey: "sort.downloads" },
    { value: "follows", labelKey: "sort.follows" },
    { value: "newest", labelKey: "sort.newest" },
    { value: "updated", labelKey: "sort.updated" },
];
