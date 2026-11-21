import React from "react";
import { useShallow } from "zustand/react/shallow";
import { motion } from "framer-motion";
import { Icons } from "../ui/Icons";
import { playClick } from "../../lib/sounds";
import { useMotionPreset } from "../../lib/motion";
import { useTranslation } from "../../hooks/useTranslation";
import { useConfigStore } from "../../store/configStore";
import { useUiStore } from "../../store/uiStore";
import { useAuthStore } from "../../store/authStore";

interface SidebarProps {
    colors: any;
    onTabSelect?: (tabId: string) => void;
}

type NavItem = { id: string; icon: any; label: string };

/** Icon colour on the theme-coloured rail. */
const INK = "#1a1a1a";

/**
 * Top navigation, Steam / Epic style: the main pages as text tabs in the title bar (active one
 * white with a yellow underline), utilities (admin / settings / about) as small icons after them.
 */
export function Sidebar({ colors, onTabSelect }: SidebarProps) {
    const config = useConfigStore(useShallow((s) => s));
    const { t } = useTranslation(config.language);
    const activeTab = useUiStore((s) => s.activeTab);
    const setActiveTab = useUiStore((s) => s.setActiveTab);
    const session = useAuthStore((s) => s.session);
    const m = useMotionPreset();

    const isAdmin = session?.isAdmin || false;

    const playItems: NavItem[] = [
        { id: "home", icon: Icons.Home, label: t("home") },
        { id: "servers", icon: Icons.Dns, label: t("servers") },
        { id: "modpack", icon: Icons.Modpack, label: t("library") },
    ];
    const discoverItems: NavItem[] = [
        { id: "explore", icon: Icons.Search, label: t("install_tab") },
        { id: "wardrobe", icon: Icons.Hanger, label: t("wardrobe") },
    ];
    const bottomItems: NavItem[] = [
        ...(isAdmin ? [{ id: "admin", icon: Icons.Admin, label: t("admin") }] : []),
        { id: "settings", icon: Icons.Settings, label: t("settings") },
        { id: "about", icon: Icons.Info, label: t("about") },
    ];

    const select = (id: string) => {
        playClick();
        if (activeTab !== id) React.startTransition(() => setActiveTab(id));
        onTabSelect?.(id);
    };

    const renderTab = ({ id, label }: NavItem) => {
        const active = activeTab === id;
        return (
            <button
                key={id}
                onClick={() => select(id)}
                onDragStart={(e) => e.preventDefault()}
                draggable={false}
                aria-current={active ? "page" : undefined}
                className="no-drag select-none relative h-10 px-3 flex items-center text-sm font-semibold whitespace-nowrap transition-colors hover:text-white"
                style={{ color: active ? "#ffffff" : "rgba(255,255,255,0.6)" }}
            >
                {label}
                {active && (
                    <motion.span
                        layoutId="titlebar-nav-underline"
                        transition={m.tabIndicator}
                        className="absolute left-3 right-3 bottom-0 h-0.5 rounded-full"
                        style={{ backgroundColor: colors.secondary }}
                    />
                )}
            </button>
        );
    };

    const renderUtility = ({ id, icon: Icon, label }: NavItem) => {
        const active = activeTab === id;
        return (
            <button
                key={id}
                onClick={() => select(id)}
                onDragStart={(e) => e.preventDefault()}
                draggable={false}
                aria-label={label}
                title={label}
                className="no-drag w-8 h-8 rounded-lg flex items-center justify-center pressable hover:bg-white/10"
                style={{ color: active ? colors.secondary : "rgba(255,255,255,0.65)" }}
            >
                <Icon className="w-4.5 h-4.5 pointer-events-none" />
            </button>
        );
    };

    return (
        <nav className="flex items-center h-10">
            {[...playItems, ...discoverItems].map(renderTab)}
            <span className="w-px h-4 mx-2 bg-white/15" />
            <div className="flex items-center gap-0.5">{bottomItems.map(renderUtility)}</div>
        </nav>
    );
}
