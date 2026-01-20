// ========================================
// Constants for Explore Component
// ========================================

import type { ProjectType } from "./types";
import { Icons } from "../../ui/Icons";

export const SEARCH_DEBOUNCE_MS = 300;

export const PROJECT_TABS: { id: ProjectType; label: string; icon: React.ComponentType<any> }[] = [
    { id: "modpack", label: "Modpacks", icon: Icons.Box },
    { id: "mod", label: "Mods", icon: Icons.Box },
    { id: "resourcepack", label: "Resource", icon: Icons.Box },
    { id: "datapack", label: "Data", icon: Icons.Box },
    { id: "shader", label: "Shaders", icon: Icons.Box },
];

export const SORT_OPTIONS = [
    { value: "relevance", label: "Relevance" },
    { value: "downloads", label: "Downloads" },
    { value: "follows", label: "Follows" },
    { value: "newest", label: "Newest" },
    { value: "updated", label: "Recently Updated" },
];
