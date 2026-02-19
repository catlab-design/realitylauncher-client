import React, { useState, useEffect } from "react";
import { translations } from "../../i18n/translations";
import { Icons } from "../ui/Icons";
import { useTranslation } from "../../hooks/useTranslation";
import toast from "react-hot-toast";

interface LanguageEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    colors: any;
    currentLanguage: "th" | "en";
}

export function LanguageEditorModal({ isOpen, onClose, colors, currentLanguage }: LanguageEditorModalProps) {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState("");
    const [editableTranslations, setEditableTranslations] = useState<Record<string, string>>({});
    const [originalTranslations, setOriginalTranslations] = useState<Record<string, string>>({});
    const [selectedKey, setSelectedKey] = useState<string | null>(null);

    // Initialize with current language data
    useEffect(() => {
        if (isOpen) {
            // Clone the translations to avoid mutating the source
            setEditableTranslations({ ...translations[currentLanguage] });
            setOriginalTranslations({ ...translations[currentLanguage] });
        }
    }, [isOpen, currentLanguage]);

    if (!isOpen) return null;

    const handleSaveAndExport = () => {
        try {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(editableTranslations, null, 4));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", `${currentLanguage}_custom.json`);
            document.body.appendChild(downloadAnchorNode); // required for firefox
            downloadAnchorNode.click();
            downloadAnchorNode.remove();

            toast.success(t("export_json_success"));
        } catch (error) {
            console.error(error);
            toast.error(t("export_json_failed"));
        }
    };

    const openDiscord = () => {
        (window as any).api.openExternal("https://discord.com/invite/PewhYEehFQ");
    };

    const filteredKeys = Object.keys(editableTranslations).filter(key =>
        key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        editableTranslations[key].toLowerCase().includes(searchQuery.toLowerCase())
    );

    const isModified = (key: string) => {
        return editableTranslations[key] !== originalTranslations[key];
    };

    const modifiedCount = Object.keys(editableTranslations).filter(k => isModified(k)).length;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="flex flex-col w-full max-w-6xl h-[90vh] rounded-[2rem] shadow-2xl relative border border-white/10 overflow-hidden"
                style={{ backgroundColor: colors.surface }}>

                {/* Header */}
                <div className="p-6 border-b flex items-center justify-between z-10" style={{ borderColor: colors.outline + "20", backgroundColor: colors.surface }}>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg" style={{ backgroundColor: colors.secondary }}>
                            <Icons.Edit className="w-6 h-6" style={{ color: colors.onPrimary }} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black tracking-tight" style={{ color: colors.onSurface }}>
                                {t("language_editor")}
                            </h2>
                            <p className="text-sm font-medium opacity-60 flex items-center gap-2" style={{ color: colors.onSurfaceVariant }}>
                                <span>{currentLanguage === "th" ? t("language_thai") : t("language_english")}</span>
                                <span className="w-1 h-1 rounded-full bg-current opacity-50" />
                                <span>{t("changes_count").replace("{count}", String(modifiedCount))}</span>
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleSaveAndExport}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 shadow-lg text-sm"
                            style={{ backgroundColor: colors.secondary, color: colors.onPrimary }}
                        >
                            <Icons.Download className="w-4 h-4" />
                            {t("export_json")}
                        </button>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                            style={{ color: colors.onSurfaceVariant }}
                        >
                            <Icons.Close className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Content Layout */}
                <div className="flex flex-1 overflow-hidden">
                    
                    {/* Sidebar / Key List */}
                    <div className="w-1/3 border-r flex flex-col" style={{ borderColor: colors.outline + "10", backgroundColor: colors.surfaceContainerLow }}>
                        {/* Search Toolbar */}
                        <div className="p-4 border-b" style={{ borderColor: colors.outline + "10" }}>
                            <div className="relative">
                                <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50" style={{ color: colors.onSurface }} />
                                <input
                                    type="text"
                                    placeholder={t("search_keys")}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm transition-all outline-none focus:ring-2"
                                    style={{
                                        backgroundColor: colors.surfaceContainerHigh,
                                        borderColor: "transparent",
                                        color: colors.onSurface,
                                    }}
                                />
                            </div>
                        </div>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {filteredKeys.length > 0 ? (
                                filteredKeys.map((key) => {
                                    const modified = isModified(key);
                                    const active = selectedKey === key;
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => setSelectedKey(key)}
                                            className={`w-full text-left px-4 py-3 rounded-xl transition-all group relative ${active ? 'shadow-md' : 'hover:bg-white/5'}`}
                                            style={{ 
                                                backgroundColor: active ? colors.surfaceContainerHighest : 'transparent',
                                            }}
                                        >
                                            <div className="flex justify-between items-start mb-1">
                                                <span className={`text-xs font-mono font-bold truncate ${active ? 'opacity-100' : 'opacity-60'}`} 
                                                      style={{ color: colors.onSurface }}>
                                                    {key}
                                                </span>
                                                {modified && (
                                                    <span className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.5)]" />
                                                )}
                                            </div>
                                            <div className={`text-sm truncate pr-2 ${active ? 'opacity-90' : 'opacity-70'}`} 
                                                 style={{ color: colors.onSurfaceVariant }}>
                                                {editableTranslations[key]}
                                            </div>
                                        </button>
                                    );
                                })
                            ) : (
                                <div className="p-8 text-center opacity-50 text-sm">
                                    {t("no_keys_found")}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Main Editor Area */}
                    <div className="flex-1 flex flex-col bg-opacity-50" style={{ backgroundColor: colors.surface }}>
                        {selectedKey ? (
                            <div className="flex-1 flex flex-col p-8 animate-in slide-in-from-right-4 duration-200">
                                
                                <div className="mb-6">
                                    <label className="text-xs font-bold uppercase tracking-wider opacity-50 mb-2 block" style={{ color: colors.onSurfaceVariant }}>
                                        {t("translation_key")}
                                    </label>
                                    <div className="font-mono text-lg font-bold select-all" style={{ color: colors.onSurface }}>
                                        {selectedKey}
                                    </div>
                                </div>

                                <div className="flex-1 flex flex-col gap-6">
                                    <div className="p-4 rounded-xl border border-dashed relative group" 
                                         style={{ borderColor: colors.outline + "30", backgroundColor: colors.surfaceContainerLow + "50" }}>
                                        <label className="absolute -top-2.5 left-3 px-1 text-xs font-bold bg-surface" 
                                               style={{ color: colors.onSurfaceVariant, backgroundColor: colors.surface }}>
                                            {t("original_value")}
                                        </label>
                                        <p className="text-base leading-relaxed opacity-80" style={{ color: colors.onSurface }}>
                                            {originalTranslations[selectedKey]}
                                        </p>
                                    </div>

                                    <div className="flex-1 flex flex-col relative">
                                        <label className="text-xs font-bold uppercase tracking-wider opacity-70 mb-2 flex justify-between" style={{ color: colors.onSurfaceVariant }}>
                                            <span>{t("edit_value")}</span>
                                            {isModified(selectedKey) && (
                                                <button 
                                                    onClick={() => setEditableTranslations(prev => ({ ...prev, [selectedKey]: originalTranslations[selectedKey] }))}
                                                    className="text-[10px] hover:underline"
                                                >
                                                    {t("reset_to_original")}
                                                </button>
                                            )}
                                        </label>
                                        <textarea
                                            value={editableTranslations[selectedKey]}
                                            onChange={(e) => setEditableTranslations(prev => ({ ...prev, [selectedKey]: e.target.value }))}
                                            className="w-full flex-1 p-6 rounded-2xl border text-lg leading-relaxed resize-none transition-all outline-none focus:ring-2 focus:ring-offset-2"
                                            placeholder={t("enter_translation_here")}
                                            style={{ 
                                                backgroundColor: colors.surfaceContainer,
                                                borderColor: isModified(selectedKey) ? colors.secondary : 'transparent',
                                                color: colors.onSurface,
                                                boxShadow: isModified(selectedKey) ? `0 0 0 1px ${colors.secondary}20` : 'none'
                                            }}
                                        />
                                        <div className="absolute bottom-4 right-4 text-xs opacity-40 pointer-events-none">
                                            {t("chars_count").replace("{count}", String(editableTranslations[selectedKey].length))}
                                        </div>
                                    </div>
                                </div>

                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-40">
                                <div className="w-24 h-24 rounded-3xl mb-6 flex items-center justify-center rotate-3" 
                                     style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                    <Icons.Edit className="w-10 h-10" />
                                </div>
                                <h3 className="text-xl font-bold mb-2">{t("select_key_to_edit")}</h3>
                                <p className="max-w-xs text-sm">{t("choose_translation_key_desc")}</p>
                            </div>
                        )}

                        {/* Footer Info */}
                        <div className="p-4 border-t text-center" style={{ borderColor: colors.outline + "10" }}>
                            <button
                                onClick={openDiscord}
                                className="text-xs font-medium hover:underline opacity-60 hover:opacity-100 transition-opacity flex items-center justify-center gap-2 mx-auto"
                                style={{ color: colors.secondary }}
                            >
                                <Icons.Discord className="w-3 h-3" />
                                {t("translation_error_report")}
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
