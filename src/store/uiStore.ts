import { create } from 'zustand';

interface UiState {
    activeTab: string;
    setActiveTab: (tab: string) => void;
    lastContentTab: string;
    /** Instance the Modpack tab should launch as soon as it has loaded (set by Play on Home). */
    pendingLaunchId: string | null;
    /** Server whose detail page the Servers tab should open as soon as it has its list (set by Home cards). */
    pendingServerDetailId: string | null;
    setPendingServerDetailId: (id: string | null) => void;
    /** Server last clicked on the Servers tab, shown as "Picking a Server" in Discord. */
    pickedServer: { name: string; icon: string | null } | null;
    setPickedServer: (server: { name: string; icon: string | null } | null) => void;
    /** A full-bleed page is open: the title bar floats transparently over it. */
    immersive: boolean;
    setImmersive: (on: boolean) => void;
    /** The page draws right from the top edge, under the transparent title bar. */
    fullBleed: boolean;
    setFullBleed: (on: boolean) => void;
    /** Server modpack the Modpack tab should install as soon as it mounts (set by Install on Home). */
    pendingInstallServerId: string | null;
    setPendingInstallServerId: (id: string | null) => void;
    setPendingLaunchId: (id: string | null) => void;
    setLastContentTab: (tab: string) => void;
    wardrobeMode: "microsoft" | "catskinc";
    setWardrobeMode: (mode: "microsoft" | "catskinc") => void;

    settingsTab: "appearance" | "game" | "connections" | "language" | "launcher" | "resources" | "java" | "account" | "update";
    setSettingsTab: (tab: UiState['settingsTab']) => void;

    modals: {
        login: boolean;
        register: boolean;
        forgotPassword: boolean;
        importModpack: boolean;
        accountManager: boolean;
        changelog: boolean;
        offlineWarning: boolean;
        deviceCode: boolean;
        linkCatID: boolean;
    };

    openModal: (modal: keyof UiState['modals']) => void;
    closeModal: (modal: keyof UiState['modals']) => void;
    toggleModal: (modal: keyof UiState['modals']) => void;

    changelogData: { version: string; changelog: string } | null;
    setChangelogData: (data: { version: string; changelog: string } | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
    activeTab: "home",
    setActiveTab: (tab) => set({ activeTab: tab }),
    lastContentTab: "home",
    pendingLaunchId: null,
    pendingServerDetailId: null,
    setPendingServerDetailId: (id) => set({ pendingServerDetailId: id }),
    pickedServer: null,
    setPickedServer: (server) => set({ pickedServer: server }),
    immersive: false,
    setImmersive: (on) => set({ immersive: on }),
    fullBleed: false,
    setFullBleed: (on) => set({ fullBleed: on }),
    setPendingLaunchId: (id) => set({ pendingLaunchId: id }),
    pendingInstallServerId: null,
    setPendingInstallServerId: (id) => set({ pendingInstallServerId: id }),
    setLastContentTab: (tab) => set({ lastContentTab: tab }),
    wardrobeMode: (typeof window !== "undefined" && localStorage.getItem("wardrobe-mode") as "microsoft" | "catskinc") || "microsoft",
    setWardrobeMode: (mode) => {
        if (typeof window !== "undefined") {
            localStorage.setItem("wardrobe-mode", mode);
        }
        set({ wardrobeMode: mode });
    },

    settingsTab: "account",
    setSettingsTab: (tab) => set({ settingsTab: tab }),

    modals: {
        login: false,
        register: false,
        forgotPassword: false,
        importModpack: false,
        accountManager: false,
        changelog: false,
        offlineWarning: false,
        deviceCode: false,
        linkCatID: false,
    },

    openModal: (modal) => set((state) => ({
        modals: { ...state.modals, [modal]: true }
    })),

    closeModal: (modal) => set((state) => ({
        modals: { ...state.modals, [modal]: false }
    })),

    toggleModal: (modal) => set((state) => ({
        modals: { ...state.modals, [modal]: !state.modals[modal] }
    })),

    changelogData: null,
    setChangelogData: (data) => set({ changelogData: data }),
}));
