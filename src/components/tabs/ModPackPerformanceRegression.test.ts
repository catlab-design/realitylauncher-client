import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const modPackSource = readFileSync(join(import.meta.dir, "ModPack.tsx"), "utf8");

describe("modpack render performance regressions", () => {
  it("memoizes instance partitions used by the modpack grid", () => {
    expect(modPackSource).toContain("const myModPacks = useMemo(");
    expect(modPackSource).toContain("const serverInstancesByCloudId = useMemo(");
  });

  it("uses a cloud-id lookup map instead of finding through all instances for every server card", () => {
    expect(modPackSource).toContain("serverInstancesByCloudId.get(server.id)");
    expect(modPackSource).not.toContain("instances.find(i => i.cloudId === server.id)");
  });
});
