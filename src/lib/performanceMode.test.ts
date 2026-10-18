import { describe, expect, it } from "bun:test";
import { effectiveVisuals } from "./performanceMode";

describe("effectiveVisuals", () => {
  it("keeps full visuals when performance mode is off", () => {
    expect(effectiveVisuals({ performanceMode: false, rainbowMode: true })).toEqual({
      lite: false,
      rainbow: true,
      reducedMotion: "user",
    });
  });

  it("treats a missing flag (older configs) as off", () => {
    expect(effectiveVisuals({ rainbowMode: false }).lite).toBe(false);
  });

  it("goes lite, forces reduced motion and suspends rainbow when on", () => {
    expect(effectiveVisuals({ performanceMode: true, rainbowMode: true })).toEqual({
      lite: true,
      rainbow: false,
      reducedMotion: "always",
    });
  });
});
