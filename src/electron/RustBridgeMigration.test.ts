import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const javaHandlersSource = readFileSync(
  join(import.meta.dir, "ipc", "java-handlers.ts"),
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
    expect(javaHandlersSource).toContain("getNativeModule");
    expect(javaHandlersSource).toContain("native.detectJavaInstallations");
    expect(javaHandlersSource).toContain("native.validateJavaPath");
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
