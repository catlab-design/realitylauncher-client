import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const wardrobeSource = readFileSync(
  join(import.meta.dir, "Wardrobe.tsx"),
  "utf8",
);
const skinPreviewSource = readFileSync(
  join(import.meta.dir, "wardrobe", "SkinPreview3D.tsx"),
  "utf8",
);
const utilityHandlersSource = readFileSync(
  join(import.meta.dir, "..", "..", "electron", "ipc", "utility-handlers.ts"),
  "utf8",
);

describe("wardrobe performance regressions", () => {
  it("shows a fallback skin preview immediately before the Microsoft profile request finishes", () => {
    expect(wardrobeSource).toContain(
      "selectedSkinDataUrl || profile?.skinUrl || fallbackSkinUrl",
    );
    expect(wardrobeSource).not.toContain(
      "profileFetched ? fallbackSkinUrl : null",
    );
  });

  it("reuses a cached Minecraft profile between wardrobe mounts", () => {
    expect(wardrobeSource).toContain("WARDROBE_PROFILE_CACHE_TTL_MS");
    expect(wardrobeSource).toContain("cachedWardrobeProfile");
  });

  it("persists the Minecraft profile cache in the main process for later wardrobe opens", () => {
    expect(utilityHandlersSource).toContain("MINECRAFT_PROFILE_CACHE_TTL_MS");
    expect(utilityHandlersSource).toContain("minecraft-profile-cache.json");
    expect(utilityHandlersSource).toContain("forceRefresh");
  });

  it("loads skinview3d lazily instead of at module evaluation time", () => {
    expect(skinPreviewSource).toContain("loadSkinViewerModule");
    expect(skinPreviewSource).not.toContain(
      'import { IdleAnimation, SkinViewer } from "skinview3d";',
    );
  });
});
