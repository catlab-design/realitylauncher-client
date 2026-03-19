import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cloudInstancesSource = readFileSync(
  join(import.meta.dir, "cloud-instances.ts"),
  "utf8",
);
const cloudSyncUtilsSource = readFileSync(
  join(import.meta.dir, "cloud-sync-utils.ts"),
  "utf8",
);
const instanceModHandlersSource = readFileSync(
  join(import.meta.dir, "ipc", "instance-mod-handlers.ts"),
  "utf8",
);
const instancePackHandlersSource = readFileSync(
  join(import.meta.dir, "ipc", "instance-pack-handlers.ts"),
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
    expect(cloudSyncUtilsSource).toContain("nativeModule.downloadFiles");
  });

  it("uses native mod list as primary source before JS enrichment", () => {
    expect(instanceModHandlersSource).toContain("nativeModsPrimary");
    expect(instanceModHandlersSource).toContain("native.listInstanceMods");
    expect(instanceModHandlersSource).toContain("NATIVE_MOD_SCAN_MAX");
    expect(instanceModHandlersSource).toContain("allowNativeSyncModScan");
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
    expect(instancePackHandlersSource).toContain("native.readLogTail");
  });
});
