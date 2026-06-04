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
  it("uses Amazon Corretto direct download in Electron fallback installer", () => {
    expect(utilityHandlersSource).toContain(
      "https://corretto.aws/downloads/latest/"
    );
    expect(utilityHandlersSource).toContain("amazon-corretto-");
  });

  it("uses Amazon Corretto direct download in native installer", () => {
    expect(nativeJavaSource).toContain(
      "https://corretto.aws/downloads/latest/amazon-corretto-"
    );
  });

  it("drops the Azul Zulu metadata API from installer defaults", () => {
    expect(utilityHandlersSource).not.toContain(
      "https://api.azul.com/metadata/v1/zulu/packages/"
    );
    expect(nativeJavaSource).not.toContain(
      "https://api.azul.com/metadata/v1/zulu/packages/"
    );
  });

  it("removes Adoptium endpoint from installer defaults", () => {
    expect(utilityHandlersSource).not.toContain("api.adoptium.net/v3/assets");
    expect(nativeJavaSource).not.toContain("api.adoptium.net/v3/assets");
  });
});
