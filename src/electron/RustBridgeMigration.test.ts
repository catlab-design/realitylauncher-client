import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const utilityHandlersSource = readFileSync(
  join(import.meta.dir, "ipc", "utility-handlers.ts"),
  "utf8",
);
const launcherHandlersSource = readFileSync(
  join(import.meta.dir, "ipc", "launcher-handlers.ts"),
  "utf8",
);
const gameProcessSource = readFileSync(
  join(import.meta.dir, "MinecraftRun", "gameProcess.ts"),
  "utf8",
);

describe("Rust bridge migration", () => {
  it("routes Java detection through native module first", () => {
    expect(utilityHandlersSource).toContain("getNativeModule");
    expect(utilityHandlersSource).toContain("native.detectJavaInstallations");
    expect(utilityHandlersSource).toContain("native.validateJavaPath");
  });

  it("routes launcher Java fallback through native module first", () => {
    expect(launcherHandlersSource).toContain("getNativeModule");
    expect(launcherHandlersSource).toMatch(
      /native\.(findJavaForMinecraft|detectJavaInstallations)/,
    );
  });

  it("routes process kill and running-state checks through native module first", () => {
    expect(gameProcessSource).toContain("getNativeModule");
    expect(gameProcessSource).toContain("native.killProcessTree");
    expect(gameProcessSource).toContain("native.getRunningInstances");
    expect(gameProcessSource).toContain("native.isProcessAlive");
  });
});
