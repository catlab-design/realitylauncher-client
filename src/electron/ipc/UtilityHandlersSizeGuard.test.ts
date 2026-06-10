import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("utility handlers LOC guard", () => {
  it("keeps utility-handlers.ts at or below 600 lines", () => {
    const source = readFileSync(join(import.meta.dir, "utility-handlers.ts"), "utf8");
    const lines = source.split(/\r?\n/).length;
    expect(lines).toBeLessThanOrEqual(600);
  });
});
