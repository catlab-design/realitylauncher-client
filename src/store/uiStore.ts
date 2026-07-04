import { create } from 'zustand';

interface UiState {
    activeTab: string;
    setActiveTab: (tab: string) => void;
    lastContentTab: string;
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
