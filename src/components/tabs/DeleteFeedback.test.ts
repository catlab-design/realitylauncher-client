import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const instanceDetailSource = readFileSync(join(import.meta.dir, "InstanceDetail.tsx"), "utf8");
const modsListSource = readFileSync(join(import.meta.dir, "ModPackTabs", "ModsList.tsx"), "utf8");
const contentListSource = readFileSync(join(import.meta.dir, "ModPackTabs", "ContentList.tsx"), "utf8");
const lazyModItemSource = readFileSync(join(import.meta.dir, "ModPackTabs", "LazyModItem.tsx"), "utf8");
const lazyContentItemSource = readFileSync(join(import.meta.dir, "ModPackTabs", "LazyContentItem.tsx"), "utf8");

describe("Delete feedback policy", () => {
  it("does not show delete-result toasts in instance handlers", () => {
    expect(instanceDetailSource).not.toContain("mod_deleted_success");
    expect(instanceDetailSource).not.toContain("resourcepack_deleted_success");
    expect(instanceDetailSource).not.toContain("shader_deleted_success");
    expect(instanceDetailSource).not.toContain("datapack_deleted_success");
    expect(instanceDetailSource).not.toContain("mod_delete_failed");
  });

  it("does not show summary toasts for bulk delete actions", () => {
    expect(modsListSource).not.toContain("toast.success(`${t('action_remove'");
    expect(modsListSource).not.toContain("toast.error(`${t('action_remove'");
    expect(contentListSource).not.toContain("toast.success(`${t('action_remove'");
    expect(contentListSource).not.toContain("toast.error(`${t('action_remove'");
  });

  it("keeps click sound on delete item buttons", () => {
    expect(lazyModItemSource).toContain("playClick(); onDelete(");
    expect(lazyContentItemSource).toContain("playClick(); onDelete(");
  });

  it("keeps click sound on bulk delete actions", () => {
    expect(
      /const handleBulkDelete = async \(\) =>[\s\S]*?if \(confirm\([\s\S]*?playClick\(\);/.test(
        modsListSource,
      ),
    ).toBe(true);
    expect(
      /const handleBulkDelete = async \(\) =>[\s\S]*?if \(confirm\([\s\S]*?playClick\(\);/.test(
        contentListSource,
      ),
    ).toBe(true);
  });
});
