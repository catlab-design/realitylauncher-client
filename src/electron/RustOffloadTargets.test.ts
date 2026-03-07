import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cloudInstancesSource = readFileSync(
  join(import.meta.dir, "cloud-instances.ts"),
  "utf8",
);
const instanceHandlersSource = readFileSync(
  join(import.meta.dir, "ipc", "instance-handlers.ts"),
  "utf8",
);
const modpackInstallerSource = readFileSync(
  join(import.meta.dir, "modpack-installer.ts"),
  "utf8",
);
const gameProcessSource = readFileSync(
  join(import.meta.dir, "MinecraftRun", "gameProcess.ts"),
  "utf8",
);

describe("rust offload targets", () => {
  it("uses native batch downloader in cloud sync path", () => {
    expect(cloudInstancesSource).toContain("tryDownloadQueueWithNativeBatch");
    expect(cloudInstancesSource).toContain("nativeModule.downloadFiles");
  });

  it("uses native mod list as primary source before JS enrichment", () => {
    expect(instanceHandlersSource).toContain("nativeModsPrimary");
    expect(instanceHandlersSource).toContain("native.listInstanceMods");
    expect(instanceHandlersSource).toContain("NATIVE_MOD_SCAN_MAX");
    expect(instanceHandlersSource).toContain("allowNativeSyncModScan");
  });

  it("uses native batch downloader in modpack installer path", () => {
    expect(modpackInstallerSource).toContain(
      "downloadModpackFilesNativeBatch",
    );
    expect(modpackInstallerSource).toContain("native.downloadFiles");
  });

  it("checks running state via native isInstanceRunning before JS fallbacks", () => {
    expect(gameProcessSource).toContain("native.isInstanceRunning");
  });

  it("reads latest.log through native tail reader first", () => {
    expect(instanceHandlersSource).toContain("native.readLogTail");
  });
});
