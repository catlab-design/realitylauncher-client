import { create } from "zustand";

type LaunchingIdUpdater = string | null | ((prev: string | null) => string | null);

interface LaunchState {
  /**
   * Instance id ที่กำลัง "launching" อยู่ (ก่อนเกมจะรันจริง).
   * เก็บไว้ที่ global store เพื่อให้สถานะ "กำลังเปิด" รอดการสลับแท็บ
   * (คอมโพเนนต์ tab ถูก unmount/remount ได้ระหว่างที่ launch ยังทำงานอยู่).
   */
  launchingId: string | null;
  setLaunchingId: (next: LaunchingIdUpdater) => void;
}

export const useLaunchStore = create<LaunchState>((set) => ({
  launchingId: null,
  // รองรับทั้งค่าตรง ๆ และ functional updater ให้ใช้แทน useState setter ได้
  setLaunchingId: (next) =>
    set((state) => ({
      launchingId:
        typeof next === "function" ? next(state.launchingId) : next,
    })),
}));
