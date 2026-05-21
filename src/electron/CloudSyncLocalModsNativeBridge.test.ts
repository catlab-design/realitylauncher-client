import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cloudSyncUtilsSource = readFileSync(
  join(import.meta.dir, "cloud-sync-utils.ts"),
  "utf8",
);

describe("cloud sync local mods native bridge", () => {
  it("uses Rust local mod signature before the JS filesystem fallback", () => {
    expect(cloudSyncUtilsSource).toContain(
      "tryBuildLocalModsListSignatureNative",
    );
    expect(cloudSyncUtilsSource).toContain(
      "buildLocalModsListSignatureNative",
    );
  });

  it("keeps the JS fallback aligned with Rust case-insensitive jar matching", () => {
    expect(cloudSyncUtilsSource).toContain(
      '.map((file) => file.replace(/\\\\/g, "/").trim().toLowerCase())',
    );
    expect(cloudSyncUtilsSource).toContain(
      '.filter((file) => file.endsWith(".jar") || file.endsWith(".jar.disabled"))',
    );
  });
});
