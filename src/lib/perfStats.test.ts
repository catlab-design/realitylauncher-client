import { describe, expect, it } from "bun:test";
import { rafGapLongTasks, summarizeFrames } from "./perfStats";

describe("summarizeFrames", () => {
  it("counts frames over 20ms as slow and reports nearest-rank p95", () => {
    expect(summarizeFrames([16, 16, 40, 16, 25])).toEqual({ frames: 5, slow: 2, p95: 40 });
  });

  it("returns zeros for no frames", () => {
    expect(summarizeFrames([])).toEqual({ frames: 0, slow: 0, p95: 0 });
  });
});

describe("rafGapLongTasks", () => {
  it("counts gaps of 50ms or more and sums them", () => {
    expect(rafGapLongTasks([16, 60, 16, 120, 49])).toEqual({ count: 2, totalMs: 180 });
  });
});
