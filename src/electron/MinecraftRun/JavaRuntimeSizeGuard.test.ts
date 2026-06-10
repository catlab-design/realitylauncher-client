import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("java runtime LOC guard", () => {
  it("keeps javaRuntime.ts at or below 700 lines", () => {
    const source = readFileSync(join(import.meta.dir, "javaRuntime.ts"), "utf8");
    const lines = source.split(/\r?\n/).length;
    expect(lines).toBeLessThanOrEqual(700);
  });
});
