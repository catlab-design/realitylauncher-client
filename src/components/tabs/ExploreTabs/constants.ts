// ========================================
// Constants for Explore Component
// ========================================

import type { ProjectType } from "./types";
import { Icons } from "../../ui/Icons";

export const SEARCH_DEBOUNCE_MS = 300;

export const PROJECT_TABS: {
  id: ProjectType;
  labelKey: string;
  icon: React.ComponentType<any>;
}[] = [
  { id: "modpack", labelKey: "modpacks", icon: Icons.Modpack },
  { id: "mod", labelKey: "mods", icon: Icons.Box },
  { id: "resourcepack", labelKey: "resourcepacks", icon: Icons.Palette },
  { id: "datapack", labelKey: "datapacks", icon: Icons.Scroll },
  { id: "shader", labelKey: "shaders", icon: Icons.Sun },
];

export const SORT_OPTIONS = [
  { value: "relevance", labelKey: "sort.relevance" },
  { value: "downloads", labelKey: "sort.downloads" },
  { value: "follows", labelKey: "sort.follows" },
  { value: "newest", labelKey: "sort.newest" },
  { value: "updated", labelKey: "sort.updated" },
];
