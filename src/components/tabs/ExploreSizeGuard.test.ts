import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("explore tab LOC guard", () => {
  it("keeps Explore.tsx at or below 1100 lines", () => {
    const source = readFileSync(join(import.meta.dir, "Explore.tsx"), "utf8");
    const lines = source.split(/\r?\n/).length;
    expect(lines).toBeLessThanOrEqual(1100);
  });
});
