import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(import.meta.dir, "InstanceContentBrowser.tsx"),
  "utf8",
);

describe("InstanceContentBrowser explore layout parity", () => {
  it("uses the same responsive toolbar shell as the Explore tab", () => {
    expect(source).toContain("className=\"rounded-2xl\"");
    expect(source).not.toContain("shadow-[0_16px_40px_-28px_rgba(0,0,0,0.45)]");
    expect(source).toContain("flex flex-col md:flex-row md:items-center gap-3");
    expect(source).toContain("grid grid-cols-2 gap-2 w-full sm:w-auto md:min-w-[260px]");
  });

  it("keeps the tab and control row aligned with Explore on laptop-width screens", () => {
    expect(source).toContain("flex flex-col lg:flex-row lg:items-center gap-3");
    expect(source).toContain("overflow-x-auto");
    expect(source).toContain("min-h-10 px-4 py-2 rounded-xl");
  });

  it("matches Explore list density and pagination touch targets", () => {
    expect(source).toContain("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3");
    expect(source).toContain("min-w-10 h-10 rounded-xl");
  });
});
