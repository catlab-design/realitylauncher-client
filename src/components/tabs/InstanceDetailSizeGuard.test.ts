import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("instance detail LOC guard", () => {
  it("keeps InstanceDetail.tsx at or below 1550 lines", () => {
    const source = readFileSync(join(import.meta.dir, "InstanceDetail.tsx"), "utf8");
    const lines = source.split(/\r?\n/).length;
    expect(lines).toBeLessThanOrEqual(1550);
  });
});
