import React from "react";

const loadServerMenu = () => import("./tabs/ServerMenu");
const loadModPack = () => import("./tabs/ModPack");
const loadExplore = () => import("./tabs/Explore");
const loadAbout = () => import("./tabs/About");
const loadWardrobe = () => import("./tabs/Wardrobe");
const loadSettingsDialog = () => import("./SettingsDialog");
const loadAdminPanel = () => import("./tabs/AdminPanel");

const loaders = [loadServerMenu, loadModPack, loadExplore, loadAbout, loadWardrobe, loadSettingsDialog, loadAdminPanel];

export const ServerMenu = React.memo(React.lazy(() => loadServerMenu().then((m) => ({ default: m.ServerMenu }))));
export const ModPack = React.memo(React.lazy(() => loadModPack().then((m) => ({ default: m.ModPack }))));
export const Explore = React.memo(React.lazy(() => loadExplore().then((m) => ({ default: m.Explore }))));
export const About = React.memo(React.lazy(() => loadAbout().then((m) => ({ default: m.About }))));
export const Wardrobe = React.memo(React.lazy(() => loadWardrobe().then((m) => ({ default: m.Wardrobe }))));
export const SettingsDialog = React.lazy(() => loadSettingsDialog().then((m) => ({ default: m.SettingsDialog })));
export const AdminPanel = React.memo(React.lazy(loadAdminPanel));

export function TabLoadingFallback({ colors }: { colors: any }) {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center">
      <div
        className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: colors.primary, borderTopColor: "transparent" }}
      />
    </div>
  );
}

// Fetch every tab chunk once the app is idle so a first visit rarely shows the fallback.
export function preloadTabs() {
  const run = () => loaders.forEach((load) => void load());
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1500);
}
