import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const shellSource = readFileSync(join(import.meta.dir, "LauncherAppShell.tsx"), "utf8");
const lazyTabsSource = readFileSync(join(import.meta.dir, "LauncherAppLazyTabs.tsx"), "utf8");

describe("launcher app shell bundle performance", () => {
  it("does not import every tab through the tabs barrel in the initial chunk", () => {
    expect(shellSource).toContain('import { Home } from "./tabs/Home";');
    expect(shellSource).not.toContain('import { Home, ServerMenu, ModPack, Explore, About, Wardrobe } from "./tabs";');
    expect(shellSource).not.toContain('from "./SettingsDialog";');
  });

  it("lazy-loads non-home tabs behind suspense", () => {
    expect(shellSource).toContain('from "./LauncherAppLazyTabs";');
    expect(lazyTabsSource).toContain("export const ServerMenu = lazyNamed");
    expect(lazyTabsSource).toContain("export const ModPack = lazyNamed");
    expect(lazyTabsSource).toContain("export const Explore = lazyNamed");
    expect(lazyTabsSource).toContain("export const Wardrobe = lazyNamed");
    expect(lazyTabsSource).toContain("export const SettingsDialog = lazyNamed");
    expect(shellSource).toContain("shouldRenderSettingsDialog");
    expect(shellSource).toContain("<React.Suspense");
  });
});
