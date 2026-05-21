import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const shellSource = readFileSync(join(import.meta.dir, "LauncherAppShell.tsx"), "utf8");

describe("launcher toast placement", () => {
  it("keeps app toasts anchored at the bottom right", () => {
    expect(shellSource).toContain('position="bottom-right"');
    expect(shellSource).toContain("bottom: 24");
    expect(shellSource).toContain("right: 24");
    expect(shellSource).not.toContain('position="top-center"');
  });
});
