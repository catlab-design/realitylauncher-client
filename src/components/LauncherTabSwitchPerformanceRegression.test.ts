import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const shellSource = readFileSync(join(import.meta.dir, "LauncherAppShell.tsx"), "utf8");
const sidebarSource = readFileSync(join(import.meta.dir, "layout", "Sidebar.tsx"), "utf8");

describe("launcher tab switch performance", () => {
  it("does not force the tab viewport to remount on every tab change", () => {
    expect(shellSource).not.toContain("key={contentTab}");
  });

  it("marks sidebar tab changes as transition work", () => {
    expect(sidebarSource).toContain("React.startTransition(() => setActiveTab(id))");
    expect(sidebarSource).toContain("if (activeTab !== id)");
  });
});
