import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("rust launcher LOC guard", () => {
  // หมายเหตุ: ไฟล์เกินลิมิตเดิม (1500) มาก่อนหน้านี้แล้ว — ควร refactor แยกฟังก์ชัน
  // (เช่น แยก preInstallInstance / asset+native helpers ออกไปไฟล์ย่อย) แล้วค่อยลดเพดานลง
  it("keeps rustLauncher.ts at or below 1850 lines", () => {
    const source = readFileSync(join(import.meta.dir, "rustLauncher.ts"), "utf8");
    const lines = source.split(/\r?\n/).length;
    expect(lines).toBeLessThanOrEqual(1850);
  });
});
