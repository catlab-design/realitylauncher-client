import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cloudInstancesSource = readFileSync(
  join(import.meta.dir, "cloud-instances.ts"),
  "utf8",
);

describe("cloud sync list-compare cache", () => {
  it("uses Rust native fast-check for mod list signatures", () => {
    expect(cloudInstancesSource).toContain("nativeModule.checkFastModListSync");
    expect(cloudInstancesSource).toContain(
      "nativeModule.saveFastModListSyncSnapshot",
    );
  });

  it("short-circuits sync when manifest revision and mod list signatures match", () => {
    expect(cloudInstancesSource).toContain("Fast list match");
    expect(cloudInstancesSource).toContain("fastCheck.canSkip");
  });
});
