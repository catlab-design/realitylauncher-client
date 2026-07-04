import { create } from "zustand";

type LaunchingIdUpdater = string | null | ((prev: string | null) => string | null);

interface LaunchState {
  launchingId: string | null;
  setLaunchingId: (next: LaunchingIdUpdater) => void;
}

export const useLaunchStore = create<LaunchState>((set) => ({
  launchingId: null,
  setLaunchingId: (next) =>
    set((state) => ({
      launchingId:
        typeof next === "function" ? next(state.launchingId) : next,
    })),
}));
