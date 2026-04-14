import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const utilityHandlersSource = readFileSync(
  join(import.meta.dir, "ipc", "utility-handlers.ts"),
  "utf8",
);

const nativeJavaSource = readFileSync(
  join(import.meta.dir, "..", "..", "native", "src", "java", "mod.rs"),
  "utf8",
);

describe("Java installer vendor defaults", () => {
  it("uses Azul Zulu metadata API in Electron fallback installer", () => {
    expect(utilityHandlersSource).toContain(
      "https://api.azul.com/metadata/v1/zulu/packages/"
    );
    expect(utilityHandlersSource).toContain('java_package_features: "headful"');
    expect(utilityHandlersSource).toContain("download_url");
  });

  it("uses Azul Zulu metadata API in native installer", () => {
    expect(nativeJavaSource).toContain(
      "https://api.azul.com/metadata/v1/zulu/packages/"
    );
    expect(nativeJavaSource).toContain("java_package_features=headful");
    expect(nativeJavaSource).toContain("\"download_url\"");
  });

  it("removes Adoptium endpoint from installer defaults", () => {
    expect(utilityHandlersSource).not.toContain("api.adoptium.net/v3/assets");
    expect(nativeJavaSource).not.toContain("api.adoptium.net/v3/assets");
  });
});
