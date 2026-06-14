import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const instancesSource = readFileSync(join(import.meta.dir, "instances.ts"), "utf8");
const instanceHandlersSource = readFileSync(
  join(import.meta.dir, "ipc", "instance-handlers.ts"),
  "utf8",
);
const rustLauncherSource = readFileSync(
  join(import.meta.dir, "MinecraftRun", "rustLauncher.ts"),
  "utf8",
);
const launchArgsSource = readFileSync(
  join(import.meta.dir, "MinecraftRun", "launchArgs.ts"),
  "utf8",
);

describe("instance metadata save regressions", () => {
  it("serializes concurrent saves for the same instance", () => {
    expect(instancesSource).toContain("const saveQueues = new Map<string, Promise<void>>()");
    expect(instancesSource).toContain("previous.catch(() => undefined).then(() => writeInstance(instance))");
    expect(instancesSource).toContain("if (saveQueues.get(instance.id) === next)");
  });

  it("uses unique temporary metadata files before rename", () => {
    expect(instancesSource).toContain("process.pid");
    expect(instancesSource).toContain("Math.random().toString(36)");
    expect(instancesSource).not.toContain("const tmpPath = `${metaPath}.tmp`");
  });

  it("does not write Minecraft access tokens to launch logs", () => {
    expect(instanceHandlersSource).toContain('accessToken: launchOptions.accessToken ? "[redacted]" : undefined');
    expect(instanceHandlersSource).not.toContain("logger.info(`[Launch] Launch Options:`, { options: launchOptions });");
    expect(launchArgsSource).toContain("export function redactLaunchArgs");
    expect(rustLauncherSource).toContain("const debugAllArgs = redactLaunchArgs(allArgs, accessToken)");
    expect(rustLauncherSource).not.toContain('`"${javaPath}" ${allArgs.join(" ")}`');
  });
});
