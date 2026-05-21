import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(import.meta.dir, "ImagePreviewModal.tsx"),
  "utf8",
);

describe("ImagePreviewModal viewport behavior", () => {
  it("locks page scrolling while the preview is open", () => {
    expect(source).toContain("const previousOverflow = document.body.style.overflow;");
    expect(source).toContain('document.body.style.overflow = "hidden";');
    expect(source).toContain("document.body.style.overflow = previousOverflow;");
  });

  it("fits preview images inside the available viewport instead of forcing oversized dimensions", () => {
    expect(source).toContain("max-w-[min(92vw,1400px)]");
    expect(source).toContain("max-h-[calc(100dvh-160px)]");
    expect(source).toContain("object-contain");
    expect(source).not.toContain("w-[95vw] h-[85vh]");
  });

  it("keeps the toolbar in the modal flow below the image", () => {
    expect(source).toContain("flex flex-col items-center justify-center");
    expect(source).toContain("mt-4 flex items-center gap-4");
    expect(source).not.toContain("absolute bottom-6 left-1/2");
  });
});
