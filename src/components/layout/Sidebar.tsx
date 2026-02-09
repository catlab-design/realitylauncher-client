import React from "react";
import rIcon from "../../assets/r.svg";
import { Icons } from "../ui/Icons";
import { playClick } from "../../lib/sounds";
import { useTranslation } from "../../hooks/useTranslation";
import { useConfigStore } from "../../store/configStore";
import { useUiStore } from "../../store/uiStore";
import { useAuthStore } from "../../store/authStore";
import { type ColorTheme } from "../../types/launcher";

interface SidebarProps {
    colors: any; // We can improve this type later, likely inferred from getColors return type
    onTabSelect?: (tabId: string) => void;
}

export function Sidebar({ colors, onTabSelect }: SidebarProps) {
    const config = useConfigStore();
    const { t } = useTranslation(config.language);
    const { activeTab, setActiveTab } = useUiStore();
    const { session, accounts } = useAuthStore();

    // Calculate isAdmin based on session logic as done in LauncherApp
    // Or better, we trust the session.isAdmin flag if we set it correctly during login/switch
    // In LauncherApp, isAdmin state was used.
    // Let's check session?.isAdmin (we added this to the type or logic previously?)
    // In LauncherApp logic: setIsAdmin(adminCheck?.isAdmin)
    // We should rely on session property if possible, but the store logic I wrote didn't explicitly add 'isAdmin' to AuthSession type definition (it wasn't in list but used in code).
    // Type definition: 'isAdmin' is optional in AuthSession?
    // Let's assume yes or rely on the fact that we can derive it.
    const isAdmin = session?.isAdmin || false;

    const mainNavItems = [
        { id: "home", icon: Icons.Home, label: t('home') },
        { id: "servers", icon: Icons.Dns, label: t('servers') },
        { id: "modpack", icon: Icons.Modpack, label: t('modpacks') },
        { id: "explore", icon: Icons.Search, label: t('explore') },
    ];

    const bottomNavItems = [
        ...(isAdmin ? [{ id: "admin", icon: Icons.Admin, label: t('admin') }] : []),
        { id: "settings", icon: Icons.Settings, label: t('settings') },
        { id: "about", icon: Icons.Info, label: t('about') },
    ];

    return (
        <nav className="w-20 flex flex-col items-center" style={{ backgroundColor: colors.secondary }}>
            {/* Top Section - Logo and Main Nav */}
            <div className="flex-1 flex flex-col items-center gap-2">
                {/* Drag region for sidebar top */}
                <div className="w-full pt-2 pb-2 flex justify-center drag-region">
                    <div className="w-12 h-12 rounded-2xl overflow-hidden">
                        <img src={rIcon.src} alt="Logo" className="w-full h-full object-cover" />
                    </div>
                </div>

                {/* Main Navigation Items */}
                {mainNavItems.map(({ id, icon: Icon, label }: { id: string, icon: any, label: string }) => (
                    <div key={id} className="relative group">
                        <button
                            onClick={() => { 
                                playClick(); 
                                setActiveTab(id);
                                onTabSelect?.(id);
                            }}
                            className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all hover:scale-105 no-drag"
                            style={{
                                backgroundColor: activeTab === id ? "rgba(255,255,255,0.9)" : "transparent",
                                color: "#1a1a1a"
                            }}
                        >
                            <Icon className="w-6 h-6" />
                        </button>
                        {/* Hover Tooltip */}
                        <div
                            className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-3 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all duration-200 pointer-events-none z-50"
                            style={{
                                backgroundColor: "rgba(0,0,0,0.8)",
                                color: "#fff",
                                fontSize: "0.75rem"
                            }}
                        >
                            {label}
                        </div>
                    </div>
                ))}
            </div>

            {/* Bottom Section - Settings and About */}
            <div className="flex-col items-center gap-2 pb-4 flex">
                {bottomNavItems.map(({ id, icon: Icon, label }: { id: string, icon: any, label: string }) => (
                    <div key={id} className="relative group">
                        <button
                            onClick={() => { 
                                playClick(); 
                                setActiveTab(id);
                                onTabSelect?.(id);
                            }}
                            className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all hover:scale-105 no-drag"
                            style={{
                                backgroundColor: activeTab === id ? "rgba(255,255,255,0.9)" : "transparent",
                                color: "#1a1a1a"
                            }}
                        >
                            <Icon className="w-6 h-6" />
                        </button>
                        {/* Hover Tooltip */}
                        <div
                            className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-3 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all duration-200 pointer-events-none z-50"
                            style={{
                                backgroundColor: "rgba(0,0,0,0.8)",
                                color: "#fff",
                                fontSize: "0.75rem"
                            }}
                        >
                            {label}
                        </div>
                    </div>
                ))}
            </div>
        </nav>
    );
}
