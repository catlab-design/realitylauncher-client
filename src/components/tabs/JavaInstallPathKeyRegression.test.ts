import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const modPackSource = readFileSync(join(import.meta.dir, "ModPack.tsx"), "utf8");
const serverMenuSource = readFileSync(join(import.meta.dir, "ServerMenu.tsx"), "utf8");

describe("Java install path key regressions", () => {
  it("stores Java 25 installs in the java25 config slot from modpack play prompts", () => {
    expect(modPackSource).toContain('requiredVersion >= 25');
    expect(modPackSource).toContain('? "java25"');
    expect(modPackSource).not.toContain('requiredVersion >= 21 ? "java21" : "java17"');
  });

  it("stores Java 25 installs in the java25 config slot from server play prompts", () => {
    expect(serverMenuSource).toContain('requiredVersion >= 25');
    expect(serverMenuSource).toContain('? "java25"');
    expect(serverMenuSource).not.toContain('requiredVersion >= 21 ? "java21" : "java17"');
  });
});
