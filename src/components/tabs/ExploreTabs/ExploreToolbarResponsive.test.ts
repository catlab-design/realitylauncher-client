import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const toolbarSource = readFileSync(
  join(import.meta.dir, "ExploreToolbar.tsx"),
  "utf8",
);

describe("ExploreToolbar responsive layout", () => {
  it("keeps the toolbar flat without a drop shadow", () => {
    expect(toolbarSource).toContain('className="rounded-2xl"');
    expect(toolbarSource).not.toContain(
      "shadow-[0_16px_40px_-28px_rgba(0,0,0,0.45)]",
    );
  });

  it("keeps the compact horizontal toolbar on laptop-width screens", () => {
    expect(toolbarSource).toContain("md:flex-row");
    expect(toolbarSource).toContain("lg:flex-row");
    expect(toolbarSource).not.toContain("xl:flex-row");
  });

  it("keeps overflow and comfortable touch targets for narrow screens", () => {
    expect(toolbarSource).toContain("overflow-x-auto");
    expect(toolbarSource).toContain("min-h-11");
    expect(toolbarSource).toContain("w-full sm:w-auto");
  });

  it("keeps pagination buttons large enough to click comfortably", () => {
    expect(toolbarSource).toContain("h-10");
    expect(toolbarSource).toContain("min-w-10");
  });
});
