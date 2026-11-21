import { AnimatePresence, motion } from "framer-motion";
import type { AuthSession, LauncherConfig } from "../../types/launcher";
import { useRef } from "react";
import { playClick } from "../../lib/sounds";
import { useMotionPreset } from "../../lib/motion";
import {
    AccountTab,
    AppearanceTab,
    GameTab,
    ConnectionsTab,
    LanguageTab,
    LauncherTab,
    UpdateTab,
    ResourcesTab,
    JavaTab,
} from "./settingsTabs";
import { useTranslation } from "../../hooks/useTranslation";

interface SettingsProps {
    config: LauncherConfig;
    updateConfig: (newConfig: Partial<LauncherConfig>) => void;
    colors: any;
    setSettingsTab: (tab: "account" | "appearance" | "game" | "connections" | "language" | "launcher" | "resources" | "java" | "update") => void;
    settingsTab: "account" | "appearance" | "game" | "connections" | "language" | "launcher" | "resources" | "java" | "update";
    handleBrowseJava: () => void;
    handleBrowseMinecraftDir: () => void;
    session: AuthSession | null;
    accounts: AuthSession[];
    handleLogout: () => void;
    selectAccount: (account: AuthSession) => void;
    removeAccount: (account: AuthSession) => void;
    setLoginDialogOpen: (open: boolean) => void;
    handleUnlink: (provider: "catid" | "microsoft") => void;
    setLinkCatIDOpen: (open: boolean) => void;
    onLinkMicrosoft: () => void;
}

export function Settings({
    config,
    updateConfig,
    colors,
    setSettingsTab,
    settingsTab,
    handleBrowseJava,
    handleBrowseMinecraftDir,
    session,
    accounts,
    handleLogout,
    selectAccount,
    removeAccount,
    setLoginDialogOpen,
    handleUnlink,
    setLinkCatIDOpen,
    onLinkMicrosoft,
}: SettingsProps) {
    const { t } = useTranslation(config.language);
    const m = useMotionPreset();
    const contentRef = useRef<HTMLDivElement>(null);
    const tabItems = [
        { id: "account", icon: "fa-user", label: t('tab_account') },
        { id: "language", icon: "fa-language", label: t('language') },
        { id: "appearance", icon: "fa-palette", label: t('tab_appearance') },
        { id: "game", icon: "fa-gamepad", label: t('tab_game') },
        { id: "connections", icon: "fa-wifi", label: t('tab_connections') },
        { id: "launcher", icon: "fa-rocket", label: t('tab_launcher') },
        { id: "update", icon: "fa-download", label: t('tab_update') },
        { id: "resources", icon: "fa-hard-drive", label: t('tab_resources') },
        { id: "java", icon: "fa-brands fa-java", label: t('tab_java') },
    ];

    const commonProps = { config, updateConfig, colors };
    let content = null;

    switch (settingsTab) {
        case "account":
            content = (
                <AccountTab
                    {...commonProps}
                    session={session}
                    accounts={accounts}
                    handleLogout={handleLogout}
                    selectAccount={selectAccount}
                    removeAccount={removeAccount}
                    setLoginDialogOpen={setLoginDialogOpen}
                    handleUnlink={handleUnlink}
                    setLinkCatIDOpen={setLinkCatIDOpen}
                    onLinkMicrosoft={onLinkMicrosoft}
                />
            );
            break;
        case "appearance":
            content = <AppearanceTab {...commonProps} />;
            break;
        case "game":
            content = (
                <GameTab
                    {...commonProps}
                    handleBrowseJava={handleBrowseJava}
                    handleBrowseMinecraftDir={handleBrowseMinecraftDir}
                />
            );
            break;
        case "language":
            content = <LanguageTab {...commonProps} />;
            break;
        case "connections":
            content = <ConnectionsTab {...commonProps} />;
            break;
        case "launcher":
            content = <LauncherTab {...commonProps} />;
            break;
        case "update":
            content = <UpdateTab {...commonProps} />;
            break;
        case "resources":
            content = <ResourcesTab {...commonProps} handleBrowseMinecraftDir={handleBrowseMinecraftDir} />;
            break;
        case "java":
            content = <JavaTab {...commonProps} />;
            break;
        default:
            content = null;
            break;
    }

    return (
        <div className="grid h-full min-h-0 gap-8 md:grid-cols-[230px_minmax(0,1fr)] lg:grid-cols-[250px_minmax(0,1fr)]">
			<motion.div
                className="min-h-0 md:border-r md:pr-6 overflow-y-auto"
                style={{ borderColor: colors.outlineVariant }}
                variants={m.slideIn("left", 12)}
                {...m.states}
            >
                <div className="space-y-1 py-1">
                    {tabItems.map((item) => {
                        const isActive = settingsTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => { if (config.clickSoundEnabled) playClick(); setSettingsTab(item.id as typeof settingsTab); }}
                                className="w-full h-11 flex items-center gap-3.5 px-4 rounded-xl text-[15px] font-semibold transition-colors text-left whitespace-nowrap relative group hover:bg-black/5"
                                style={{
                                    color: isActive ? "#111" : colors.onSurfaceVariant,
                                }}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="settings-active-pill"
                                        className="absolute inset-0 rounded-xl animate-none"
                                        style={{ backgroundColor: colors.secondary }}
                                        transition={m.tabIndicator}
                                    />
                                )}
                                <i className={`fa-solid ${item.icon} w-5 text-base text-center z-10 relative`}></i>
                                <span className="z-10 relative">{item.label}</span>
                            </button>
                        );
                    })}
                </div>
            </motion.div>

			<div ref={contentRef} className="min-w-0 overflow-y-auto overflow-x-hidden pr-2">
                {/* Section switch: quick crossfade + 10px slide; each section opens at its top. */}
                <AnimatePresence mode="wait" initial={false} onExitComplete={() => contentRef.current?.scrollTo({ top: 0 })}>
                    <motion.div
                        key={settingsTab}
                        variants={m.panelSwap}
                        {...m.states}
                    >
                        {content}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
