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
    loader?: string; // Instance loader type
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
        <div className="flex items-center gap-1 mb-4">
            {tabs.map((tab) => {
                const active = activeTab === tab.id;
                const TabIcon = tab.icon;
                return (
                    <button
                        key={tab.id}
                        onClick={() => { playClick(); onTabChange(tab.id); }}
                        className="px-4 py-2 rounded-xl text-sm font-medium transition-all relative group flex items-center gap-2"
                        style={{
                            color: active ? "#1a1a1a" : colors.onSurfaceVariant,
                        }}
                    >
                        {active && (
                            <motion.div
                                layoutId="instance-detail-tabs-indicator"
                                className="absolute inset-0 rounded-xl"
                                style={{ backgroundColor: colors.secondary }}
                                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            />
                        )}
                        <TabIcon className="w-4 h-4 z-10 relative" />
                        <span className="z-10 relative">{tab.label}</span>
                        {(tab.id === "mods" || tab.count > 0) && (
                            <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold z-10 relative"
                                style={{
                                    backgroundColor: active ? "rgba(0,0,0,0.12)" : colors.surfaceContainerHighest,
                                    color: active ? "#000" : colors.onSurfaceVariant
                                }}
                            >
                                {tab.id === "mods" && modsLoading ? "..." : tab.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
