import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sidebarSource = readFileSync(join(import.meta.dir, "Sidebar.tsx"), "utf8");

describe("sidebar animation regression", () => {
  it("keeps sidebar selection and tooltip rendering animation-free", () => {
    expect(sidebarSource).not.toContain("framer-motion");
    expect(sidebarSource).not.toContain("motion.");
    expect(sidebarSource).not.toContain("AnimatePresence");
    expect(sidebarSource).not.toContain("layoutId=");
    expect(sidebarSource).not.toContain("transition={{");
  });
});
