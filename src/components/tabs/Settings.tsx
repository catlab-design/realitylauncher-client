import type { AuthSession, LauncherConfig } from "../../types/launcher";
import { playClick } from "../../lib/sounds";
import {
    AccountTab,
    AppearanceTab,
    GameTab,
    ConnectionsTab,
    LauncherTab,
    UpdateTab,
    ResourcesTab,
    JavaTab,
} from "./settingsTabs";

interface SettingsProps {
    config: LauncherConfig;
    updateConfig: (newConfig: Partial<LauncherConfig>) => void;
    colors: any;
    setSettingsTab: (tab: "account" | "appearance" | "game" | "connections" | "launcher" | "resources" | "java" | "update") => void;
    settingsTab: "account" | "appearance" | "game" | "connections" | "launcher" | "resources" | "java" | "update";
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
}: SettingsProps) {
    const tabItems = [
        { id: "account", icon: "fa-user", label: "บัญชีผู้ใช้" },
        { id: "appearance", icon: "fa-palette", label: "การแสดงผล" },
        { id: "game", icon: "fa-gamepad", label: "เกมและประสิทธิภาพ" },
        { id: "connections", icon: "fa-wifi", label: "การเชื่อมต่อ" },
        { id: "launcher", icon: "fa-rocket", label: "Launcher" },
        { id: "update", icon: "fa-download", label: "อัปเดต" },
        { id: "resources", icon: "fa-hard-drive", label: "จัดการทรัพยากร" },
        { id: "java", icon: "fa-brands fa-java", label: "Java" },
    ];

    const commonProps = { config, updateConfig, colors };

    return (
        <div className="flex gap-6 h-full">
            {/* Sidebar Navigation */}
            <div className={`${config.fullscreen ? "w-64" : "w-56"} flex-shrink-0 pr-4 transition-all`}>
                <div className="sticky top-0 space-y-1">
                    {tabItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => { if (config.clickSoundEnabled) playClick(); setSettingsTab(item.id as typeof settingsTab); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all text-left"
                            style={{
                                backgroundColor: settingsTab === item.id ? colors.secondary : "transparent",
                                color: settingsTab === item.id ? "#1a1a1a" : colors.onSurfaceVariant,
                            }}
                        >
                            <i className={`fa-solid ${item.icon} w-5`}></i>
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 space-y-6 overflow-auto">
                {settingsTab === "account" && (
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
                    />
                )}

                {settingsTab === "appearance" && <AppearanceTab {...commonProps} />}

                {settingsTab === "game" && (
                    <GameTab
                        {...commonProps}
                        handleBrowseJava={handleBrowseJava}
                        handleBrowseMinecraftDir={handleBrowseMinecraftDir}
                    />
                )}

                {settingsTab === "connections" && <ConnectionsTab {...commonProps} />}

                {settingsTab === "launcher" && <LauncherTab {...commonProps} />}

                {settingsTab === "update" && <UpdateTab {...commonProps} />}

                {settingsTab === "resources" && <ResourcesTab {...commonProps} />}

                {settingsTab === "java" && <JavaTab {...commonProps} />}
            </div>
        </div>
    );
}
