// ========================================
// Types for Explore Component
// ========================================

export const CONTENT_SOURCES = {
  MODRINTH: "modrinth",
  CURSEFORGE: "curseforge",
} as const;

export type ContentSource =
  (typeof CONTENT_SOURCES)[keyof typeof CONTENT_SOURCES];

export type ProjectType =
  | "modpack"
  | "mod"
  | "resourcepack"
  | "datapack"
  | "shader";

export interface ModrinthProject {
  source?: "modrinth" | "curseforge";
  slug: string;
  title: string;
  description: string;
  categories: string[];
  downloads: number;
  icon_url: string | null;
  project_id: string;
  author: string;
  versions: string[];
  game_versions?: string[]; // Added
  loaders?: string[]; // Added
  follows: number;
  client_side?: string;
  server_side?: string;
  gallery?: ModrinthGalleryItem[];
  featured_gallery?: string | null;
  color?: number | null; // Integer color from Rust
  latest_version?: string | null;
  // Full detail fields
  body?: string; // Full markdown description
  source_url?: string;
  wiki_url?: string;
  discord_url?: string;
  issues_url?: string;
  license?: { id: string; name: string; url?: string };
  team_members?: {
    user: { username: string; avatar_url?: string };
    role: string;
  }[];
  date_created?: string;
  date_modified?: string;
  project_type?: string;
}

export interface ModrinthGalleryItem {
  url: string;
  featured: boolean;
  title?: string;
  description?: string;
  created: string;
  ordering: number;
  raw_url?: string; // From JS backend
  rawUrl?: string; // From Native backend (camelCase)
}

export interface ExploreProps {
  colors: any;
  config?: { language?: "th" | "en" };
}

export interface GameInstance {
  id: string;
  name: string;
  minecraftVersion: string;
  loader: string;
  loaderVersion?: string;
}

export interface ModVersion {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  files?: { filename: string; primary: boolean; url: string; size?: number }[];
}

export interface ProjectVersion {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  version_type: "release" | "beta" | "alpha";
  downloads: number;
  date_published: string;
  files: { filename: string; size: number; primary: boolean; url: string }[];
  changelog?: string;
}

export interface InstanceCompatibility {
  instance: GameInstance;
  compatible: boolean;
  reason?: string;
  bestVersion?: ModVersion;
}

export interface InstallProgress {
  stage: string;
  message: string;
  percent?: number;
}
