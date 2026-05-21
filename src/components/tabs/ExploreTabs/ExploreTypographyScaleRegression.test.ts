import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const readExploreSource = (fileName: string) =>
  readFileSync(join(import.meta.dir, fileName), "utf8");

describe("Explore page typography scale", () => {
  it("keeps project cards readable at launcher desktop sizes", () => {
    const source = readExploreSource("ProjectCard.tsx");

    expect(source).toContain("text-[15px] font-semibold");
    expect(source).toContain("text-xs truncate mb-2");
    expect(source).toContain("text-xs line-clamp-2 leading-5 h-[40px]");
    expect(source).toContain("text-[11px] font-medium");
  });

  it("keeps the preview panel text large enough to scan", () => {
    const source = readExploreSource("ProjectPreview.tsx");

    expect(source).toContain("text-2xl font-bold");
    expect(source).toContain("gap-2 text-sm");
    expect(source).toContain("text-[11px] uppercase");
    expect(source).toContain("text-sm leading-6");
    expect(source).toContain("text-xs opacity-70 flex flex-wrap gap-2");
  });

  it("keeps list status and pagination labels from shrinking", () => {
    const source = readExploreSource("ProjectList.tsx");

    expect(source).toContain("text-sm font-medium");
    expect(source).toContain("text-xs px-2 py-0.5 rounded-full");
    expect(source).toContain("rounded-md text-sm font-medium");
    expect(source).toContain("text-sm font-bold");
  });

  it("keeps the explore toolbar title and search text readable", () => {
    const source = readExploreSource("ExploreToolbar.tsx");

    expect(source).toContain("font-semibold text-base tracking-tight");
    expect(source).toContain("rounded-xl text-[15px] outline-none");
  });
});
