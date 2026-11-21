import React from "react";
import { Icons } from "../../ui/Icons";
import type { ContentCategory } from "./types";
import { useTranslation } from "../../../hooks/useTranslation";
import { playClick } from "../../../lib/sounds";
import { motion } from "framer-motion";

interface ContentTabsProps {
    colors: any;
    activeTab: ContentCategory;
    modsCount: number;
    modsLoading: boolean;
    resourcepacksCount: number;
    datapacksCount: number;
    shadersCount: number;
    onTabChange: (tab: ContentCategory) => void;
    loader?: string; 
}

export function ContentTabs({
    colors,
    activeTab,
    modsCount,
    modsLoading,
    resourcepacksCount,
    datapacksCount,
    shadersCount,
    onTabChange,
    loader,
}: ContentTabsProps) {
    const { t } = useTranslation();
    const allTabs: { id: ContentCategory; label: string; count: number; icon: React.ComponentType<any> }[] = [
        { id: "mods", label: t('mods'), count: modsCount, icon: Icons.Box },
        { id: "resourcepacks", label: t('resourcepacks'), count: resourcepacksCount, icon: Icons.Palette },
        { id: "datapacks", label: t('datapacks'), count: datapacksCount, icon: Icons.Scroll },
        { id: "shaders", label: t('shaders'), count: shadersCount, icon: Icons.Sun },
    ];

    const tabs = loader === "vanilla"
        ? allTabs.filter(tab => tab.id !== "mods")
        : allTabs;

    return (
        <div
            role="tablist"
            className="flex items-end gap-6 mb-4 overflow-x-auto no-scrollbar border-b"
            style={{ borderColor: colors.outlineVariant }}
        >
            {tabs.map((tab) => {
                const active = activeTab === tab.id;
                const TabIcon = tab.icon;
                return (
                    <button
                        key={tab.id}
                        role="tab"
                        aria-selected={active}
                        onClick={() => { playClick(); onTabChange(tab.id); }}
                        className="relative flex items-center gap-1.5 pt-1 pb-3 text-[15px] font-semibold whitespace-nowrap transition-colors text-(--tab-fg) hover:text-(--tab-hover)"
                        style={{
                            "--tab-fg": active ? colors.onSurface : colors.onSurfaceVariant,
                            "--tab-hover": colors.onSurface,
                        } as React.CSSProperties}
                    >
                        <TabIcon className="w-4.5 h-4.5 shrink-0" />
                        <span>{tab.label}</span>
                        <span
                            className="text-[13px] font-medium tabular-nums"
                            style={{ color: colors.onSurfaceVariant, opacity: active ? 0.9 : 0.7 }}
                        >
                            {tab.id === "mods" && modsLoading ? "..." : tab.count}
                        </span>
                        {active && (
                            <motion.div
                                layoutId="instance-content-tab-underline"
                                className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full"
                                style={{ backgroundColor: colors.secondary }}
                                transition={{ type: "spring", stiffness: 500, damping: 40 }}
                            />
                        )}
                    </button>
                );
            })}
        </div>
    );
}
