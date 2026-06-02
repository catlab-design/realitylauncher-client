import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const contentSource = readFileSync(
  join(import.meta.dir, "content.ts"),
  "utf8",
);
const instancePackHandlersSource = readFileSync(
  join(import.meta.dir, "ipc", "instance-pack-handlers.ts"),
  "utf8",
);
const lazyContentItemSource = readFileSync(
  join(
    import.meta.dir,
    "..",
    "components",
    "tabs",
    "ModPackTabs",
    "LazyContentItem.tsx",
  ),
  "utf8",
);

describe("content icon regressions", () => {
  it("persists installed content linkage so future list refreshes can use the official project icon", () => {
    expect(contentSource).toContain("saveInstalledContentLink");
    expect(contentSource).toContain("iconUrl");
    expect(contentSource).toContain("projectId");
    expect(contentSource).toContain("versionId");
  });

  it("hydrates shader and resourcepack rows from installed content linkage before falling back to fuzzy name matching", () => {
    expect(instancePackHandlersSource).toContain("getInstalledContentLink");
    expect(instancePackHandlersSource).toContain("linkedIconUrl");
    expect(instancePackHandlersSource).toContain("linkedModrinthProjectId");
  });

  it("keeps shader listing fast by backfilling missing official links in the background instead of blocking the list response", () => {
    expect(instancePackHandlersSource).toContain("async function backfillMissingContentLink");
    expect(instancePackHandlersSource).toContain('void backfillMissingContentLink(');
    expect(instancePackHandlersSource).toContain(
      "return { ok: true, items: dedupeShaders(mapped as any[]) }",
    );
  });

  it("hydrates global datapacks from installed content linkage and keeps that linkage in sync on toggle/delete", () => {
    // Match on intent rather than exact indentation so reformatting doesn't break the guard.
    const normalized = instancePackHandlersSource.replace(/\s+/g, " ");
    expect(normalized).toContain('const linked = worldName === "(Global)"');
    expect(normalized).toContain(
      'await renameInstalledContentLink( instance.gameDirectory, "datapack"',
    );
    expect(normalized).toContain(
      'if (worldName === "(Global)") { await deleteInstalledContentLink(',
    );
  });

  it("lets linked project icons replace stale row icons after a refresh", () => {
    expect(lazyContentItemSource).toContain("setIconUrl(item.icon || null)");
    expect(lazyContentItemSource).not.toContain(
      "if (iconUrl || fetchAttempted.current) return;",
    );
    expect(lazyContentItemSource).toContain("setIconUrl(project.icon_url || project.iconUrl)");
  });
});
