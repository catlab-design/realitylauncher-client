import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(import.meta.dir, "ProjectDetailPage.tsx"),
  "utf8",
);

describe("ProjectDetailPage install button", () => {
  it("forces the install action icon to render in black", () => {
    expect(source).toContain(
      '<i className={`fa-solid ${isInstalledProject ? "fa-check" : projectType === "modpack" ? "fa-download" : "fa-plus"}`} style={{ color: "#000" }} />',
    );
  });

  it("renders version pagination controls with theme-aware contrast", () => {
    expect(source).toContain('const versionControlColor = colors.onSurface === "#ffffff" ? colors.onSurface : "#000";');
    expect(source).toContain("style={{ color: versionControlColor }}");
    expect(source).not.toContain('className="text-[11px] px-2 font-bold tabular-nums" style={{ color: accentColor }}');
  });

  it("renders per-version install download icons with theme-aware contrast", () => {
    expect(source).toContain(
      'style={{ backgroundColor: `${accentColor}20`, color: versionControlColor }}',
    );
  });
});
