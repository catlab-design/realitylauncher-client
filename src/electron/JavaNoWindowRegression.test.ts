import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const nativeJavaSource = readFileSync(
  join(import.meta.dir, "..", "..", "native", "src", "java", "mod.rs"),
  "utf8",
);
const utilityHandlersSource = readFileSync(
  join(import.meta.dir, "ipc", "utility-handlers.ts"),
  "utf8",
);
const launcherHandlersSource = readFileSync(
  join(import.meta.dir, "ipc", "launcher-handlers.ts"),
  "utf8",
);
const nativeIndexSource = readFileSync(
  join(import.meta.dir, "..", "..", "native", "index.cjs"),
  "utf8",
);

describe("Java native process spawning", () => {
  it("hides Java version probe windows on Windows", () => {
    expect(nativeJavaSource).toContain("CREATE_NO_WINDOW");
    expect(nativeJavaSource).toContain("creation_flags(CREATE_NO_WINDOW)");
  });

  it("avoids shell-based where/which java lookup in utility handlers", () => {
    expect(utilityHandlersSource).not.toContain("execSync(findCommand");
    expect(utilityHandlersSource).toContain("spawnSync(findCommand");
    expect(utilityHandlersSource).toContain("windowsHide: true");
  });

  it("avoids shell-based where/which java lookup in launcher handlers", () => {
    expect(launcherHandlersSource).not.toContain("execSync(command");
    expect(launcherHandlersSource).toContain("spawnSync(command");
    expect(launcherHandlersSource).toContain("windowsHide: true");
  });

  it("provides a Windows-safe JS fallback in the native wrapper", () => {
    expect(nativeIndexSource).toContain("windowsHide: true");
    expect(nativeIndexSource).toContain("detectJavaInstallationsSafe");
    expect(nativeIndexSource).toContain("findJavaForMinecraftSafe");
  });
});
