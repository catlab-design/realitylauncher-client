import { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { Icons } from "../ui/Icons";
import { InstanceContentBrowser } from "./InstanceContentBrowser";
import {
    CONTENT_SOURCES,
    ProjectDetailPage,
    type ContentSource,
    type ModrinthProject,
} from "./ExploreTabs";
import type { GameInstance, LauncherConfig } from "../../types/launcher";
import { playClick } from "../../lib/sounds";
import { shouldShowLaunchSpinner, shouldShowStopButton } from "../../lib/launchPolicy";
import { useTranslation } from "../../hooks/useTranslation";
import type { DeleteResult } from "../../lib/bulkDelete";
import bannerImage from "../../assets/banner.png";

type InstalledBrowserContentType = "mod" | "resourcepack" | "shader" | "datapack";

import {
    ContentTabs,
    ModsList,
    ContentList,
    InstanceSettingsModal,
    VersionSwitcherModal,
    type VersionEntry,
    type VersionSwitcherSource,
    formatPlayTime,
    getLoaderLabel,
    type ModInfo,
    type ContentItem,
    type DatapackItem,
    type ContentCategory,
} from "./ModPackTabs";

interface InstanceDetailProps {
    instance: GameInstance;
    colors: any;
    config: LauncherConfig;
    onBack: () => void;
    onPlay: (id: string) => void;
    onStop: () => void;
    onOpenFolder: (id: string) => void;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
    onUpdate: (id: string, updates: Partial<GameInstance>) => void;
    onExport: (id: string, options: any) => Promise<void>;
    onViewLogs: (id: string) => void;
    onRepair?: (id: string) => void;
    launchingId: string | null;
    isGameRunning: boolean;
    playingInstanceId: string | null;
    isInstallLocked?: boolean;
}

export function InstanceDetail({
    instance,
    colors,
    config,
    onBack,
    onPlay,
    onStop,
    onOpenFolder,
    onDelete,
    onDuplicate,
    onUpdate,
    onExport,
    onViewLogs,
    launchingId,
    isGameRunning,
    playingInstanceId,
    onRepair,
    isInstallLocked = false,
}: InstanceDetailProps) {
    const { t } = useTranslation(config.language);
    const [mods, setMods] = useState<ModInfo[]>([]);
    const [modsLoading, setModsLoading] = useState(true);

    const [showSettings, setShowSettings] = useState(false);

    const [contentTab, setContentTab] = useState<ContentCategory>(
        instance.loader === "vanilla" ? "resourcepacks" : "mods"
    );

    const [resourcepacks, setResourcepacks] = useState<ContentItem[]>([]);
    const [resourcepacksLoading, setResourcepacksLoading] = useState(false);
    const [shaders, setShaders] = useState<ContentItem[]>([]);
    const [shadersLoading, setShadersLoading] = useState(false);
    const [datapacks, setDatapacks] = useState<DatapackItem[]>([]);
    const [datapacksLoading, setDatapacksLoading] = useState(false);

    const [showContentBrowser, setShowContentBrowser] = useState(false);
    const [browserContentType, setBrowserContentType] = useState<InstalledBrowserContentType>("mod");
    const [installedDetailProject, setInstalledDetailProject] = useState<ModrinthProject | null>(null);
    const [installedDetailContentType, setInstalledDetailContentType] = useState<InstalledBrowserContentType>("mod");
    const [installedDetailSource, setInstalledDetailSource] = useState<ContentSource>(CONTENT_SOURCES.MODRINTH);
    const [isInstallingInstalledVersion, setIsInstallingInstalledVersion] = useState(false);
    const [installedVersionProgress, setInstalledVersionProgress] = useState<{ stage: string; message: string } | null>(null);

    
    const isThisInstancePlaying = playingInstanceId === instance.id;
    const isThisInstanceLaunching = launchingId === instance.id;
    const showStopAction = shouldShowStopButton(isThisInstanceLaunching, isThisInstancePlaying);
    const showLaunchSpinner = shouldShowLaunchSpinner(isThisInstanceLaunching, isThisInstancePlaying);
    const disablePlayStopButton =
        (launchingId !== null && !isThisInstanceLaunching) ||
        ((isGameRunning || playingInstanceId !== null) &&
            !isThisInstancePlaying &&
            !isThisInstanceLaunching);

    const [loadedTabs, setLoadedTabs] = useState<Set<ContentCategory>>(new Set());

    const modRefreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [isDragging, setIsDragging] = useState(false);

    const [updatingFilenames, setUpdatingFilenames] = useState<Set<string>>(new Set());

    const [switcherTarget, setSwitcherTarget] = useState<{
        item: ModInfo | ContentItem | DatapackItem;
        contentType: InstalledBrowserContentType;
        projectId: string;
        source: VersionSwitcherSource;
    } | null>(null);
    const [switcherInstalling, setSwitcherInstalling] = useState(false);

    const getContentTypeForTab = (tab: ContentCategory): "mod" | "resourcepack" | "shader" | "datapack" => {
        const map: Record<ContentCategory, "mod" | "resourcepack" | "shader" | "datapack"> = {
            mods: "mod",
            resourcepacks: "resourcepack",
            shaders: "shader",
            datapacks: "datapack",
        };
        return map[tab];
    };

    const getValidExtensions = (tab: ContentCategory): string[] => {
        const map: Record<ContentCategory, string[]> = {
            mods: [".jar"],
            resourcepacks: [".zip"],
            shaders: [".zip"],
            datapacks: [".zip"],
        };
        return map[tab];
    };

    const refreshContentType = (contentType: InstalledBrowserContentType) => {
        switch (contentType) {
            case "mod": return loadMods();
            case "resourcepack": return loadResourcepacks();
            case "shader": return loadShaders();
            case "datapack": return loadDatapacks();
        }
    };

    const getInstalledItemName = (item: Partial<ModInfo & ContentItem & DatapackItem>) =>
        item.displayName || item.name || item.filename?.replace(/\.(jar|zip)$/i, "") || "Project";

    const getInstanceActionId = () => instance.id;

    const slugifyProjectName = (name: string) =>
        name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";

    const normalizeModrinthProject = (
        raw: any,
        item: Partial<ModInfo & ContentItem & DatapackItem>,
        fallbackId?: string,
    ): ModrinthProject => {
        const title = raw?.title || raw?.name || getInstalledItemName(item);
        return {
            source: "modrinth",
            slug: raw?.slug || slugifyProjectName(title),
            title,
            description: raw?.description || item.description || "",
            categories: raw?.categories || raw?.display_categories || [],
            downloads: raw?.downloads || 0,
            icon_url: raw?.icon_url || raw?.iconUrl || item.icon || null,
            project_id: String(raw?.project_id || raw?.projectId || raw?.id || fallbackId || slugifyProjectName(title)),
            author: raw?.author || item.author || "Unknown",
            versions: raw?.versions || [],
            game_versions: raw?.game_versions || raw?.gameVersions || raw?.versions || [],
            loaders: raw?.loaders || [],
            follows: raw?.follows || raw?.followers || 0,
            client_side: raw?.client_side || raw?.clientSide,
            server_side: raw?.server_side || raw?.serverSide,
            gallery: raw?.gallery || [],
            featured_gallery: raw?.featured_gallery || raw?.featuredGallery || null,
            color: raw?.color,
            body: raw?.body,
            source_url: raw?.source_url || raw?.sourceUrl,
            wiki_url: raw?.wiki_url || raw?.wikiUrl,
            discord_url: raw?.discord_url || raw?.discordUrl,
            issues_url: raw?.issues_url || raw?.issuesUrl,
            license: raw?.license,
            date_created: raw?.published || raw?.date_created || raw?.dateCreated,
            date_modified: raw?.updated || raw?.date_modified || raw?.dateModified,
            project_type: raw?.project_type || raw?.projectType,
        };
    };

    const normalizeCurseForgeProject = (
        raw: any,
        item: Partial<ModInfo & ContentItem & DatapackItem>,
        fallbackId?: string,
    ): ModrinthProject => {
        const cf = raw?.data || raw || {};
        const title = cf.name || getInstalledItemName(item);
        return {
            source: "curseforge",
            slug: cf.slug || slugifyProjectName(title),
            title,
            description: cf.summary || item.description || "",
            categories: cf.categories?.map((category: any) => category.name) || [],
            downloads: cf.downloadCount || 0,
            icon_url: cf.logo?.url || item.icon || null,
            project_id: String(cf.id || fallbackId || slugifyProjectName(title)),
            author: cf.authors?.[0]?.name || item.author || "Unknown",
            versions: cf.latestFiles?.flatMap((file: any) => file.gameVersions || []) || [],
            follows: cf.thumbsUpCount || 0,
            client_side: "required",
            server_side: "optional",
            gallery: cf.screenshots?.map((shot: any) => shot.url) || [],
            featured_gallery: cf.screenshots?.[0]?.url || null,
            date_created: cf.dateCreated,
            date_modified: cf.dateModified,
            team_members: cf.authors?.map((author: any) => ({
                user: { username: author.name, avatar_url: undefined },
                role: "Author",
            })) || [],
        };
    };

    const searchInstalledProject = async (
        item: Partial<ModInfo & ContentItem & DatapackItem>,
        contentType: InstalledBrowserContentType,
    ) => {
        const query = getInstalledItemName(item);
        const facets: string[][] = [];
        if (instance.minecraftVersion) facets.push([`versions:${instance.minecraftVersion}`]);
        if (contentType === "mod" && instance.loader !== "vanilla") facets.push([`categories:${instance.loader}`]);

        const modrinthResult = await window.api?.modrinthSearch?.({
            query,
            projectType: contentType,
            sortBy: "relevance",
            limit: 1,
            offset: 0,
            facets: JSON.stringify(facets),
        });
        if (modrinthResult?.hits?.[0]) {
            return {
                source: CONTENT_SOURCES.MODRINTH,
                project: normalizeModrinthProject(modrinthResult.hits[0], item),
            };
        }

        const modLoaderMapping: Record<string, number> = {
            forge: 1,
            fabric: 4,
            quilt: 5,
            neoforge: 6,
        };
        const curseforgeResult = await window.api?.curseforgeSearch?.({
            query,
            projectType: contentType,
            gameVersion: instance.minecraftVersion || undefined,
            modLoaderType: contentType === "mod" ? modLoaderMapping[instance.loader?.toLowerCase()] : undefined,
            sortBy: "relevance",
            pageSize: 1,
            index: 0,
        });
        if (curseforgeResult?.data?.[0]) {
            return {
                source: CONTENT_SOURCES.CURSEFORGE,
                project: normalizeCurseForgeProject(curseforgeResult.data[0], item),
            };
        }

        return null;
    };

    const handleOpenInstalledProjectDetail = async (
        item: ModInfo | ContentItem | DatapackItem,
        contentType: InstalledBrowserContentType,
    ) => {
        try {
            setInstalledDetailContentType(contentType);
            let detail: { source: ContentSource; project: ModrinthProject } | null = null;

            if (item.modrinthProjectId) {
                const fullProject = await (window.api as any)?.modrinthGetProject?.(item.modrinthProjectId);
                detail = {
                    source: CONTENT_SOURCES.MODRINTH,
                    project: normalizeModrinthProject(fullProject, item, item.modrinthProjectId),
                };
            } else if (item.curseforgeProjectId) {
                const fullProject = await (window.api as any)?.curseforgeGetProject?.(item.curseforgeProjectId);
                detail = {
                    source: CONTENT_SOURCES.CURSEFORGE,
                    project: normalizeCurseForgeProject(fullProject, item, item.curseforgeProjectId),
                };
            } else {
                detail = await searchInstalledProject(item, contentType);
            }

            if (!detail) {
                toast.error(t("search_failed"));
                return;
            }

            setInstalledDetailSource(detail.source);
            setInstalledDetailProject(detail.project);
        } catch (error) {
            console.error("[InstanceDetail] Failed to open installed project detail:", error);
            toast.error(t("search_failed"));
        }
    };

    const handleInstallVersionFromInstalledDetail = async (project: ModrinthProject, versionId: string) => {
        setIsInstallingInstalledVersion(true);
        setInstalledVersionProgress({ stage: "downloading", message: "Downloading version..." });

        try {
            const result = await window.api?.contentDownloadToInstance?.({
                projectId: project.project_id,
                versionId,
                instanceId: getInstanceActionId(),
                contentType: installedDetailContentType,
                contentSource: installedDetailSource,
            });

            if (result?.ok) {
                toast.success(t("install_success_name").replace("{name}", project.title));
                if (instance.cloudId && result.filename) {
                    try {
                        const lockedMods = new Set(instance.lockedMods || []);
                        if (!lockedMods.has(result.filename)) {
                            const lockRes = await (window.api as any)?.instanceToggleLock?.(instance.id, result.filename);
                            if (lockRes?.ok && lockRes.lockedMods) {
                                onUpdate(instance.id, { lockedMods: lockRes.lockedMods });
                            }
                        }
                    } catch (error) {
                        console.error("Failed to auto-lock installed version:", error);
                    }
                }
                await refreshContentType(installedDetailContentType);
            } else {
                toast.error(result?.error || t("install_failed"));
            }
        } catch (error: any) {
            toast.error(error?.message || t("error_occurred"));
        } finally {
            setIsInstallingInstalledVersion(false);
            setInstalledVersionProgress(null);
        }
    };

    const handleUpdateContent = async (
        item: ModInfo | ContentItem | DatapackItem,
        contentType: InstalledBrowserContentType,
    ) => {
        const filename = item.filename;
        if (!filename || updatingFilenames.has(filename)) return;

        const markUpdating = (on: boolean) => {
            setUpdatingFilenames(prev => {
                const next = new Set(prev);
                if (on) next.add(filename);
                else next.delete(filename);
                return next;
            });
        };

        markUpdating(true);
        try {
            const mcVersion = instance.minecraftVersion;
            const loader = instance.loader?.toLowerCase();

            let latestVersionId: string | undefined;
            let latestVersionNumber: string | undefined;
            let projectId: string | undefined;
            let source: ContentSource | undefined;

            let resolvedItem: typeof item = item;
            if (!resolvedItem.modrinthProjectId && !resolvedItem.curseforgeProjectId) {
                const detail = await searchInstalledProject(resolvedItem, contentType);
                if (detail) {
                    if (detail.source === CONTENT_SOURCES.MODRINTH) {
                        resolvedItem = { ...resolvedItem, modrinthProjectId: detail.project.project_id };
                    } else {
                        resolvedItem = { ...resolvedItem, curseforgeProjectId: detail.project.project_id };
                    }
                }
            }

            if (resolvedItem.modrinthProjectId) {
                source = CONTENT_SOURCES.MODRINTH;
                projectId = resolvedItem.modrinthProjectId;
                const versions = await (window.api as any)?.modrinthGetVersions?.(resolvedItem.modrinthProjectId);
                if (Array.isArray(versions)) {
                    const compatible = versions.find((v: any) => {
                        const gvOk = !mcVersion || (v.game_versions || []).includes(mcVersion);
                        const loaderOk =
                            contentType !== "mod" ||
                            loader === "vanilla" ||
                            !loader ||
                            (v.loaders || []).map((l: string) => l.toLowerCase()).includes(loader);
                        return gvOk && loaderOk;
                    });
                    if (compatible) {
                        latestVersionId = compatible.id;
                        latestVersionNumber = compatible.version_number;
                    }
                }
            } else if (resolvedItem.curseforgeProjectId) {
                source = CONTENT_SOURCES.CURSEFORGE;
                projectId = String(resolvedItem.curseforgeProjectId);
                const files = await (window.api as any)?.curseforgeGetFiles?.(resolvedItem.curseforgeProjectId, mcVersion);
                const list = files?.data || files || [];
                if (Array.isArray(list) && list.length > 0) {
                    latestVersionId = String(list[0].id);
                    latestVersionNumber = list[0].displayName || list[0].fileName;
                }
            }

            if (!projectId || !latestVersionId || !source) {
                toast.error(t("search_failed"));
                return;
            }

            const currentVersion = (item as any).version || "";
            if (
                currentVersion &&
                latestVersionNumber &&
                String(latestVersionNumber).trim() === String(currentVersion).trim()
            ) {
                toast.success(t("up_to_date" as any) || "Already up to date");
                return;
            }

            const result = await window.api?.contentDownloadToInstance?.({
                projectId,
                versionId: latestVersionId,
                instanceId: getInstanceActionId(),
                contentType,
                contentSource: source,
            });

            if (!result?.ok) {
                toast.error(result?.error || t("install_failed"));
                return;
            }

            // Remove the old file if the new install produced a different filename
            const newFilename: string | undefined = result.filename;
            if (newFilename && newFilename !== filename) {
                try {
                    switch (contentType) {
                        case "mod":
                            await (window.api as any)?.instanceDeleteMod?.(instance.id, filename);
                            break;
                        case "resourcepack":
                            await (window.api as any)?.instanceDeleteResourcepack?.(instance.id, filename);
                            break;
                        case "shader":
                            await (window.api as any)?.instanceDeleteShader?.(instance.id, filename);
                            break;
                        case "datapack": {
                            const worldName = (item as DatapackItem).worldName;
                            if (worldName) {
                                await (window.api as any)?.instanceDeleteDatapack?.(instance.id, worldName, filename);
                            }
                            break;
                        }
                    }
                } catch (err) {
                    console.warn("[InstanceDetail] Failed to delete old file after update:", err);
                }
            }

            toast.success(t("install_success_name").replace("{name}", getInstalledItemName(item)));
            await refreshContentType(contentType);
        } catch (error: any) {
            toast.error(error?.message || t("error_occurred"));
        } finally {
            markUpdating(false);
        }
    };

    const handleOpenSwitcher = async (
        item: ModInfo | ContentItem | DatapackItem,
        contentType: InstalledBrowserContentType,
    ) => {
        let projectId: string | null = item.modrinthProjectId
            ? item.modrinthProjectId
            : item.curseforgeProjectId
              ? String(item.curseforgeProjectId)
              : null;
        let source: VersionSwitcherSource | null = item.modrinthProjectId
            ? "modrinth"
            : item.curseforgeProjectId
              ? "curseforge"
              : null;

        if (!projectId || !source) {
            const toastId = toast.loading(t("loading"));
            try {
                const detail = await searchInstalledProject(item, contentType);
                toast.dismiss(toastId);
                if (!detail) {
                    toast.error(t("search_failed"));
                    return;
                }
                projectId = detail.project.project_id;
                source = detail.source === CONTENT_SOURCES.CURSEFORGE ? "curseforge" : "modrinth";
            } catch (err) {
                toast.dismiss(toastId);
                toast.error(t("search_failed"));
                return;
            }
        }

        setSwitcherTarget({ item, contentType, projectId, source });
    };

    const handleConfirmSwitchVersion = async (entry: VersionEntry) => {
        if (!switcherTarget) return;
        const { item, contentType, projectId, source } = switcherTarget;
        const filename = item.filename;
        setSwitcherInstalling(true);
        try {
            const result = await window.api?.contentDownloadToInstance?.({
                projectId,
                versionId: entry.id,
                instanceId: getInstanceActionId(),
                contentType,
                contentSource: source === "modrinth" ? CONTENT_SOURCES.MODRINTH : CONTENT_SOURCES.CURSEFORGE,
            });

            if (!result?.ok) {
                toast.error(result?.error || t("install_failed"));
                return;
            }

            // Keep the old file until the replacement is confirmed. If the
            // downloaded file has the same name, it has already replaced it.
            const newFilename: string | undefined = result.filename;
            if (filename && newFilename && newFilename !== filename) {
                try {
                    switch (contentType) {
                        case "mod":
                            await (window.api as any)?.instanceDeleteMod?.(instance.id, filename);
                            break;
                        case "resourcepack":
                            await (window.api as any)?.instanceDeleteResourcepack?.(instance.id, filename);
                            break;
                        case "shader":
                            await (window.api as any)?.instanceDeleteShader?.(instance.id, filename);
                            break;
                        case "datapack": {
                            const worldName = (item as DatapackItem).worldName;
                            if (worldName) {
                                await (window.api as any)?.instanceDeleteDatapack?.(instance.id, worldName, filename);
                            }
                            break;
                        }
                    }
                } catch (err) {
                    console.warn("[VersionSwitch] Failed to delete old file after switch:", err);
                    toast.error(t("old_version_delete_failed" as any));
                }
            }

            // Force cache invalidation before reading the list back.
            try {
                await (window.api as any)?.invalidateInstancesListCache?.();
            } catch {}

            toast.success(t("install_success_name").replace("{name}", entry.versionNumber));
            await refreshContentType(contentType);
            setSwitcherTarget(null);
        } catch (error: any) {
            console.error("[VersionSwitch] error:", error);
            toast.error(error?.message || t("error_occurred"));
        } finally {
            setSwitcherInstalling(false);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files);
        console.log("[Drop] Files:", files.length, files.map(f => f.name));

        const contentType = getContentTypeForTab(contentTab);
        const validExts = getValidExtensions(contentTab);

        let successCount = 0;
        let errorMessages: string[] = [];

        for (const file of files) {
            let filePath: string | undefined;

            filePath = (file as any).path;
            console.log("[Drop] File path from .path:", filePath);

            if (!filePath && window.api?.getPathForFile) {
                try {
                    filePath = window.api.getPathForFile(file);
                    console.log("[Drop] File path from webUtils:", filePath);
                } catch (err) {
                    console.warn("[Drop] Failed to get path via webUtils:", err);
                }
            }

            if (!filePath) {
                errorMessages.push(`ไม่สามารถอ่านไฟล์ ${file.name}`);
                continue;
            }

            const ext = "." + file.name.split(".").pop()?.toLowerCase();
            if (!validExts.includes(ext)) {
                errorMessages.push(`${file.name}: ไม่รองรับ ${ext}`);
                continue;
            }

            console.log("[Drop] Adding file:", filePath, "as", contentType);
            const result = await (window.api as any)?.instanceAddContentFile?.(instance.id, filePath, contentType);
            console.log("[Drop] Result:", result);

            if (result?.ok) {
                successCount++;
                
                if (instance.cloudId && result.filename) {
                    try {
                        const lockedMods = new Set(instance.lockedMods || []);
                        if (!lockedMods.has(result.filename)) {
                            const res = await (window.api as any)?.instanceToggleLock?.(instance.id, result.filename);
                            if (res?.ok && res.lockedMods) {
                                onUpdate(instance.id, { lockedMods: res.lockedMods });
                            }
                        }
                    } catch (e) {
                        console.error("Failed to auto-lock dropped file:", e);
                    }
                }
            } else {
                errorMessages.push(`${file.name}: ${result?.error || t('error_occurred')}`);
            }
        }

        if (successCount > 0) {
            toast.success(t('files_added_success'));
            switch (contentTab) {
                case "mods": loadMods(); break;
                case "resourcepacks": loadResourcepacks(); break;
                case "shaders": loadShaders(); break;
                case "datapacks": loadDatapacks(); break;
            }
        }
        if (errorMessages.length > 0) {
            toast.error(errorMessages.slice(0, 3).join("\n") + (errorMessages.length > 3 ? `\n${t('and_more_files').replace('{count}', String(errorMessages.length - 3))}` : ""));
        }
    };

    useEffect(() => {
        if (modRefreshDebounceRef.current) {
            clearTimeout(modRefreshDebounceRef.current);
            modRefreshDebounceRef.current = null;
        }
        const defaultTab: ContentCategory =
            instance.loader === "vanilla" ? "resourcepacks" : "mods";
        setContentTab(defaultTab);
        setLoadedTabs(new Set());
        setMods([]);
        setResourcepacks([]);
        setShaders([]);
        setDatapacks([]);
        setInstalledDetailProject(null);
        setShowContentBrowser(false);
        return () => {
            if (modRefreshDebounceRef.current) {
                clearTimeout(modRefreshDebounceRef.current);
                modRefreshDebounceRef.current = null;
            }
        };
    }, [instance.id, instance.loader]);

    const loadMods = async (options?: { silent?: boolean; metadataRetry?: number }) => {
        const silent = options?.silent === true;
        const metadataRetry = options?.metadataRetry ?? 0;
        if (!silent) setModsLoading(true);

        try {
            const result = await (window.api as any)?.instanceListMods?.(instance.id);

            if (result?.ok) {
                const loaded: ModInfo[] = result.mods || [];
                setMods(loaded);
                if (result.hasUncached) {
                    const MAX_RETRIES = loaded.length > 120 ? 8 : 20;
                    const retryDelay = loaded.length > 120 ? 1800 : 600;
                    if (metadataRetry < MAX_RETRIES) {
                        if (modRefreshDebounceRef.current) {
                            clearTimeout(modRefreshDebounceRef.current);
                        }
                        modRefreshDebounceRef.current = setTimeout(() => {
                            loadMods({
                                silent: true,
                                metadataRetry: metadataRetry + 1,
                            });
                        }, retryDelay);
                    }
                }
            } else {
                if (!silent) toast.error(result?.error || t('load_mods_failed'));
            }
        } catch (error) {
            console.error("[InstanceDetail] Failed to load mods:", error);
        } finally {
            if (!silent) setModsLoading(false);
        }
    };

    const loadResourcepacks = async () => {
        setResourcepacksLoading(true);
        try {
            const result = await (window.api as any)?.instanceListResourcepacks?.(instance.id);
            if (result?.ok) setResourcepacks(result.items || []);
        } catch (error) {
            console.error("[InstanceDetail] Failed to load resourcepacks:", error);
        } finally {
            setResourcepacksLoading(false);
        }
    };

    const loadShaders = async () => {
        setShadersLoading(true);
        try {
            const result = await (window.api as any)?.instanceListShaders?.(instance.id);
            if (result?.ok) setShaders(result.items || []);
        } catch (error) {
            console.error("[InstanceDetail] Failed to load shaders:", error);
        } finally {
            setShadersLoading(false);
        }
    };

    const loadDatapacks = async () => {
        setDatapacksLoading(true);
        try {
            const result = await (window.api as any)?.instanceListDatapacks?.(instance.id);
            if (result?.ok) setDatapacks(result.items || []);
        } catch (error) {
            console.error("[InstanceDetail] Failed to load datapacks:", error);
        } finally {
            setDatapacksLoading(false);
        }
    };

    useEffect(() => {
        const unbind = (window.api as any)?.onModsIconsUpdated?.((updatedInstanceId: string) => {
            if (updatedInstanceId === instance.id) {
                // Debounce the refresh to prevent UI stutter when many mods update rapidly
                if (modRefreshDebounceRef.current) {
                    clearTimeout(modRefreshDebounceRef.current);
                }
                modRefreshDebounceRef.current = setTimeout(() => {
                    loadMods({ silent: true });
                }, 800);
            }
        });
        
        return () => {
            if (unbind) unbind();
            if (modRefreshDebounceRef.current) {
                clearTimeout(modRefreshDebounceRef.current);
            }
        };
    }, [instance.id]);

    // Lazy-load only the active content tab to avoid heavy first render stalls.
    useEffect(() => {
        if (loadedTabs.has(contentTab)) return;
        let cancelled = false;

        const loadTab = async () => {
            switch (contentTab) {
                case "mods":
                    await loadMods();
                    break;
                case "resourcepacks":
                    await loadResourcepacks();
                    break;
                case "shaders":
                    await loadShaders();
                    break;
                case "datapacks":
                    await loadDatapacks();
                    break;
            }

            if (cancelled) return;
            setLoadedTabs(prev => {
                if (prev.has(contentTab)) return prev;
                const next = new Set(prev);
                next.add(contentTab);
                return next;
            });
        };

        void loadTab();
        return () => {
            cancelled = true;
        };
    }, [contentTab, instance.id, loadedTabs]);

    const handleToggleMod = async (filename: string) => {
        try {
            const result = await (window.api as any)?.instanceToggleMod?.(instance.id, filename);
            if (result?.ok) {
                setMods(prev => prev.map(mod =>
                    mod.filename === filename
                        ? { ...mod, filename: result.newFilename, enabled: result.enabled }
                        : mod
                ));
            } else {
                toast.error(result?.error || t('toggle_mod_failed'));
            }
        } catch (error) {
            toast.error(t('error_occurred'));
        }
    };

    type DeleteOptions = { silent?: boolean };

    const handleDeleteMod = async (filename: string, _options?: DeleteOptions): Promise<DeleteResult> => {
        try {
            const result = await (window.api as any)?.instanceDeleteMod?.(instance.id, filename);
            if (result?.ok) {
                setMods(prev => prev.filter(mod => mod.filename !== filename));
                return { ok: true };
            } else {
                const errorMessage = result?.error || t('error_occurred');
                return { ok: false, error: errorMessage };
            }
        } catch (error) {
            const errorMessage = t('error_occurred');
            return { ok: false, error: errorMessage };
        }
    };

    const handleToggleResourcepack = async (filename: string) => {
        try {
            const result = await (window.api as any)?.instanceToggleResourcepack?.(instance.id, filename);
            if (result?.ok) {
                setResourcepacks(prev => prev.map(item =>
                    item.filename === filename
                        ? { ...item, filename: result.newFilename, enabled: result.enabled }
                        : item
                ));
            } else {
                toast.error(result?.error || t('error_occurred'));
            }
        } catch (error) {
            toast.error(t('error_occurred'));
        }
    };

    const handleDeleteResourcepack = async (filename: string, _worldName?: string, _options?: DeleteOptions): Promise<DeleteResult> => {
        try {
            const result = await (window.api as any)?.instanceDeleteResourcepack?.(instance.id, filename);
            if (result?.ok) {
                setResourcepacks(prev => prev.filter(item => item.filename !== filename));
                return { ok: true };
            } else {
                const errorMessage = result?.error || t('error_occurred');
                return { ok: false, error: errorMessage };
            }
        } catch (error) {
            const errorMessage = t('error_occurred');
            return { ok: false, error: errorMessage };
        }
    };

    const handleToggleShader = async (filename: string) => {
        try {
            const result = await (window.api as any)?.instanceToggleShader?.(instance.id, filename);
            if (result?.ok) {
                setShaders(prev => prev.map(item =>
                    item.filename === filename
                        ? { ...item, filename: result.newFilename, enabled: result.enabled }
                        : item
                ));
            } else {
                toast.error(result?.error || t('error_occurred'));
            }
        } catch (error) {
            toast.error(t('error_occurred'));
        }
    };

    const handleDeleteShader = async (filename: string, _worldName?: string, _options?: DeleteOptions): Promise<DeleteResult> => {
        try {
            const result = await (window.api as any)?.instanceDeleteShader?.(instance.id, filename);
            if (result?.ok) {
                setShaders(prev => prev.filter(item => item.filename !== filename));
                return { ok: true };
            } else {
                const errorMessage = result?.error || t('error_occurred');
                return { ok: false, error: errorMessage };
            }
        } catch (error) {
            const errorMessage = t('error_occurred');
            return { ok: false, error: errorMessage };
        }
    };

    const handleToggleDatapack = async (filename: string, worldName?: string) => {
        if (!worldName) return;
        try {
            const result = await (window.api as any)?.instanceToggleDatapack?.(instance.id, worldName, filename);
            if (result?.ok) {
                setDatapacks(prev => prev.map(item =>
                    item.worldName === worldName && item.filename === filename
                        ? { ...item, filename: result.newFilename, enabled: result.enabled }
                        : item
                ));
            } else {
                toast.error(result?.error || t('error_occurred'));
            }
        } catch (error) {
            toast.error(t('error_occurred'));
        }
    };

    const handleDeleteDatapack = async (filename: string, worldName?: string, _options?: DeleteOptions): Promise<DeleteResult> => {
        if (!worldName) {
            const errorMessage = t('error_occurred');
            return { ok: false, error: errorMessage };
        }
        try {
            const result = await (window.api as any)?.instanceDeleteDatapack?.(instance.id, worldName, filename);
            if (result?.ok) {
                setDatapacks(prev => prev.filter(item => !(item.worldName === worldName && item.filename === filename)));
                return { ok: true };
            } else {
                const errorMessage = result?.error || t('error_occurred');
                return { ok: false, error: errorMessage };
            }
        } catch (error) {
            const errorMessage = t('error_occurred');
            return { ok: false, error: errorMessage };
        }
    };

    const handlePlayStop = () => {
        if (showStopAction) {
            onStop();
        } else {
            onPlay(instance.id);
        }
    };

    const validExtsLabel = getValidExtensions(contentTab).join(", ");
    const contentTypeLabel = {
        mods: t('mods'),
        resourcepacks: t('resourcepacks'),
        shaders: t('shaders'),
        datapacks: t('datapacks'),
    }[contentTab];

    return (
        <div
            className="space-y-4 relative w-full animate-fade-in"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {isDragging && (
                <div
                    className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-3 rounded-full pointer-events-none animate-pulse"
                    style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                >
                    <Icons.Folder className="w-6 h-6" />
                    <span className="font-medium">{t('drop_to_add_content' as any).replace('{ext}', validExtsLabel).replace('{type}', contentTypeLabel)}</span>
                </div>
            )}

            {!showContentBrowser && !installedDetailProject && (instance.banner ? (
                <div className="rounded-2xl overflow-hidden relative mb-6 border" style={{ borderColor: colors.outline + "30", backgroundColor: colors.surfaceContainer }}>
                    <div className="relative h-48 w-full bg-cover bg-center"
                        style={{
                            backgroundColor: colors.surfaceContainerHighest,
                        }}>
                        <img
                            src={instance.banner}
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                            }}
                            className="absolute inset-0 w-full h-full object-cover"
                            alt="banner"
                        />
                        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent" />

                        <button
                            onClick={() => { playClick(); onBack(); }}
                            className="absolute top-4 left-4 w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 z-20 backdrop-blur-md"
                            style={{ backgroundColor: "rgba(0,0,0,0.5)", color: "#ffffff" }}
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                            </svg>
                        </button>

                        <div className="absolute -bottom-8 left-8 w-24 h-24 rounded-2xl p-1 z-10"
                            style={{ backgroundColor: (instance.icon?.startsWith("data:") || instance.icon?.startsWith("file://") || instance.icon?.startsWith("http")) ? 'transparent' : colors.surface }}>
                            <div className="w-full h-full rounded-[14px] bg-cover bg-center overflow-hidden flex items-center justify-center"
                                style={{
                                    backgroundColor: (instance.icon?.startsWith("data:") || instance.icon?.startsWith("file://") || instance.icon?.startsWith("http")) ? 'transparent' : colors.surfaceContainerHighest
                                }}>
                                {instance.icon?.startsWith("data:") || instance.icon?.startsWith("file://") || instance.icon?.startsWith("http") ? (
                                    <img src={instance.icon} alt="icon" className="w-full h-full object-cover" />
                                ) : (
                                    <Icons.Box className="w-10 h-10 opacity-50" style={{ color: colors.onSurfaceVariant }} />
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="pt-12 px-8 pb-8 flex flex-col md:flex-row md:items-end gap-6">
                        <div className="flex-1 min-w-0">
                            <h2 className="text-3xl font-black tracking-tight mb-2 truncate" style={{ color: colors.onSurface }}>{instance.name}</h2>
                            <div className="flex flex-wrap items-center gap-4 text-sm font-medium" style={{ color: colors.onSurfaceVariant }}>
                                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                    {getLoaderLabel(instance.loader)}
                                    <span className="w-1 h-1 rounded-full bg-current opacity-50" />
                                    {instance.minecraftVersion}
                                </div>

                                {instance.totalPlayTime > 0 && (
                                    <div className="flex items-center gap-1.5">
                                        <i className="fa-solid fa-clock text-xs opacity-70"></i>
                                        <span>{formatPlayTime(instance.totalPlayTime, { minutes: t('minutes_unit'), hours: t('hours_unit') })}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => { playClick(); onOpenFolder(instance.id); }}
                                className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:bg-white/5 active:scale-95"
                                style={{ border: `1px solid ${colors.outline}30`, color: colors.onSurface }}
                                title={t('open_folder')}
                            >
                                <Icons.Folder className="w-5 h-5" />
                            </button>

                            <button
                                onClick={() => { playClick(); onViewLogs(instance.id); }}
                                className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:bg-white/5 active:scale-95"
                                style={{ border: `1px solid ${colors.outline}30`, color: colors.onSurface }}
                                title={t('view_logs')}
                            >
                                <Icons.Terminal className="w-5 h-5" />
                            </button>

                            <button
                                onClick={() => { playClick(); setShowSettings(true); }}
                                className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:bg-white/5 active:scale-95"
                                style={{ border: `1px solid ${colors.outline}30`, color: colors.onSurface }}
                                title={t('settings')}
                            >
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                                </svg>
                            </button>

                            <button
                                onClick={() => { playClick(); handlePlayStop(); }}
                                disabled={disablePlayStopButton || isInstallLocked}
                                className="h-12 px-8 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center gap-2"
                                style={{
                                    backgroundColor: showStopAction ? "#ef4444" : colors.secondary,
                                    color: showStopAction ? "#ffffff" : "#1a1a1a"
                                }}
                            >
                                {isInstallLocked ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                        {t('installing')}
                                    </>
                                ) : showStopAction ? (
                                    <>
                                        {showLaunchSpinner ? (
                                            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M6 6h12v12H6z" />
                                            </svg>
                                        )}
                                        {t('stop')}
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                        {t('play')}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col md:flex-row items-start md:items-center gap-6 mb-8 pt-2">
                    <button
                        onClick={() => { playClick(); onBack(); }}
                        className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 shrink-0"
                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                        </svg>
                    </button>

                    <div className="w-24 h-24 rounded-2xl flex items-center justify-center text-4xl overflow-hidden shrink-0"
                        style={{ backgroundColor: (instance.icon?.startsWith("data:") || instance.icon?.startsWith("file://") || instance.icon?.startsWith("http")) ? 'transparent' : colors.surfaceContainer }}>
                        {instance.icon?.startsWith("data:") || instance.icon?.startsWith("file://") || instance.icon?.startsWith("http") ? (
                            <img src={instance.icon} alt="icon" className="w-full h-full object-cover" />
                        ) : (
                            <Icons.Box className="w-12 h-12" style={{ color: colors.onSurfaceVariant }} />
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <h2 className="text-3xl font-black tracking-tight mb-2 truncate" style={{ color: colors.onSurface }}>{instance.name}</h2>
                        <div className="flex flex-wrap items-center gap-4 text-sm font-medium" style={{ color: colors.onSurfaceVariant }}>
                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                {getLoaderLabel(instance.loader)}
                                <span className="w-1 h-1 rounded-full bg-current opacity-50" />
                                {instance.minecraftVersion}
                            </div>

                            {instance.totalPlayTime > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <i className="fa-solid fa-clock text-xs opacity-70"></i>
                                    <span>{formatPlayTime(instance.totalPlayTime, { minutes: t('minutes_unit'), hours: t('hours_unit') })}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => { playClick(); onOpenFolder(instance.id); }}
                            className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:bg-white/5 active:scale-95"
                            style={{ border: `1px solid ${colors.outline}30`, color: colors.onSurface }}
                            title={t('open_folder')}
                        >
                            <Icons.Folder className="w-5 h-5" />
                        </button>

                        <button
                            onClick={() => { playClick(); onViewLogs(instance.id); }}
                            className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:bg-white/5 active:scale-95"
                            style={{ border: `1px solid ${colors.outline}30`, color: colors.onSurface }}
                            title={t('view_logs')}
                        >
                            <Icons.Terminal className="w-5 h-5" />
                        </button>

                        <button
                            onClick={() => { playClick(); setShowSettings(true); }}
                            className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:bg-white/5 active:scale-95"
                            style={{ border: `1px solid ${colors.outline}30`, color: colors.onSurface }}
                            title={t('settings')}
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                            </svg>
                        </button>

                        <button
                            onClick={() => { playClick(); handlePlayStop(); }}
                            disabled={disablePlayStopButton || isInstallLocked}
                            className="h-12 px-8 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center gap-2"
                            style={{
                                backgroundColor: showStopAction ? "#ef4444" : colors.secondary,
                                color: showStopAction ? "#ffffff" : "#1a1a1a"
                            }}
                        >
                            {isInstallLocked ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    {t('installing')}
                                </>
                            ) : showStopAction ? (
                                <>
                                    {showLaunchSpinner ? (
                                        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M6 6h12v12H6z" />
                                        </svg>
                                    )}
                                    {t('stop')}
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                    {t('play')}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            ))}


            {installedDetailProject ? (
                <ProjectDetailPage
                    colors={colors}
                    project={installedDetailProject}
                    projectType={installedDetailContentType as any}
                    contentSource={installedDetailSource}
                    isInstallingModpack={isInstallingInstalledVersion}
                    installProgress={installedVersionProgress}
                    onBack={() => setInstalledDetailProject(null)}
                    onInstallModpack={() => {}}
                    onAddToInstance={() => toast("เลือกเวอร์ชันจากแท็บ versions เพื่อเปลี่ยนไฟล์ใน Instance นี้")}
                    isInstalledProject={true}
                    onInstallVersion={handleInstallVersionFromInstalledDetail}
                />
            ) : showContentBrowser ? (
                <InstanceContentBrowser
                    colors={colors}
                    instance={instance}
                    contentType={browserContentType}
                    config={config}
                    onClose={() => setShowContentBrowser(false)}
                    onInstalled={() => {
                        switch (browserContentType) {
                            case "mod": loadMods(); break;
                            case "resourcepack": loadResourcepacks(); break;
                            case "shader": loadShaders(); break;
                            case "datapack": loadDatapacks(); break;
                        }
                    }}
                    onUpdate={onUpdate}
                />
            ) : (
                <>
                    <ContentTabs
                        colors={colors}
                        activeTab={contentTab}
                        modsCount={mods.length}
                        modsLoading={modsLoading}
                        resourcepacksCount={resourcepacks.length}
                        datapacksCount={datapacks.length}
                        shadersCount={shaders.length}
                        onTabChange={setContentTab}
                        loader={instance.loader}
                    />

                    <div>
                        {contentTab === "mods" && (
                            <ModsList
                                colors={colors}
                                instanceId={instance.id}
                                instanceName={instance.name}
                                minecraftVersion={instance.minecraftVersion}
                                loader={instance.loader}
                                mods={mods}
                                isLoading={modsLoading}
                                onToggle={handleToggleMod}
                                onDelete={handleDeleteMod}
                                onRefresh={loadMods}
                                onAddMod={() => { setBrowserContentType("mod"); setShowContentBrowser(true); }}
                                onOpenProjectDetail={(mod) => handleOpenInstalledProjectDetail(mod, "mod")}
                                onUpdate={(mod) => handleUpdateContent(mod, "mod")}
                                updatingFilenames={updatingFilenames}
                                onSwitchVersion={(mod) => handleOpenSwitcher(mod, "mod")}
                                lockedMods={new Set(instance.cloudId ? (instance.lockedMods || []) : [])}
                                isServerManaged={!!instance.cloudId}
                                onToggleLock={instance.cloudId ? async (filename) => {
                                    try {
                                        const result = await (window.api as any)?.instanceToggleLock?.(instance.id, filename);
                                        if (result?.ok) {
                                            if (result.lockedMods) {
                                                onUpdate(instance.id, { lockedMods: result.lockedMods });
                                            }
                                        } else {
                                            toast.error(t('save_lock_failed' as any));
                                        }
                                    } catch (e) {
                                        toast.error(t('error_occurred' as any));
                                    }
                                } : undefined}
                                onBulkLock={instance.cloudId ? async (filenames, lock) => {
                                    try {
                                        const result = await (window.api as any)?.instanceLockMods?.(instance.id, filenames, lock);
                                        if (result?.ok) {
                                            if (result.lockedMods) {
                                                onUpdate(instance.id, { lockedMods: result.lockedMods });
                                            }
                                            toast.success(lock ? "Locked selected mods" : "Unlocked selected mods");
                                        } else {
                                            toast.error(t('save_lock_failed' as any));
                                        }
                                    } catch (e) {
                                        toast.error(t('error_occurred' as any));
                                    }
                                } : undefined}
                            />
                        )}

                        {contentTab === "resourcepacks" && (
                            <ContentList
                                colors={colors}
                                instanceId={instance.id}
                                instanceName={instance.name}
                                minecraftVersion={instance.minecraftVersion}
                                loader={instance.loader}
                                items={resourcepacks}
                                isLoading={resourcepacksLoading}
                                contentType="resourcepack"
                                emptyMessage={t('no_resourcepacks' as any)}
                                onToggle={handleToggleResourcepack}
                                onDelete={handleDeleteResourcepack}
                                onAddContent={() => { setBrowserContentType("resourcepack"); setShowContentBrowser(true); }}
                                onRefresh={loadResourcepacks}
                                onOpenProjectDetail={(item) => handleOpenInstalledProjectDetail(item, "resourcepack")}
                                onUpdate={(item) => handleUpdateContent(item, "resourcepack")}
                                updatingFilenames={updatingFilenames}
                                onSwitchVersion={(item) => handleOpenSwitcher(item, "resourcepack")}
                            />
                        )}

                        {contentTab === "datapacks" && (
                            <ContentList
                                colors={colors}
                                instanceId={instance.id}
                                instanceName={instance.name}
                                minecraftVersion={instance.minecraftVersion}
                                loader={instance.loader}
                                items={datapacks}
                                isLoading={datapacksLoading}
                                contentType="datapack"
                                emptyMessage={t('no_datapacks' as any)}
                                onToggle={handleToggleDatapack}
                                onDelete={handleDeleteDatapack}
                                onAddContent={() => { setBrowserContentType("datapack"); setShowContentBrowser(true); }}
                                onRefresh={loadDatapacks}
                                onOpenProjectDetail={(item) => handleOpenInstalledProjectDetail(item, "datapack")}
                                onUpdate={(item) => handleUpdateContent(item, "datapack")}
                                updatingFilenames={updatingFilenames}
                                onSwitchVersion={(item) => handleOpenSwitcher(item, "datapack")}
                            />
                        )}

                        {contentTab === "shaders" && (
                            <ContentList
                                colors={colors}
                                instanceId={instance.id}
                                instanceName={instance.name}
                                minecraftVersion={instance.minecraftVersion}
                                loader={instance.loader}
                                items={shaders}
                                isLoading={shadersLoading}
                                contentType="shader"
                                emptyMessage={t('no_shaders' as any)}
                                onToggle={handleToggleShader}
                                onDelete={handleDeleteShader}
                                onAddContent={() => { setBrowserContentType("shader"); setShowContentBrowser(true); }}
                                onRefresh={loadShaders}
                                onOpenProjectDetail={(item) => handleOpenInstalledProjectDetail(item, "shader")}
                                onUpdate={(item) => handleUpdateContent(item, "shader")}
                                updatingFilenames={updatingFilenames}
                                onSwitchVersion={(item) => handleOpenSwitcher(item, "shader")}
                            />
                        )}
                    </div>
                </>
            )}

            {switcherTarget && (
                <VersionSwitcherModal
                    colors={colors}
                    title={
                        (switcherTarget.item as any).displayName ||
                        switcherTarget.item.name ||
                        switcherTarget.item.filename
                    }
                    iconUrl={switcherTarget.item.icon || null}
                    currentVersion={(switcherTarget.item as any).version}
                    currentVersionId={(switcherTarget.item as any).installedVersionId}
                    instanceMcVersion={instance.minecraftVersion}
                    instanceLoader={instance.loader}
                    contentType={switcherTarget.contentType}
                    projectId={switcherTarget.projectId}
                    source={switcherTarget.source}
                    isInstalling={switcherInstalling}
                    onClose={() => { if (!switcherInstalling) setSwitcherTarget(null); }}
                    onSwitch={handleConfirmSwitchVersion}
                />
            )}

            {
                showSettings && (
                    <InstanceSettingsModal
                        colors={colors}
                        instance={instance}
                        onClose={() => setShowSettings(false)}
                        onUpdate={onUpdate}
                        onDelete={onDelete}
                        onDuplicate={onDuplicate}
                        onExport={onExport}
                        language={config.language}
                        config={config}
                        onRepair={onRepair}
                    />
                )
            }
        </div >
    );
}
