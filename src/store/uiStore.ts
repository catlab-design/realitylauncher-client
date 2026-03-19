import { create } from 'zustand';

interface UiState {
    // Navigation
    activeTab: string;
    setActiveTab: (tab: string) => void;

    settingsTab: "appearance" | "game" | "connections" | "language" | "launcher" | "resources" | "java" | "account" | "update";
    setSettingsTab: (tab: UiState['settingsTab']) => void;

    // Modals
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

    // Actions to toggle modals
    openModal: (modal: keyof UiState['modals']) => void;
    closeModal: (modal: keyof UiState['modals']) => void;
    toggleModal: (modal: keyof UiState['modals']) => void;

    // Specific modal data
    changelogData: { version: string; changelog: string } | null;
    setChangelogData: (data: { version: string; changelog: string } | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
    activeTab: "home",
    setActiveTab: (tab) => set({ activeTab: tab }),

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
