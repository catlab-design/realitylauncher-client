/**
 * InstanceSettingsModal - Modal แสดงการตั้งค่า Instance
 */

import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Icons } from "../../ui/Icons";
import type { GameInstance } from "../../../types/launcher";
import { playClick } from "../../../lib/sounds";
import { useTranslation } from "../../../hooks/useTranslation";
import { InstallProgressModal, type InstallProgress } from "./InstallProgressModal";
import { FileSelectionTree, type FileNode } from "./FileSelectionTree";
import modrinthIcon from "../../../assets/modrinth.svg";
import curseforgeIcon from "../../../assets/curseforge.svg";
import type { LauncherConfig } from "../../../types/launcher";

type SettingsTab = "general" | "installation" | "java" | "export";
type LoaderType = "vanilla" | "fabric" | "forge" | "neoforge" | "quilt";

export interface InstanceSettingsModalProps {
    colors: any;
    instance: GameInstance;
    onClose: () => void;
    onUpdate: (id: string, updates: Partial<GameInstance>) => void;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
    onExport: (id: string, options: any) => Promise<void>;
    language: "th" | "en";
    config: LauncherConfig;
    onRepair?: (id: string) => void;
}

export function InstanceSettingsModal({
    colors,
    instance,
    onClose,
    onUpdate,
    onDelete,
    onDuplicate,
    onExport,
    language,
    config,
    onRepair,
}: InstanceSettingsModalProps) {
    const { t } = useTranslation(language);
    const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
    const [editedName, setEditedName] = useState(instance.name);
    const [deleteConfirm, setDeleteConfirm] = useState(false);

    // Export state
    const [exportStep, setExportStep] = useState<"format" | "config">("format");
    const [selectedFormat, setSelectedFormat] = useState<"zip" | "mrpack">("zip");
    const [exportOptions, setExportOptions] = useState({
        name: instance.name,
        version: "1.0.0",
        description: "",
        includedPaths: ["mods", "config", "resourcepacks", "shaderpacks"]
    });
    
    // File Tree State
    const [fileTree, setFileTree] = useState<FileNode[]>([]);
    const [loadingFiles, setLoadingFiles] = useState(false);
    
    // Reset export state when tab changes
    useEffect(() => {
        if (!isExporting && settingsTab !== "export") { // Don't reset if actively exporting or just switching sub-steps
            setExportStep("format");
            setExportOptions({
                name: instance.name,
                version: "1.0.0",
                description: "",
                includedPaths: ["mods", "config", "resourcepacks", "shaderpacks"]
            });
            setFileTree([]);
        }
    }, [settingsTab]);

    // Fetch files when entering config step
    useEffect(() => {
        if (settingsTab === "export" && exportStep === "config") {
            const fetchFiles = async () => {
                if (!window.api) return;
                setLoadingFiles(true);
                try {
                    const result = await window.api.instancesListFiles(instance.id);
                    if (result.ok && result.files) {
                        setFileTree(result.files);
                        
                        // Expand default folders to files
                        setExportOptions(prev => {
                            const newPaths = new Set<string>();
                            const currentPaths = prev.includedPaths;
                            
                            // Helper to collect files from tree based on folder match
                            const collectFiles = (nodes: FileNode[]) => {
                                for (const node of nodes) {
                                    if (node.type === "file") {
                                        // If explicit file match OR parent folder match
                                        const isExplicit = currentPaths.includes(node.path);
                                        // Check if any default folder covers this file
                                        const isCovered = currentPaths.some(p => node.path.startsWith(p + "/"));
                                        
                                        if (isExplicit || isCovered) {
                                            newPaths.add(node.path);
                                        }
                                    } else if (node.children) {
                                        collectFiles(node.children);
                                    }
                                }
                            };
                            
                            const filesToProcess = (result.files as FileNode[]) || [];
                            collectFiles(filesToProcess);
                            
                            return { ...prev, includedPaths: Array.from(newPaths) };
                        });
                    }
                } catch (error) {
                    console.error("Failed to list files:", error);
                    toast.error(t('error_loading_files'));
                } finally {
                    setLoadingFiles(false);
                }
            };
            fetchFiles();
        }
    }, [settingsTab, exportStep, instance.id]);

    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState<InstallProgress>({ stage: "extracting", message: "", percent: 0 });
    const [minimized, setMinimized] = useState(false);

    useEffect(() => {
        if (!isExporting) {
            setMinimized(false);
            return;
        }

        // Subscribe to progress events
        const cleanup = window.api?.onExportProgress?.((_id, progress) => {
            setExportProgress({
                stage: "copying",
                message: `${t('export')}...`,
                percent: progress.percent,
                current: progress.transferred,
                total: progress.total
            });
        });

        return () => {
            cleanup?.();
        };
    }, [isExporting]);

    const handleFormatSelect = (format: "zip" | "mrpack") => {
        playClick();
        setSelectedFormat(format);
        setExportStep("config");
    };

    const handleExport = async () => {
        playClick();
        
        // Prepare options
        const options = {
            format: selectedFormat,
            ...exportOptions
        };
        
        // Close modal immediately and trigger export in background
        onClose();
        onExport(instance.id, options);
    };

    const handleCancelExport = async () => {
        playClick();
        try {
            await window.api?.instancesExportCancel?.(instance.id);
        } catch (error) {
            console.error("Failed to cancel export:", error);
        }
    };
    


    // Helpers
    const formatBytes = (bytes: number) => {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    // ... rest of code ...

    // START OF UI REPLACEMENT
    /* This replacement targets the "Files Section" in the render method */
    /* Check previous content to match lines */
    
    // Actually, I can't replace scattered parts easily.
    // I will use multiple replace calls or handle them conceptually.
    // Let's first remove the helpers.






    // Installation settings state
    const [editedLoader, setEditedLoader] = useState<LoaderType>(instance.loader as LoaderType);
    const [editedVersion, setEditedVersion] = useState(instance.minecraftVersion);
    const [editedLoaderVersion, setEditedLoaderVersion] = useState(instance.loaderVersion);
    // Java settings
    const [editedJavaPath, setEditedJavaPath] = useState(instance.javaPath || "");
    const [editedRam, setEditedRam] = useState(instance.ramMB || config.ramMB);
    const [editedJavaArgs, setEditedJavaArgs] = useState(instance.javaArguments || instance.javaArguments === "" ? instance.javaArguments : config.javaArguments);
    // Advanced settings
    const [loaderVersions, setLoaderVersions] = useState<string[]>([]);
    const [loadingLoaderVersions, setLoadingLoaderVersions] = useState(false);
    const [maxRamMB, setMaxRamMB] = useState(0);

    // Fetch system info
    useEffect(() => {
        (async () => {
            if (window.api) {
                const sysRam = await (window.api as any).getSystemRam?.();
                if (sysRam) setMaxRamMB(sysRam);
            }
        })();
    }, []);

    // Sync local state with instance prop (e.g. when background sync updates loader/version)
    useEffect(() => {
        setEditedName(instance.name);
        setEditedLoader(instance.loader as LoaderType);
        setEditedVersion(instance.minecraftVersion);
        setEditedLoaderVersion(instance.loaderVersion);
        setEditedJavaPath(instance.javaPath || "");
        setEditedRam(instance.ramMB || config.ramMB);
        setEditedJavaArgs(instance.javaArguments || instance.javaArguments === "" ? instance.javaArguments : config.javaArguments);
    }, [instance, config]);

    // Fetch loader versions when loader or mc version changes
    useEffect(() => {
        if (editedLoader === "vanilla") {
            setLoaderVersions([]);
            setEditedLoaderVersion(undefined);
            return;
        }

        const fetchVersions = async () => {
            if (!window.api) return;
            setLoadingLoaderVersions(true);
            try {
                // Check if API exists (it should now)
                const versions = await window.api.modrinthGetLoaderVersions(editedLoader, editedVersion);
                setLoaderVersions(versions);

                // If current selection is invalid or empty, default to latest
                // But if we are editing an existing instance, try to keep current if possible
                // If switching loader type or MC version, default to latest
                if ((!editedLoaderVersion || !versions.includes(editedLoaderVersion)) && versions.length > 0) {
                    setEditedLoaderVersion(versions[0]);
                }
            } catch (error) {
                console.error("Failed to fetch loader versions:", error);
            } finally {
                setLoadingLoaderVersions(false);
            }
        };

        fetchVersions();
    }, [editedLoader, editedVersion]);
    const [gameVersions, setGameVersions] = useState<{ version: string; version_type: string }[]>([]);
    const [showAllVersions, setShowAllVersions] = useState(false);
    const [isSavingInstallation, setIsSavingInstallation] = useState(false);

    // Check if installation settings changed
    const hasInstallationChanges = editedLoader !== instance.loader || editedVersion !== instance.minecraftVersion || editedLoaderVersion !== instance.loaderVersion;

    // Load game versions when installation tab is opened
    useEffect(() => {
        if (settingsTab === "installation" && gameVersions.length === 0) {
            loadGameVersions();
        }
    }, [settingsTab]);

    const loadGameVersions = async () => {
        try {
            const versions = await window.api?.modrinthGetGameVersions?.();
            if (versions) {
                setGameVersions(versions);
            }
        } catch (error) {
            console.error("[InstanceSettings] Failed to load versions:", error);
        }
    };

    const handleSaveInstallation = async () => {
        if (!hasInstallationChanges) return;

        setIsSavingInstallation(true);
        try {
            onUpdate(instance.id, {
                loader: editedLoader,
                loaderVersion: editedLoader === "vanilla" ? undefined : editedLoaderVersion,
                minecraftVersion: editedVersion,
            });
            toast.success(t('settings_saved_success'));
        } catch (error) {
            toast.error(t('save_failed'));
        } finally {
            setIsSavingInstallation(false);
        }
    };

    const handleSaveJava = () => {
        const updates: Partial<GameInstance> = {};
        if (editedJavaPath !== (instance.javaPath || "")) updates.javaPath = editedJavaPath;
        if (editedRam !== (instance.ramMB || config.ramMB)) updates.ramMB = editedRam;
        if (editedJavaArgs !== (instance.javaArguments || instance.javaArguments === "" ? instance.javaArguments : config.javaArguments)) updates.javaArguments = editedJavaArgs;

        if (Object.keys(updates).length > 0) {
            onUpdate(instance.id, updates);
            toast.success(t('settings_saved_success'));
        }
    };


    const filteredVersions = showAllVersions
        ? gameVersions
        : gameVersions.filter((v) => v.version_type === "release");

    const handleSaveName = () => {
        if (editedName.trim() && editedName !== instance.name) {
            onUpdate(instance.id, { name: editedName.trim() });
            toast.success(t('name_saved_success'));
        }
    };

    const getLoaderLabel = (loader: string): string => {
        const labels: Record<string, string> = {
            vanilla: "Vanilla",
            fabric: "Fabric",
            forge: "Forge",
            neoforge: "NeoForge",
            quilt: "Quilt",
        };
        return labels[loader] || loader;
    };

    return (
        <>
        <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm ${isExporting && minimized ? 'pointer-events-none opacity-0' : ''}`}>
            <div
                className="w-[90%] max-w-[1400px] h-[65vh] min-h-[480px] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
                style={{ backgroundColor: colors.surface }}
            >
                {/* Modal Header */}
                <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: colors.outline + "30" }}>
                    <div className="flex items-center gap-3">
                        {instance.icon?.startsWith("data:") || instance.icon?.startsWith("http") ? (
                            <img src={instance.icon} alt="icon" className="w-6 h-6 rounded-lg object-cover" />
                        ) : instance.icon ? (
                            <span className="text-xl">{instance.icon}</span>
                        ) : (
                            <Icons.Box className="w-6 h-6" style={{ color: colors.onSurfaceVariant }} />
                        )}
                        <span className="font-medium" style={{ color: colors.onSurface }}>{instance.name}</span>
                        <span style={{ color: colors.onSurfaceVariant }}>›</span>
                        <span className="font-medium" style={{ color: colors.onSurface }}>{t('settings')}</span>
                    </div>
                    <button
                        onClick={() => { playClick(); onClose(); }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10"
                        style={{ color: colors.onSurfaceVariant }}
                    >
                        ✕
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar */}
                    <div className="w-[22%] min-w-[240px] p-4 border-r flex flex-col" style={{ borderColor: colors.outline + "30" }}>
                        <button
                            onClick={() => { playClick(); setSettingsTab("general"); }}
                            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm mb-1 transition-all"
                            style={{
                                backgroundColor: settingsTab === "general" ? colors.secondary : "transparent",
                                color: settingsTab === "general" ? "#1a1a1a" : colors.onSurfaceVariant
                            }}
                        >
                            <i className="fa-solid fa-circle-info w-4" /> {t('general')}
                        </button>
                        <button
                            onClick={() => { playClick(); setSettingsTab("installation"); }}
                            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm mb-1 transition-all"
                            style={{
                                backgroundColor: settingsTab === "installation" ? colors.secondary : "transparent",
                                color: settingsTab === "installation" ? "#1a1a1a" : colors.onSurfaceVariant
                            }}
                        >
                            <i className="fa-solid fa-download w-4" /> {t('installation')}
                        </button>
                        <button
                            onClick={() => { playClick(); setSettingsTab("java"); }}
                            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm mb-1 transition-all"
                            style={{
                                backgroundColor: settingsTab === "java" ? colors.secondary : "transparent",
                                color: settingsTab === "java" ? "#1a1a1a" : colors.onSurfaceVariant
                            }}
                        >
                            <i className="fa-brands fa-java w-4" /> Java
                        </button>
                        <button
                            onClick={() => { playClick(); setSettingsTab("export"); }}
                            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm mb-1 transition-all"
                            style={{
                                backgroundColor: settingsTab === "export" ? colors.secondary : "transparent",
                                color: settingsTab === "export" ? "#1a1a1a" : colors.onSurfaceVariant
                            }}
                        >
                            <i className="fa-solid fa-file-export w-4" /> {t('export')}
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-6 overflow-y-auto">
                        {/* Define a helper for dark mode within the component scope if needed, 
                            but since we follow the user request, we'll force icons to be white in certain conditions */}
                        
                        {settingsTab === "export" && (
                            <div className="h-full flex flex-col">
                                {exportStep === "format" ? (
                                    <>
                                        <div className="mb-8">
                                            <h3 className="text-xl font-bold mb-2" style={{ color: colors.onSurface }}>{t('export_modpack')}</h3>
                                            <p className="text-sm opacity-70 max-w-2xl" style={{ color: colors.onSurfaceVariant }}>
                                                {t('export_desc')}
                                            </p>
                                        </div>

                                        {isExporting && !minimized && (
                                            <div className="flex-1 flex items-center justify-center">
                                                <InstallProgressModal
                                                    colors={colors}
                                                    installProgress={exportProgress}
                                                    title={t('export_modpack')}
                                                    isBytes={true}
                                                    onCancel={handleCancelExport}
                                                    onMinimize={() => setMinimized(true)}
                                                    language={language}
                                                />
                                            </div>
                                        )}

                                        {!isExporting && (
                                            <div className="grid grid-cols-2 gap-6 pb-4">
                                                {/* MRPack Option */}
                                                <button
                                                    onClick={() => handleFormatSelect('mrpack')}
                                                    className="group relative flex flex-col items-start p-6 rounded-2xl transition-all hover:scale-[1.02] border-2 text-left shrink-0"
                                                    style={{ 
                                                        backgroundColor: colors.surfaceContainer + "30",
                                                        borderColor: colors.outline + "15"
                                                    }}
                                                >
                                                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[#1bd96a]/15 mb-6 group-hover:bg-[#1bd96a] transition-all shadow-lg shadow-[#1bd96a]/10 overflow-hidden p-3.5">
                                                        <img 
                                                            src={modrinthIcon.src} 
                                                            alt="Modrinth" 
                                                            className={`w-full h-full object-contain transition-all group-hover:brightness-0 group-hover:invert opacity-95 group-hover:opacity-100 ${colors.surface !== '#ffffff' ? 'brightness-0 invert' : ''}`} 
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <h4 className="text-lg font-bold" style={{ color: colors.onSurface }}>{t('export_mrpack')}</h4>
                                                        <p className="text-sm opacity-60 leading-relaxed" style={{ color: colors.onSurfaceVariant }}>
                                                            {t('export_mrpack_desc')}
                                                        </p>
                                                    </div>
                                                    <div className="mt-8 flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-40 group-hover:opacity-100 group-hover:text-[#1bd96a] transition-all" style={{ color: colors.onSurfaceVariant }}>
                                                        {t('choose_format')} <i className="fa-solid fa-arrow-right ml-1" />
                                                    </div>
                                                </button>

                                                {/* ZIP Option */}
                                                <button
                                                    onClick={() => handleFormatSelect('zip')}
                                                    className="group relative flex flex-col items-start p-6 rounded-2xl transition-all hover:scale-[1.02] border-2 text-left shrink-0"
                                                    style={{ 
                                                        backgroundColor: colors.surfaceContainer + "30",
                                                        borderColor: colors.outline + "15"
                                                    }}
                                                >
                                                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[#f16436]/15 mb-6 group-hover:bg-[#f16436] transition-all shadow-lg shadow-[#f16436]/10 overflow-hidden p-3.5">
                                                        <img 
                                                            src={curseforgeIcon.src} 
                                                            alt="CurseForge" 
                                                            className={`w-full h-full object-contain transition-all group-hover:brightness-0 group-hover:invert opacity-95 group-hover:opacity-100 ${colors.surface !== '#ffffff' ? 'brightness-0 invert' : ''}`} 
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <h4 className="text-lg font-bold" style={{ color: colors.onSurface }}>{t('export_zip')}</h4>
                                                        <p className="text-sm opacity-60 leading-relaxed" style={{ color: colors.onSurfaceVariant }}>
                                                            {t('export_zip_desc')}
                                                        </p>
                                                    </div>
                                                    <div className="mt-8 flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-40 group-hover:opacity-100 group-hover:text-[#f16436] transition-all" style={{ color: colors.onSurfaceVariant }}>
                                                        {t('choose_format')} <i className="fa-solid fa-arrow-right ml-1" />
                                                    </div>
                                                </button>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    /* Configuration Step */
                                    <div className="flex flex-col h-full">
                                        {isExporting && !minimized ? (
                                            /* Show progress during export */
                                            <div className="flex-1 flex items-center justify-center">
                                                <InstallProgressModal
                                                    colors={colors}
                                                    installProgress={exportProgress}
                                                    title={t('export_modpack')}
                                                    isBytes={true}
                                                    onCancel={handleCancelExport}
                                                    onMinimize={() => setMinimized(true)}
                                                    language={language}
                                                />
                                            </div>
                                        ) : (
                                        <>
                                        <div className="mb-6 flex items-center gap-4">
                                            <button 
                                                onClick={() => { playClick(); setExportStep("format"); }}
                                                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                                                style={{ color: colors.onSurface }}
                                            >
                                                <i className="fa-solid fa-arrow-left" />
                                            </button>
                                            <div>
                                                <h3 className="text-xl font-bold flex items-center gap-3" style={{ color: colors.onSurface }}>
                                                    {t('export_config_title')}
                                                    <span className="text-xs px-2 py-0.5 rounded-full border opacity-70" style={{ borderColor: colors.outline }}>
                                                        {selectedFormat === 'mrpack' ? '.mrpack' : '.zip'}
                                                    </span>
                                                </h3>
                                                <p className="text-sm opacity-70" style={{ color: colors.onSurfaceVariant }}>
                                                    {t('export_config_desc')}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                                            {/* Metadata Section */}
                                            <div className="space-y-4">
                                                <h4 className="text-sm font-bold uppercase opacity-70 tracking-wider" style={{ color: colors.onSurfaceVariant }}>
                                                    Metadata
                                                </h4>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs font-medium mb-1.5 ml-1" style={{ color: colors.onSurface }}>{t('export_name')}</label>
                                                        <input
                                                            type="text"
                                                            value={exportOptions.name}
                                                            onChange={(e) => setExportOptions({ ...exportOptions, name: e.target.value })}
                                                            className="w-full px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:ring-2 focus:ring-opacity-50"
                                                            style={{ 
                                                                backgroundColor: colors.surfaceContainerHighest, 
                                                                color: colors.onSurface,
                                                                outlineColor: colors.primary 
                                                            }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium mb-1.5 ml-1" style={{ color: colors.onSurface }}>{t('export_version')}</label>
                                                        <input
                                                            type="text"
                                                            value={exportOptions.version}
                                                            onChange={(e) => setExportOptions({ ...exportOptions, version: e.target.value })}
                                                            className="w-full px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:ring-2 focus:ring-opacity-50"
                                                            style={{ 
                                                                backgroundColor: colors.surfaceContainerHighest, 
                                                                color: colors.onSurface,
                                                                outlineColor: colors.primary 
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium mb-1.5 ml-1" style={{ color: colors.onSurface }}>{t('export_description')}</label>
                                                    <textarea
                                                        value={exportOptions.description}
                                                        onChange={(e) => setExportOptions({ ...exportOptions, description: e.target.value })}
                                                        rows={3}
                                                        className="w-full px-4 py-2.5 rounded-xl outline-none text-sm resize-none transition-all focus:ring-2 focus:ring-opacity-50"
                                                        style={{ 
                                                            backgroundColor: colors.surfaceContainerHighest, 
                                                            color: colors.onSurface,
                                                            outlineColor: colors.primary 
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Files Section */}
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-sm font-bold uppercase opacity-70 tracking-wider" style={{ color: colors.onSurfaceVariant }}>
                                                        {t('export_included_files')}
                                                    </h4>
                                                    <div className="flex gap-2">
                                                        <button 
                                                            onClick={() => { 
                                                                playClick(); 
                                                                // Select all files in tree
                                                                const allFiles: string[] = [];
                                                                const traverse = (nodes: FileNode[]) => {
                                                                    nodes.forEach(n => {
                                                                        if (n.type === "file") allFiles.push(n.path);
                                                                        if (n.children) traverse(n.children);
                                                                    });
                                                                };
                                                                traverse(fileTree);
                                                                setExportOptions(prev => ({ ...prev, includedPaths: allFiles })); 
                                                            }}
                                                            className="text-xs px-2 py-1 rounded hover:bg-white/5 transition-colors"
                                                            style={{ color: colors.secondary }}
                                                        >
                                                            {t('export_select_all')}
                                                        </button>
                                                        <button 
                                                            onClick={() => { playClick(); setExportOptions(prev => ({ ...prev, includedPaths: [] })); }}
                                                            className="text-xs px-2 py-1 rounded hover:bg-white/5 transition-colors"
                                                            style={{ color: colors.onSurfaceVariant }}
                                                        >
                                                            {t('export_deselect_all')}
                                                        </button>
                                                    </div>
                                                </div>
                                                
                                                {loadingFiles ? (
                                                    <div className="flex justify-center p-8">
                                                        <Icons.Spinner className="w-6 h-6 animate-spin opacity-50" />
                                                    </div>
                                                ) : (
                                                    <FileSelectionTree 
                                                        data={fileTree} 
                                                        includedPaths={exportOptions.includedPaths} 
                                                        onChange={(paths) => setExportOptions(prev => ({ ...prev, includedPaths: paths }))}
                                                        colors={colors}
                                                    />
                                                )}
                                            </div>
                                        </div>

                                        {/* Action Bar */}
                                        <div className="pt-6 mt-2 border-t flex justify-end gap-3" style={{ borderColor: colors.outline + "15" }}>
                                            <button
                                                onClick={() => { playClick(); setExportStep("format"); }}
                                                className="px-6 py-2.5 rounded-xl font-medium text-sm transition-colors hover:bg-white/5"
                                                style={{ color: colors.onSurface }}
                                            >
                                                {t('cancel')}
                                            </button>
                                            <button
                                                onClick={handleExport}
                                                disabled={isExporting}
                                                className="px-8 py-2.5 rounded-xl font-bold text-sm shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                style={{ backgroundColor: colors.primary, color: colors.onPrimary }}
                                            >
                                                {t('export_btn')}
                                            </button>
                                        </div>
                                        </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {settingsTab === "general" && (
                            <div className="space-y-4">
                                {/* Name & Icon Row */}
                                <div className="flex items-start gap-8">
                                    <div className="flex-1 space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium mb-1.5" style={{ color: colors.onSurface }}>{t('instance_name')}</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={editedName}
                                                    onChange={(e) => setEditedName(e.target.value)}
                                                    disabled={!!instance.cloudId}
                                                    className="flex-1 px-4 py-2.5 rounded-xl outline-none disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                                />
                                                {editedName !== instance.name && !instance.cloudId && (
                                                    <button
                                                        onClick={() => { playClick(); handleSaveName(); }}
                                                        className="px-4 py-2 rounded-xl text-sm font-medium"
                                                        style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                                    >
                                                        {t('save')}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Duplicate & Delete - Internal space reduction */}
                                        <div className="space-y-4 pt-2">
                                            {!instance.cloudId && (
                                                <div>
                                                    <h4 className="text-sm font-medium mb-1" style={{ color: colors.onSurface }}>{t('duplicate_instance_title')}</h4>
                                                    <p className="text-xs mb-2 opacity-70" style={{ color: colors.onSurfaceVariant }}>
                                                        {t('duplicate_instance_desc')}
                                                    </p>
                                                    <button
                                                        onClick={() => {
                                                            playClick();
                                                            onDuplicate(instance.id);
                                                            onClose();
                                                        }}
                                                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all hover:opacity-80 border"
                                                        style={{ backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outline + "20", color: colors.onSurface }}
                                                    >
                                                        <i className="fa-regular fa-copy" /> {t('duplicate')}
                                                    </button>
                                                </div>
                                            )}

                                            <div>
                                                <h4 className="text-sm font-medium mb-1" style={{ color: colors.onSurface }}>{t('delete_instance_title')}</h4>
                                                <p className="text-xs mb-2 opacity-70" style={{ color: colors.onSurfaceVariant }}>
                                                    {instance.cloudId ? t('server_instance_delete_desc') : t('local_instance_delete_desc')}
                                                </p>
                                                {deleteConfirm ? (
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => {
                                                                playClick();
                                                                onDelete(instance.id);
                                                                onClose();
                                                            }}
                                                            className="flex items-center gap-2 px-6 py-2 rounded-xl text-sm bg-red-500 text-white font-medium"
                                                        >
                                                            <i className="fa-solid fa-trash" /> {t('confirm_delete_btn')}
                                                        </button>
                                                        <button
                                                            onClick={() => { playClick(); setDeleteConfirm(false); }}
                                                            className="px-4 py-2 rounded-xl text-sm"
                                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                                        >
                                                            {t('cancel')}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => { playClick(); setDeleteConfirm(true); }}
                                                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm border border-red-500/50 text-red-500 hover:bg-red-500/10 transition-colors"
                                                    >
                                                        <i className="fa-solid fa-trash" /> {t('delete_instance_title')}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Icon Column */}
                                    <div className="shrink-0">
                                        <label className="block text-sm font-medium mb-1.5" style={{ color: colors.onSurface }}>{t('icon')}</label>
                                        <div className="relative group">
                                            <div
                                                className={`w-28 h-28 rounded-3xl flex items-center justify-center text-3xl transition-all overflow-hidden border-2 ${instance.cloudId ? "" : "cursor-pointer hover:border-secondary/50 group-hover:shadow-lg"}`}
                                                style={{ 
                                                    backgroundColor: colors.surfaceContainerHighest,
                                                    borderColor: colors.outline + "20"
                                                }}
                                                onClick={async () => {
                                                    playClick();
                                                    if (instance.cloudId) return;
                                                    const result = await window.api?.browseIcon?.();
                                                    if (result) {
                                                        const saveResult = await (window.api as any)?.instancesSetIcon?.(instance.id, result);
                                                        if (saveResult?.ok) {
                                                            toast.success(t('icon_saved_success'));
                                                            onUpdate(instance.id, {});
                                                        } else {
                                                            toast.error(saveResult?.error || t('icon_save_failed'));
                                                        }
                                                    }
                                                }}
                                            >
                                                {instance.icon?.startsWith("data:") || instance.icon?.startsWith("http") || instance.icon?.includes("/") || instance.icon?.includes("\\") ? (
                                                    <img src={instance.icon} alt="icon" className="w-full h-full object-cover" />
                                                ) : instance.icon ? (
                                                    <span className="text-4xl">{instance.icon}</span>
                                                ) : (
                                                    <Icons.Box className="w-10 h-10" style={{ color: colors.onSurfaceVariant }} />
                                                )}
                                            </div>
                                            {!instance.cloudId && (
                                                <div
                                                    className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center text-xs shadow-md transform group-hover:scale-110 transition-transform cursor-pointer"
                                                    style={{ backgroundColor: "#ffffff", color: "#1a1a1a", border: `2px solid ${colors.surfaceContainerHighest}` }}
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        playClick();
                                                        const result = await window.api?.browseIcon?.();
                                                        if (result) {
                                                            const saveResult = await (window.api as any)?.instancesSetIcon?.(instance.id, result);
                                                                if (saveResult?.ok) {
                                                                    toast.success(t('icon_saved_success'));
                                                                    onUpdate(instance.id, {});
                                                                } else {
                                                                    toast.error(saveResult?.error || t('icon_save_failed'));
                                                                }
                                                        }
                                                    }}
                                                >
                                                    <Icons.Edit className="w-3.5 h-3.5" style={{ color: "#1a1a1a" }} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {settingsTab === "installation" && (
                            <div className="space-y-6">
                                {/* Currently installed */}
                                <div>
                                    <h4 className="font-medium mb-3" style={{ color: colors.onSurface }}>{t('currently_installed')}</h4>
                                    <div
                                        className="flex items-center gap-4 p-4 rounded-xl"
                                        style={{ backgroundColor: colors.surfaceContainerHighest }}
                                    >
                                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: colors.surfaceContainer }}>
                                            <Icons.Box className="w-6 h-6" style={{ color: colors.onSurfaceVariant }} />
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-medium" style={{ color: colors.onSurface }}>
                                                Minecraft {instance.minecraftVersion}
                                            </p>
                                            <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>
                                                {getLoaderLabel(instance.loader)} {instance.loaderVersion || ""}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Edit Controls - Only for Local Instances */}
                                {!instance.cloudId ? (
                                    <>
                                        {/* Platform */}
                                        <div>
                                            <h4 className="font-medium mb-3" style={{ color: colors.onSurface }}>{t('platform')}</h4>
                                            <div className="flex flex-wrap gap-2">
                                                {(["vanilla", "fabric", "forge", "neoforge", "quilt"] as LoaderType[]).map((loader) => (
                                                    <button
                                                        key={loader}
                                                        onClick={() => {
                                                            playClick();
                                                            setEditedLoader(loader);
                                                            setLoaderVersions([]); // Clear list
                                                            setEditedLoaderVersion(undefined); // Clear selection
                                                        }}
                                                        className="px-4 py-2 rounded-lg text-sm transition-all hover:opacity-80"
                                                        style={{
                                                            backgroundColor: editedLoader === loader ? colors.secondary : colors.surfaceContainerHighest,
                                                            color: editedLoader === loader ? "#000000ff" : colors.onSurface,
                                                            border: editedLoader === loader ? "none" : `1px solid ${colors.outline}30`
                                                        }}
                                                    >
                                                        {editedLoader === loader && <span className="mr-1">✓</span>}
                                                        {getLoaderLabel(loader)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Game version */}
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <h4 className="font-medium" style={{ color: colors.onSurface }}>{t('minecraft_version_label')}</h4>
                                                <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: colors.onSurfaceVariant }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={showAllVersions}
                                                        onChange={(e) => { playClick(); setShowAllVersions(e.target.checked); }}
                                                        className="w-4 h-4"
                                                    />
                                                    {t('include_snapshots')}
                                                </label>
                                            </div>
                                            <select
                                                value={editedVersion}
                                                onChange={(e) => { playClick(); setEditedVersion(e.target.value); }}
                                                className="w-full px-4 py-3 rounded-xl border cursor-pointer"
                                                style={{ backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outline + "30", color: colors.onSurface }}
                                            >
                                                {/* Always include current version */}
                                                {!filteredVersions.find(v => v.version === editedVersion) && (
                                                    <option value={editedVersion}>{editedVersion}</option>
                                                )}
                                                {filteredVersions.map((v) => (
                                                    <option key={v.version} value={v.version}>
                                                        {v.version} {v.version_type !== "release" ? `(${v.version_type})` : ""}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Loader Version Selection */}
                                        {editedLoader !== "vanilla" && (
                                            <div className="mt-4">
                                                <label className="block text-sm font-medium mb-2" style={{ color: colors.onSurface }}>{t('loader_version')}</label>
                                                <select
                                                    value={editedLoaderVersion || ""}
                                                    onChange={(e) => { playClick(); setEditedLoaderVersion(e.target.value); }}
                                                    disabled={loadingLoaderVersions}
                                                    className="w-full px-4 py-3 rounded-xl border cursor-pointer"
                                                    style={{ backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outline + "30", color: colors.onSurface }}
                                                >
                                                    {loadingLoaderVersions && <option>{t('loading')}</option>}
                                                    {!loadingLoaderVersions && loaderVersions.length === 0 && <option value="">{t('no_loader_version_found')}</option>}
                                                    {loaderVersions.map((v) => (
                                                        <option key={v} value={v}>
                                                            {v}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {/* Warning about changing settings */}
                                        {hasInstallationChanges && (
                                            <div className="p-3 rounded-xl text-sm" style={{ backgroundColor: "#f59e0b20", color: "#f59e0b" }}>
                                                <i className="fa-solid fa-triangle-exclamation mr-2" />
                                                {t('installation_change_warning')}
                                            </div>
                                        )}

                                        {/* Save button */}
                                        {hasInstallationChanges && (
                                            <button
                                                onClick={handleSaveInstallation}
                                                className="w-full py-3 rounded-xl font-medium transition-all hover:scale-[1.02] disabled:opacity-50"
                                                style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                            >
                                                {isSavingInstallation ? t('saving') : loadingLoaderVersions ? t('loading_versions') : t('save_changes')}
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    /* Server Managed Message */
                                    /* Server Managed Section */
                                    <div className="space-y-6">
                                        <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 rounded-2xl border-2 border-dashed"
                                            style={{ borderColor: colors.outline + "40" }}>
                                            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                                <Icons.Info className="w-8 h-8" style={{ color: colors.primary }} />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold mb-1" style={{ color: colors.onSurface }}>{t('managed_by_server')}</h3>
                                                <p className="text-sm max-w-xs mx-auto" style={{ color: colors.onSurfaceVariant }}>
                                                    {t('server_managed_settings_desc')}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Auto Update - Only for Server Instances */}
                                        <div className="p-4 rounded-xl flex items-center justify-between transition-colors" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                            <div>
                                                <h4 className="font-medium" style={{ color: colors.onSurface }}>{t('auto_update')}</h4>
                                                <p className="text-sm opacity-70" style={{ color: colors.onSurfaceVariant }}>
                                                    {t('auto_update_desc')}
                                                </p>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={instance.autoUpdate !== false}
                                                    onChange={(e) => {
                                                        playClick();
                                                        onUpdate(instance.id, { autoUpdate: e.target.checked });
                                                    }}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                                            </label>
                                        </div>

                                        {/* Repair Files - Only for Server Instances */}
                                        <div className="p-4 rounded-xl flex items-center justify-between transition-colors" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                            <div className="flex-1 mr-4">
                                                <h4 className="font-medium" style={{ color: colors.onSurface }}>{t('repair_files')}</h4>
                                                <p className="text-sm opacity-70" style={{ color: colors.onSurfaceVariant }}>
                                                    {t('repair_files_desc' as any)}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => { playClick(); onRepair?.(instance.id); onClose(); }}
                                                className="px-6 py-2.5 rounded-xl text-sm font-bold transition-all hover:bg-red-500 hover:text-white border flex items-center gap-2 shrink-0"
                                                style={{ borderColor: colors.outline + "30", color: colors.onSurface }}
                                            >
                                                <Icons.Wrench className="w-4 h-4" />
                                                {t('repair_files' as any)}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {settingsTab === "java" && (
                            <div className="space-y-6">
                                {/* Java Path */}
                                <div>
                                    <label className="block text-sm font-medium mb-1.5" style={{ color: colors.onSurface }}>
                                        {t('java_install_path', { version: "" })}
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={editedJavaPath}
                                            onChange={(e) => setEditedJavaPath(e.target.value)}
                                            onBlur={handleSaveJava}
                                            placeholder={config.javaPath || t('follow_system')}
                                            className="flex-1 px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:ring-2 focus:ring-opacity-50"
                                            style={{ 
                                                backgroundColor: colors.surfaceContainerHighest, 
                                                color: colors.onSurface,
                                                outlineColor: colors.primary
                                            }}
                                        />
                                        <button
                                            onClick={async () => {
                                                playClick();
                                                const result = await window.api?.browseJava?.();
                                                if (result) {
                                                    setEditedJavaPath(result);
                                                    onUpdate(instance.id, { javaPath: result });
                                                    toast.success(t('settings_saved_success'));
                                                }
                                            }}
                                            className="px-4 py-2 rounded-xl text-sm font-medium"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                        >
                                            {t('browse')}
                                        </button>
                                    </div>
                                    <p className="text-xs mt-1 opacity-70" style={{ color: colors.onSurfaceVariant }}>
                                        {t('leave_empty_to_use_default')}
                                    </p>
                                </div>

                                {/* RAM */}
                                <div>
                                    <div className="flex items-center gap-2 mb-4">
                                        <div 
                                            className="w-5 h-5 rounded flex items-center justify-center cursor-pointer transition-colors"
                                            style={{ 
                                                backgroundColor: editedRam > 0 && instance.ramMB !== 0 ? "#10b981" : colors.surfaceContainerHighest,
                                                border: `1px solid ${editedRam > 0 && instance.ramMB !== 0 ? "#10b981" : colors.outline + "50"}`
                                            }}
                                            onClick={() => {
                                                const isCustom = instance.ramMB !== 0;
                                                if (isCustom) {
                                                    // Disable custom (revert to default)
                                                    onUpdate(instance.id, { ramMB: 0 });
                                                    setEditedRam(config.ramMB);
                                                } else {
                                                    // Enable custom (start with current/default)
                                                    onUpdate(instance.id, { ramMB: config.ramMB });
                                                    setEditedRam(config.ramMB);
                                                }
                                            }}
                                        >
                                            {instance.ramMB !== 0 && <i className="fa-solid fa-check text-xs text-white"></i>}
                                        </div>
                                        <span className="text-sm font-medium" style={{ color: colors.onSurface }}>
                                            {t('custom_memory_allocation' as any)}
                                        </span>
                                    </div>

                                    <div className={`transition-all duration-200 space-y-3 ${instance.ramMB === 0 ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                                        {/* Header & Input */}
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="font-medium text-sm flex items-center gap-2" style={{ color: colors.onSurface }}>
                                                    <i className="fa-solid fa-memory text-xs opacity-70"></i>
                                                    {t('memory_allocated')}
                                                </div>
                                                <p className="text-xs mt-0.5" style={{ color: colors.onSurfaceVariant }}>
                                                    {/* Using a static text for now as exact translation key might differ, matching the style */}
                                                    {t('ram_description', { gb: maxRamMB ? (maxRamMB / 1024).toFixed(0) : '8' })}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors focus-within:ring-2"
                                                style={{ 
                                                    backgroundColor: colors.surfaceContainerHighest, 
                                                    borderColor: colors.outline + "40",
                                                    color: colors.onSurface 
                                                }}>
                                                <input
                                                    type="number"
                                                    value={editedRam}
                                                    onChange={(e) => {
                                                        const val = Math.min(Math.max(512, Number(e.target.value)), maxRamMB || 8192);
                                                        setEditedRam(val);
                                                    }}
                                                    onBlur={handleSaveJava}
                                                    className="w-16 bg-transparent text-right font-mono font-medium text-sm focus:outline-none"
                                                />
                                                <span className="text-xs opacity-70">MB</span>
                                            </div>
                                        </div>
                                        
                                        {/* Slider */}
                                        <div className="relative pt-2 pb-1">
                                            {/* Track */}
                                            <div className="h-3 w-full rounded-full relative overflow-hidden" 
                                                style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                                <div 
                                                    className="absolute top-0 left-0 h-full rounded-full transition-all duration-150 ease-out"
                                                    style={{ 
                                                        width: `${((editedRam - 512) / ((maxRamMB || 8192) - 512)) * 100}%`,
                                                        backgroundColor: "#10b981" 
                                                    }}
                                                />
                                            </div>

                                            {/* Tick Marks (20%, 40%, 60%, 80%) */}
                                            <div className="absolute top-[14px] w-full h-3 pointer-events-none px-[6px]">
                                                {[0.2, 0.4, 0.6, 0.8].map((tick) => (
                                                    <div 
                                                        key={tick}
                                                        className="absolute top-0 w-px h-full bg-white/20"
                                                        style={{ left: `${tick * 100}%` }}
                                                    />
                                                ))}
                                            </div>

                                            {/* Slider Input */}
                                            <input
                                                type="range"
                                                min={512}
                                                max={maxRamMB || 8192}
                                                step={256}
                                                value={editedRam}
                                                onChange={(e) => setEditedRam(Number(e.target.value))}
                                                onMouseUp={handleSaveJava}
                                                onTouchEnd={handleSaveJava}
                                                className="absolute top-2 left-0 w-full h-3 opacity-0 cursor-pointer"
                                                style={{ margin: 0 }}
                                            />

                                            {/* Labels */}
                                            <div className="flex justify-between text-[10px] mt-2 font-medium px-1" style={{ color: colors.onSurfaceVariant }}>
                                                <span>512 MB</span>
                                                <span className="text-center absolute left-1/2 -translate-x-1/2" style={{ opacity: 0.5 }}>
                                                    {editedRam >= 1024 ? `${(editedRam / 1024).toFixed(1)} GB` : `${editedRam} MB`}
                                                </span>
                                                <span>{maxRamMB ? `${(maxRamMB / 1024).toFixed(1)} GB` : "8.0 GB"}</span>
                                            </div>
                                        </div>

                                        {/* Presets */}
                                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                                            <button
                                                onClick={() => {
                                                    let recommended = 4096;
                                                    const sysRam = maxRamMB || 8192;
                                                    if (sysRam >= 32000) recommended = 16384;
                                                    else if (sysRam >= 16000) recommended = 8192;
                                                    else if (sysRam >= 12000) recommended = 6144;
                                                    else if (sysRam >= 8000) recommended = 4096;
                                                    else recommended = Math.max(2048, sysRam - 2048);
                                                    
                                                    recommended = Math.min(recommended, sysRam);
                                                    setEditedRam(recommended);
                                                    onUpdate(instance.id, { ramMB: recommended });
                                                    toast.success(`${t('recommended')}: ${recommended >= 1024 ? (recommended/1024).toFixed(1) + ' GB' : recommended + ' MB'}`);
                                                }}
                                                className="flex flex-col items-center justify-center py-2 px-1 rounded-lg border transition-all active:scale-95"
                                                style={{ 
                                                    backgroundColor: colors.surface, 
                                                    borderColor: colors.outline + "30",
                                                    color: colors.onSurface
                                                }}
                                            >
                                                <span className="text-xs font-medium mb-0.5"><i className="fa-solid fa-thumbs-up mr-1.5"/>{t('recommended')}</span>
                                            </button>

                                            {[
                                                { label: "Lite", value: 2048 },
                                                { label: "Standard", value: 4096 },
                                                { label: "High", value: 8192 },
                                                { label: "Ultra", value: 16384 },
                                            ].map((preset) => (
                                                <button
                                                    key={preset.label}
                                                    onClick={() => {
                                                        const val = Math.min(preset.value, maxRamMB || 8192);
                                                        setEditedRam(val);
                                                        onUpdate(instance.id, { ramMB: val });
                                                    }}
                                                    className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg border transition-all active:scale-95 ${
                                                        editedRam === preset.value 
                                                            ? 'ring-2 ring-offset-1' 
                                                            : 'hover:bg-black/5 dark:hover:bg-white/5'
                                                    }`}
                                                    style={{ 
                                                        backgroundColor: editedRam === preset.value ? "#10b981" : colors.surface,
                                                        borderColor: editedRam === preset.value ? "#10b981" : colors.outline + "30",
                                                        color: editedRam === preset.value ? '#ffffff' : colors.onSurface,
                                                        boxShadow: editedRam === preset.value ? "0 0 0 2px #10b981" : "none"
                                                    }}
                                                >
                                                    <span className="text-xs font-medium mb-0.5">{preset.label}</span>
                                                    <span className="text-[10px] opacity-80">{preset.value / 1024} GB</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Java Arguments */}
                                <div>
                                    <label className="block text-sm font-medium mb-1.5" style={{ color: colors.onSurface }}>
                                        {t('java_args')}
                                    </label>
                                    <input
                                        type="text"
                                        value={editedJavaArgs}
                                        onChange={(e) => setEditedJavaArgs(e.target.value)}
                                        onBlur={handleSaveJava}
                                        placeholder={t('java_args_placeholder')}
                                        className="w-full px-4 py-2.5 rounded-xl outline-none text-sm transition-all focus:ring-2 focus:ring-opacity-50"
                                        style={{ 
                                            backgroundColor: colors.surfaceContainerHighest, 
                                            color: colors.onSurface,
                                            outlineColor: colors.primary
                                        }}
                                    />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Minimized floating progress widget */}
            {isExporting && minimized && (
                <div
                    className="fixed bottom-6 right-6 z-60 w-80 rounded-2xl shadow-2xl overflow-hidden border border-white/10 animate-fade-in-up cursor-pointer transition-transform hover:scale-105"
                    style={{ backgroundColor: colors.surfaceContainer }}
                    onClick={() => setMinimized(false)}
                >
                    <div className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center relative shrink-0"
                            style={{ backgroundColor: colors.surfaceContainerHighest }}>
                            {exportProgress.percent !== undefined ? (
                                <svg className="w-10 h-10 -rotate-90 transform" viewBox="0 0 36 36">
                                    <path
                                        className="text-gray-200 opacity-20"
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="3"
                                    />
                                    <path
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                        fill="none"
                                        stroke={colors.secondary}
                                        strokeWidth="3"
                                        strokeDasharray={`${exportProgress.percent}, 100`}
                                    />
                                </svg>
                            ) : (
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2" style={{ borderColor: colors.secondary }}></div>
                            )}
                            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{ color: colors.onSurface }}>
                                {exportProgress.percent}%
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm truncate" style={{ color: colors.onSurface }}>{t('export')}</h4>
                            <p className="text-xs truncate" style={{ color: colors.onSurfaceVariant }}>
                                {exportProgress.current && exportProgress.total
                                    ? `${formatBytes(exportProgress.current)} / ${formatBytes(exportProgress.total)}`
                                    : exportProgress.message}
                            </p>
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); setMinimized(false); }}
                            className="p-2 rounded-lg hover:bg-white/10"
                            title={t('expand')}
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" style={{ color: colors.onSurfaceVariant }}>
                                <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
