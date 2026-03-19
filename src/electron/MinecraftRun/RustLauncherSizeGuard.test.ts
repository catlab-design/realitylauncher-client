import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("rust launcher LOC guard", () => {
  it("keeps rustLauncher.ts at or below 1500 lines", () => {
    const source = readFileSync(join(import.meta.dir, "rustLauncher.ts"), "utf8");
    const lines = source.split(/\r?\n/).length;
    expect(lines).toBeLessThanOrEqual(1500);
  });
});
