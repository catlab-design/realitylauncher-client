import React, { useState } from "react";
import { Icons } from "../ui/Icons";
import { playClick } from "../../lib/sounds";
import { useTranslation } from "../../hooks/useTranslation";
import { useConfigStore } from "../../store/configStore";
import { useUiStore } from "../../store/uiStore";
import { useAuthStore } from "../../store/authStore";

interface SidebarProps {
    colors: any; // We can improve this type later, likely inferred from getColors return type
    onTabSelect?: (tabId: string) => void;
}

export function Sidebar({ colors, onTabSelect }: SidebarProps) {
    const config = useConfigStore();
    const { t } = useTranslation(config.language);
    const { activeTab, setActiveTab } = useUiStore();
    const { session, accounts } = useAuthStore();
    const [hoveredTab, setHoveredTab] = useState<string | null>(null);

    // Calculate isAdmin based on session logic as done in LauncherApp
    const isAdmin = session?.isAdmin || false;

    // Derive effective theme mode
    const effectiveThemeMode = React.useMemo(() => {
        if (config.theme === "auto") {
            const hour = new Date().getHours();
            return hour >= 6 && hour < 18 ? "light" : "dark";
        }
        return config.theme;
    }, [config.theme]);

    const mainNavItems = [
        { id: "home", icon: Icons.Home, label: t('home') },
        { id: "servers", icon: Icons.Dns, label: t('servers') },
        { id: "modpack", icon: Icons.Modpack, label: t('modpacks') },
        { id: "explore", icon: Icons.Search, label: t('explore') },
        { id: "wardrobe", icon: Icons.Hanger, label: t('wardrobe') },
    ];

    const bottomNavItems = [
        ...(isAdmin ? [{ id: "admin", icon: Icons.Admin, label: t('admin') }] : []),
        { id: "settings", icon: Icons.Settings, label: t('settings') },
        { id: "about", icon: Icons.Info, label: t('about') },
    ];

    const renderTooltip = (id: string, label: string) => (
        hoveredTab === id ? (
            <div
                className="absolute ml-3 px-3 py-1.5 rounded-lg whitespace-nowrap z-50 pointer-events-none select-none shadow-xl border border-white/10"
                style={{
                    backgroundColor: "rgba(0, 0, 0, 0.95)",
                    color: "#fff",
                    fontSize: "0.75rem",
                    left: "100%",
                    top: "50%",
                    transform: "translateY(-50%)",
                    position: "absolute",
                    display: "block",
                    visibility: "visible"
                }}
            >
                {label}
            </div>
        ) : null
    );

    return (
        <nav className="w-20 flex flex-col items-center" style={{ backgroundColor: colors.secondary }}>
            {/* Main Nav - Added top spacing since logo is moved to header */}
            <div className="flex-1 flex flex-col items-center gap-2 pt-[22px]">

                {/* Main Navigation Items */}
                {mainNavItems.map(({ id, icon: Icon, label }: { id: string, icon: any, label: string }) => (
                    <div 
                        key={id} 
                        className="relative group select-none"
                        onDragStart={(e) => e.preventDefault()}
                        draggable={false}
                        style={{ WebkitUserDrag: "none" } as React.CSSProperties}
                        onMouseEnter={() => setHoveredTab(id)}
                        onMouseLeave={() => setHoveredTab(null)}
                    >
                        <button
                            title=""
                            onClick={() => { 
                                playClick(); 
                                if (activeTab !== id) {
                                    React.startTransition(() => setActiveTab(id));
                                }
                                onTabSelect?.(id);
                            }}
                            onDragStart={(e) => e.preventDefault()}
                            draggable={false}
                            className="w-14 h-14 rounded-2xl flex items-center justify-center no-drag relative select-none"
                            style={{
                                color: "#1a1a1a",
                                WebkitUserDrag: "none"
                            } as React.CSSProperties}
                        >
                            {activeTab === id && (
                                <div className="absolute inset-0 bg-white/90 rounded-2xl" />
                            )}
                            <Icon className="w-6 h-6 z-10 relative pointer-events-none select-none" />
                        </button>
                        {renderTooltip(id, label)}
                    </div>
                ))}
            </div>

            {/* Bottom Section - Settings and About */}
            <div className="flex-col items-center gap-2 pb-4 flex">
                {bottomNavItems.map(({ id, icon: Icon, label }: { id: string, icon: any, label: string }) => (
                    <div 
                        key={id} 
                        className="relative group select-none"
                        onDragStart={(e) => e.preventDefault()}
                        draggable={false}
                        style={{ WebkitUserDrag: "none" } as React.CSSProperties}
                        onMouseEnter={() => setHoveredTab(id)}
                        onMouseLeave={() => setHoveredTab(null)}
                    >
                        <button
                            title=""
                            onClick={() => { 
                                playClick(); 
                                if (activeTab !== id) {
                                    React.startTransition(() => setActiveTab(id));
                                }
                                onTabSelect?.(id);
                            }}
                            onDragStart={(e) => e.preventDefault()}
                            draggable={false}
                            className="w-14 h-14 rounded-2xl flex items-center justify-center no-drag relative select-none"
                            style={{
                                color: "#1a1a1a",
                                WebkitUserDrag: "none"
                            } as React.CSSProperties}
                        >
                            {activeTab === id && (
                                <div className="absolute inset-0 bg-white/90 rounded-2xl" />
                            )}
                            <Icon className="w-6 h-6 z-10 relative pointer-events-none select-none" />
                        </button>
                        {renderTooltip(id, label)}
                    </div>
                ))}
            </div>
        </nav>
    );
}
