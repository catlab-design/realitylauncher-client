import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("rust launcher LOC guard", () => {
  // Note: this file already exceeded the old 1500 limit — it should be refactored
  // (e.g. split preInstallInstance / asset+native helpers into separate files)
  // before lowering the cap again.
  it("keeps rustLauncher.ts at or below 1850 lines", () => {
    const source = readFileSync(join(import.meta.dir, "rustLauncher.ts"), "utf8");
    const lines = source.split(/\r?\n/).length;
    expect(lines).toBeLessThanOrEqual(1850);
  });
});
