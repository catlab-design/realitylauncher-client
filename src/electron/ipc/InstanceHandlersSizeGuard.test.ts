import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("instance handlers LOC guard", () => {
  it("keeps instance-handlers.ts at or below 1500 lines", () => {
    const source = readFileSync(
      join(import.meta.dir, "instance-handlers.ts"),
      "utf8",
    );
    const lines = source.split(/\r?\n/).length;
    expect(lines).toBeLessThanOrEqual(1500);
  });
});
