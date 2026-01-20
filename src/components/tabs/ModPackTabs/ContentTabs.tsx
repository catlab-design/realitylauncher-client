// ========================================
// Content Category Tabs Component
// ========================================

import React from "react";
import type { ContentCategory } from "./types";
import { playClick } from "../../../lib/sounds";

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
    const allTabs: { id: ContentCategory; label: string; count: number; icon: string }[] = [
        { id: "mods", label: "Mods", count: modsCount, icon: "M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18-.21 0-.41-.06-.57-.18l-7.9-4.44A.991.991 0 0 1 3 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18.21 0 .41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9zM12 4.15L6.04 7.5 12 10.85l5.96-3.35L12 4.15zM5 15.91l6 3.38v-6.71L5 9.21v6.7zm14 0v-6.7l-6 3.37v6.71l6-3.38z" },
        { id: "resourcepacks", label: "Resource Packs", count: resourcepacksCount, icon: "M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" },
        { id: "datapacks", label: "Datapacks", count: datapacksCount, icon: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" },
        { id: "shaders", label: "Shaders", count: shadersCount, icon: "M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1z" },
    ];

    // Filter out mods tab for vanilla instances
    const tabs = loader === "vanilla"
        ? allTabs.filter(tab => tab.id !== "mods")
        : allTabs;

    return (
        <div className="flex gap-2 mb-4">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => { playClick(); onTabChange(tab.id); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all"
                    style={{
                        backgroundColor: activeTab === tab.id ? colors.secondary : colors.surfaceContainerHighest,
                        color: activeTab === tab.id ? "#1a1a1a" : colors.onSurfaceVariant
                    }}
                >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d={tab.icon} />
                    </svg>
                    <span>{tab.label}</span>
                    {(tab.id === "mods" || tab.count > 0) && (
                        <span
                            className="px-2 py-0.5 rounded-full text-xs"
                            style={{
                                backgroundColor: activeTab === tab.id ? "rgba(0,0,0,0.2)" : colors.surfaceContainer,
                                color: activeTab === tab.id ? "#1a1a1a" : colors.onSurfaceVariant
                            }}
                        >
                            {tab.id === "mods" && modsLoading ? "..." : tab.count}
                        </span>
                    )}
                </button>
            ))}
        </div>
    );
}
