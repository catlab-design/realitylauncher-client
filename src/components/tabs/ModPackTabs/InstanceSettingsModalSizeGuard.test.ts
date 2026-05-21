import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("instance settings modal LOC guard", () => {
  it("keeps InstanceSettingsModal.tsx at or below 1350 lines", () => {
    const source = readFileSync(join(import.meta.dir, "InstanceSettingsModal.tsx"), "utf8");
    const lines = source.split(/\r?\n/).length;
    expect(lines).toBeLessThanOrEqual(1350);
  });
});
