import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const modPackTabsDir = import.meta.dir;
const tabsDir = join(modPackTabsDir, "..");

const instanceDetail = readFileSync(join(tabsDir, "InstanceDetail.tsx"), "utf8");
const projectDetailPage = readFileSync(
  join(tabsDir, "ExploreTabs", "ProjectDetailPage.tsx"),
  "utf8",
);
const modsList = readFileSync(join(modPackTabsDir, "ModsList.tsx"), "utf8");
const lazyModItem = readFileSync(join(modPackTabsDir, "LazyModItem.tsx"), "utf8");
const contentList = readFileSync(join(modPackTabsDir, "ContentList.tsx"), "utf8");
const lazyContentItem = readFileSync(join(modPackTabsDir, "LazyContentItem.tsx"), "utf8");

describe("installed content project detail flow", () => {
  it("opens installed mods and content in the shared ProjectDetailPage", () => {
    expect(instanceDetail).toContain("ProjectDetailPage");
    expect(instanceDetail).toContain("handleOpenInstalledProjectDetail");
    expect(instanceDetail).toContain("contentDownloadToInstance");
    expect(instanceDetail).toContain("onInstallVersion={handleInstallVersionFromInstalledDetail}");
    expect(modsList).toContain("onOpenProjectDetail?: (mod: ModInfo) => void");
    expect(contentList).toContain("onOpenProjectDetail?: (item: ContentItem | DatapackItem) => void");
    expect(lazyModItem).toContain("onOpenProjectDetail?: (mod: ModInfo) => void");
    expect(lazyContentItem).toContain("onOpenProjectDetail?: (item: ContentItem | DatapackItem) => void");
  });

  it("marks installed project detail as installed instead of offering to add it again", () => {
    expect(instanceDetail).toContain("isInstalledProject={true}");
    expect(projectDetailPage).toContain("isInstalledProject?: boolean");
    expect(projectDetailPage).toContain("fa-check");
    expect(projectDetailPage).toContain("ติดตั้งแล้ว");
    expect(projectDetailPage).toContain("if (isInstalledProject) return;");
  });

  it("does not leave the instance header above the installed project detail page", () => {
    expect(instanceDetail).toContain("{!showContentBrowser && !installedDetailProject &&");
  });

  it("makes installed rows feel closer to Modrinth's content table scale", () => {
    for (const source of [lazyModItem, lazyContentItem]) {
      expect(source).toContain("min-h-[64px]");
      expect(source).toContain("w-12 h-12");
      expect(source).toContain("cursor-pointer");
      expect(source).toContain("hover:brightness-[0.98]");
    }
  });

  it("keeps the server lock control inside the mod row action group", () => {
    const actionsStart = lazyModItem.indexOf("{/* Actions (Toggle, Trash, Menu, Lock) */}");
    expect(actionsStart).toBeGreaterThan(-1);
    expect(lazyModItem.slice(0, actionsStart)).not.toContain("onToggleLock(mod.filename)");
    expect(lazyModItem.slice(actionsStart)).toContain("onToggleLock(mod.filename)");
  });
});
