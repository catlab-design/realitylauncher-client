import { createContext, useContext } from "react";

export const KEEP_ALIVE_TABS = ["modpack", "explore"] as const;

export function isKeepAliveTab(tab: string): boolean {
  return (KEEP_ALIVE_TABS as readonly string[]).includes(tab);
}

export function nextMountedTabs(mounted: readonly string[], active: string): string[] {
  if (!isKeepAliveTab(active) || mounted.includes(active)) return mounted as string[];
  return [...mounted, active];
}

// False while a kept-alive tab is hidden; its effects that touch shared shell state must pause.
export const TabActiveContext = createContext(true);

export function useTabActive(): boolean {
  return useContext(TabActiveContext);
}
