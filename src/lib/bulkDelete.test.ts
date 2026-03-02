import { describe, expect, it } from "bun:test";
import { runBulkDelete } from "./bulkDelete";

describe("runBulkDelete", () => {
  it("forces silent delete mode and reports all-success summary", async () => {
    const optionsSeen: Array<{ silent: boolean }> = [];
    const summary = await runBulkDelete(["a.jar", "b.jar"], async (_item, options) => {
      optionsSeen.push(options);
      return { ok: true };
    });

    expect(optionsSeen).toEqual([{ silent: true }, { silent: true }]);
    expect(summary).toEqual({
      total: 2,
      success: 2,
      failed: 0,
      errors: [],
    });
  });

  it("counts failed operations and collects error messages", async () => {
    const summary = await runBulkDelete(["a", "b", "c"], async (item) => {
      if (item === "a") return { ok: true };
      if (item === "b") return { ok: false, error: "permission denied" };
      throw new Error("disk busy");
    });

    expect(summary.total).toBe(3);
    expect(summary.success).toBe(1);
    expect(summary.failed).toBe(2);
    expect(summary.errors).toEqual(["permission denied", "disk busy"]);
  });
});
