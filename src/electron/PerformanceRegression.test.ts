import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const preloadSource = readFileSync(
  join(import.meta.dir, "preload.ts"),
  "utf8",
);
const configSource = readFileSync(
  join(import.meta.dir, "config.ts"),
  "utf8",
);
const mainSource = readFileSync(
  join(import.meta.dir, "main.ts"),
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
const launcherAppSource = readFileSync(
  join(import.meta.dir, "..", "components", "LauncherApp.tsx"),
  "utf8",
);
const instanceDetailSource = readFileSync(
  join(import.meta.dir, "..", "components", "tabs", "InstanceDetail.tsx"),
  "utf8",
);
const nativeInstanceSource = readFileSync(
  join(import.meta.dir, "..", "..", "native", "src", "instance", "mod.rs"),
  "utf8",
);

describe("performance regressions", () => {
  it("uses longer lived instances cache with explicit invalidation", () => {
    expect(preloadSource).toContain("invalidateInstancesListCache");
    expect(preloadSource).not.toContain("const INSTANCES_CACHE_MS = 500");
  });

  it("does not synchronously write config on every set-config call", () => {
    expect(configSource).not.toContain("fs.writeFileSync(configPath");
  });

  it("does not synchronously read latest.log for tail reads", () => {
    expect(instancePackHandlersSource).not.toContain(
      "const content = fs.readFileSync(logPath, \"utf-8\")",
    );
  });

  it("does not keep hidden heavy tabs mounted with display toggles", () => {
    expect(launcherAppSource).not.toContain(
      "display: activeTab === \"modpack\" ? \"block\" : \"none\"",
    );
    expect(launcherAppSource).not.toContain(
      "display: activeTab === \"wardrobe\" ? \"block\" : \"none\"",
    );
  });

  it("guards hardware acceleration disable behind an opt-in flag", () => {
    expect(mainSource).toContain("ML_DISABLE_HARDWARE_ACCELERATION");
    expect(mainSource).not.toContain("app.disableHardwareAcceleration();");
  });

  it("does not base64-encode every instance icon while listing instances", () => {
    expect(nativeInstanceSource).not.toContain(
      "general_purpose::STANDARD.encode(data)",
    );
  });

  it("throttles mod metadata hydration for large mod lists", () => {
    expect(instanceModHandlersSource).toContain(
      "const LOOKUP_BATCH_PER_CALL = modEntries.length > 120 ? 4 : 10",
    );
    expect(instanceDetailSource).toContain(
      "const MAX_RETRIES = result.mods.length > 120 ? 8 : 20",
    );
    expect(instanceDetailSource).toContain(
      "const retryDelay = result.mods.length > 120 ? 1800 : 600",
    );
  });
});
