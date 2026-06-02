import React from "react";

const lazyNamed = <T extends React.ComponentType<any>>(
  load: () => Promise<any>,
  exportName: string,
) =>
  React.lazy(async (): Promise<{ default: T }> => {
    const module = await load();
    return { default: module[exportName] };
  });

export const ServerMenu = lazyNamed<typeof import("./tabs/ServerMenu").ServerMenu>(
  () => import("./tabs/ServerMenu"),
  "ServerMenu",
);
export const ModPack = lazyNamed<typeof import("./tabs/ModPack").ModPack>(
  () => import("./tabs/ModPack"),
  "ModPack",
);
export const Explore = lazyNamed<typeof import("./tabs/Explore").Explore>(
  () => import("./tabs/Explore"),
  "Explore",
);
export const About = lazyNamed<typeof import("./tabs/About").About>(
  () => import("./tabs/About"),
  "About",
);
export const Wardrobe = lazyNamed<typeof import("./tabs/Wardrobe").Wardrobe>(
  () => import("./tabs/Wardrobe"),
  "Wardrobe",
);
export const SettingsDialog = lazyNamed<typeof import("./SettingsDialog").SettingsDialog>(
  () => import("./SettingsDialog"),
  "SettingsDialog",
);
export const AdminPanel = React.lazy(
  () => import("./tabs/AdminPanel"),
) as React.LazyExoticComponent<typeof import("./tabs/AdminPanel").default>;

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
