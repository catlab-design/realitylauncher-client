import { AnimatePresence, motion } from "framer-motion";
import type { AuthSession, LauncherConfig } from "../../types/launcher";
import { playClick } from "../../lib/sounds";
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
            content = <ResourcesTab {...commonProps} />;
            break;
        case "java":
            content = <JavaTab {...commonProps} />;
            break;
        default:
            content = null;
            break;
    }

    return (
        <div className="grid h-full min-h-0 gap-6 md:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)]">
            {/* Sidebar Navigation */}
            <motion.div
                className="min-h-0 md:border-r md:pr-5 overflow-y-auto md:overflow-y-auto"
                style={{ borderColor: `${colors.onSurface}10` }}
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.24, ease: "easeOut" }}
            >
                <motion.div
                    className="space-y-1 rounded-[1.75rem] p-2"
                    style={{ backgroundColor: colors.surfaceContainer }}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.24, delay: 0.06, ease: "easeOut" }}
                >
                    {tabItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => { if (config.clickSoundEnabled) playClick(); setSettingsTab(item.id as typeof settingsTab); }}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all text-left whitespace-nowrap relative group active:scale-[0.99]"
                            style={{
                                color: settingsTab === item.id ? "#1a1a1a" : colors.onSurfaceVariant,
                            }}
                        >
                            {settingsTab === item.id && (
                                <motion.div
                                    layoutId="settings-active-pill"
                                    className="absolute inset-0 rounded-xl"
                                    style={{ backgroundColor: colors.secondary }}
                                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                                />
                            )}
                            <i className={`fa-solid ${item.icon} w-5 z-10 relative`}></i>
                            <span className="z-10 relative">{item.label}</span>
                        </button>
                    ))}
                </motion.div>
            </motion.div>

            {/* Content Area */}
            <div className="min-w-0 overflow-y-auto overflow-x-hidden pr-1">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={settingsTab}
                        initial={{ opacity: 0, x: 18 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -12 }}
                        transition={{ duration: 0.24, ease: "easeOut" }}
                    >
                        {content}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
