import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("modpack tab LOC guard", () => {
  it("keeps ModPack.tsx at or below 1200 lines", () => {
    const source = readFileSync(join(import.meta.dir, "ModPack.tsx"), "utf8");
    const lines = source.split(/\r?\n/).length;
    expect(lines).toBeLessThanOrEqual(1200);
  });
});
