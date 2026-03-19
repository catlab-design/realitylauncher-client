import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("translations LOC guard", () => {
  it("keeps translations.ts at or below 1500 lines", () => {
    const source = readFileSync(join(import.meta.dir, "translations.ts"), "utf8");
    const lines = source.split(/\r?\n/).length;
    expect(lines).toBeLessThanOrEqual(1500);
  });
});
