import React from "react";
import { ServerMenu as ServerMenuComp } from "./tabs/ServerMenu";
import { ModPack as ModPackComp } from "./tabs/ModPack";
import { Explore as ExploreComp } from "./tabs/Explore";
import { About as AboutComp } from "./tabs/About";
import { Wardrobe as WardrobeComp } from "./tabs/Wardrobe";
import { SettingsDialog as SettingsDialogComp } from "./SettingsDialog";
import AdminPanelComp from "./tabs/AdminPanel";

export const ServerMenu = React.memo(ServerMenuComp);
export const ModPack = React.memo(ModPackComp);
export const Explore = React.memo(ExploreComp);
export const About = React.memo(AboutComp);
export const Wardrobe = React.memo(WardrobeComp);
export const SettingsDialog = SettingsDialogComp;
export const AdminPanel = React.memo(AdminPanelComp);

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

export function preloadTabs() {
}
