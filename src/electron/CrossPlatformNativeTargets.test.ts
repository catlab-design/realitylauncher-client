import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const nativePackage = JSON.parse(
  readFileSync(join(import.meta.dir, "..", "..", "native", "package.json"), "utf8"),
);

describe("cross-platform native packaging", () => {
  it("declares native module targets for Windows, Linux, and macOS release runners", () => {
    const targets = nativePackage.napi?.triples?.additional || [];

    expect(targets).toContain("x86_64-pc-windows-msvc");
    expect(targets).toContain("x86_64-unknown-linux-gnu");
    expect(targets).toContain("x86_64-apple-darwin");
    expect(targets).toContain("aarch64-apple-darwin");
  });
});
