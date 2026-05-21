import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const modPackSource = readFileSync(join(import.meta.dir, "ModPack.tsx"), "utf8");

describe("modpack delete dialog", () => {
  it("closes the confirmation dialog when delete is confirmed", () => {
    expect(modPackSource).toContain("setDeleteConfirmId(null);\n                                handleDelete(id);");
    expect(modPackSource).not.toContain("onConfirm={handleDelete}");
  });
});
