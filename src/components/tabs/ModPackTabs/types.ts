// ========================================
// Types for Instance/ModPack Management
// ========================================

import type { GameInstance } from "../../../types/launcher";

export interface ModInfo {
    filename: string;
    name: string;
    displayName: string;
    author: string;
    description: string;
    icon: string | null;
    enabled: boolean;
    size: number;
    modifiedAt: string;
}

export interface ContentItem {
    filename: string;
    name: string;
    isDirectory: boolean;
    size: number;
    modifiedAt: string;
    enabled: boolean;
    icon: string | null;
    modrinthProjectId?: string; // สำหรับ fallback icon Modrinth
    curseforgeProjectId?: string; // สำหรับ fallback icon CurseForge
}

export interface DatapackItem extends ContentItem {
    worldName: string;
}

export type ContentCategory = "mods" | "resourcepacks" | "datapacks" | "shaders";

export type SettingsTab = "general" | "installation";

export interface InstanceDetailProps {
    instance: GameInstance;
    colors: any;
    onBack: () => void;
    onPlay: (id: string) => void;
    onStop: () => void;
    onOpenFolder: (id: string) => void;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
    onUpdate: (id: string, updates: Partial<GameInstance>) => void;
    launchingId: string | null;
    isGameRunning: boolean;
    playingInstanceId: string | null;
}
