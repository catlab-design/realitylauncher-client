import { describe, expect, it } from "bun:test";
import {
  inferVersionFromFilename,
  packFormatToVersion,
} from "./version-helpers";

describe("version parsing regressions", () => {
  it("returns readable minecraft ranges for pack formats without mojibake", () => {
    expect(packFormatToVersion(15, "resource")).toBe("1.20 - 1.20.1");
    expect(packFormatToVersion(15, "data")).toBe("1.20 - 1.20.1");
    expect(packFormatToVersion(22, "resource")).toBe("1.20.3 - 1.20.4");
  });

  it("infers the content version from filenames when pack metadata is missing", () => {
    expect(inferVersionFromFilename("veinminer-paper-2.4.2.jar")).toBe("2.4.2");
    expect(inferVersionFromFilename("ThaiFontFix-1.20.1.zip")).toBe("1.20.1");
    expect(
      inferVersionFromFilename("Insanity-Shader-Universal-v1.650.zip"),
    ).toBe("1.650");
  });

  it("prefers the mod release version over the minecraft compatibility segment", () => {
    expect(
      inferVersionFromFilename("another_furniture-forge-1.20.1-3.0.4.jar"),
    ).toBe("3.0.4");
    expect(
      inferVersionFromFilename("aaa_particles-1.20.1-1.4.11-forge.jar"),
    ).toBe("1.4.11");
    expect(
      inferVersionFromFilename("[20.12]EpicFight_Improve120.1-1.0.1.jar"),
    ).toBe("1.0.1");
  });
});
