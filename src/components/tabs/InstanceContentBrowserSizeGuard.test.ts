import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("instance content browser LOC guard", () => {
  it("keeps InstanceContentBrowser.tsx at or below 1300 lines", () => {
    const source = readFileSync(join(import.meta.dir, "InstanceContentBrowser.tsx"), "utf8");
    const lines = source.split(/\r?\n/).length;
    expect(lines).toBeLessThanOrEqual(1300);
  });
});
