import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("launcher app shell LOC guard", () => {
  it("keeps LauncherAppShell.tsx at or below 500 lines", () => {
    const source = readFileSync(join(import.meta.dir, "LauncherAppShell.tsx"), "utf8");
    const lines = source.split(/\r?\n/).length;
    expect(lines).toBeLessThanOrEqual(500);
  });
});

describe("launcher app shell prop count guard", () => {
  it("keeps LauncherAppShellProps interface at or below 60 props", () => {
    const source = readFileSync(join(import.meta.dir, "LauncherAppShell.tsx"), "utf8");
    const match = source.match(/interface\s+LauncherAppShellProps\s*\{([\s\S]*?)\n\}/);
    expect(match).not.toBeNull();
    const body = match![1];
    const propLines = body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("//") && !l.startsWith("*"));
    expect(propLines.length).toBeLessThanOrEqual(60);
  });
});
