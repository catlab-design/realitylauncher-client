import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const settingsSource = readFileSync(
  join(import.meta.dir, "Settings.tsx"),
  "utf8",
);

const uiStoreSource = readFileSync(
  join(import.meta.dir, "..", "..", "store", "uiStore.ts"),
  "utf8",
);

describe("settings language tab", () => {
  it("adds a language item to the settings sidebar", () => {
    expect(settingsSource).toContain('id: "language"');
    expect(settingsSource).toContain('case "language":');
    expect(settingsSource).toContain("<LanguageTab");
  });

  it("allows language as a persisted settings tab state", () => {
    expect(uiStoreSource).toContain('"language"');
  });
});
