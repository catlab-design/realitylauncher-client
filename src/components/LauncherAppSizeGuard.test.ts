import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("launcher app LOC guard", () => {
  it("keeps LauncherApp.tsx at or below 1500 lines", () => {
    const source = readFileSync(join(import.meta.dir, "LauncherApp.tsx"), "utf8");
    const lines = source.split(/\r?\n/).length;
    expect(lines).toBeLessThanOrEqual(1500);
  });
});
