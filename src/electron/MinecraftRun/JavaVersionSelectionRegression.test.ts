import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const rustLauncherSource = readFileSync(join(import.meta.dir, "rustLauncher.ts"), "utf8");

describe("Minecraft Java version selection regressions", () => {
  it("prefers Mojang's version manifest Java requirement when available", () => {
    expect(rustLauncherSource).toContain("versionData?.javaVersion?.majorVersion");
    expect(rustLauncherSource).toContain("manifestJava=${manifestJavaMajor}");
    expect(rustLauncherSource).toContain("getRequiredJavaVersion(version, mergedVersionData)");
  });

  it("also uses the manifest Java requirement during pre-install", () => {
    expect(rustLauncherSource).toContain("Resolve Java after manifest merge");
    expect(rustLauncherSource).toContain("getJavaPath(\n        customJavaPath,\n        config.javaPath,\n        native,\n        version,\n        requiredJavaMajor");
  });

  it("checks Java 25 before older configured Java paths when Java 25 is required", () => {
    expect(rustLauncherSource).toContain("targetJavaVersion >= 25");
    expect(rustLauncherSource).toContain("const candidates = [javaPaths.java25]");
    expect(rustLauncherSource).toContain("Java 25+ not found. Please install Java 25 or newer.");
  });

  it("verifies configured Java paths before selecting them", () => {
    expect(rustLauncherSource).toContain("isCompatibleJavaPath");
    expect(rustLauncherSource).toContain("getJavaMajorVersion(p, targetJavaVersion, false)");
    expect(rustLauncherSource).toContain("Skipping incompatible Java path");
    expect(rustLauncherSource).not.toContain("javaPath = candidates.find(isValidJavaPath)");
  });

  it("keeps the old 1.x Java rules for legacy and modern releases", () => {
    expect(rustLauncherSource).toContain("minor < 17");
    expect(rustLauncherSource).toContain("minor > 20 || (minor === 20 && patch >= 5)");
  });
});
