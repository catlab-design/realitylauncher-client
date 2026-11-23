import { describe, expect, it } from "bun:test";
import { canApplyOffer, showMenuHint } from "./hotswapOffer";

describe("hotswap offer toast logic", () => {
  it("enables Apply for any offer with live changes, independent of any game status file", () => {
    expect(canApplyOffer({ liveCount: 2 })).toBe(true);
    expect(canApplyOffer({ liveCount: 0 })).toBe(false);
    expect(canApplyOffer({ liveCount: 1, revoked: true })).toBe(false);
  });

  it("hints at the main menu only when an Apply was parked by the agent", () => {
    expect(showMenuHint(true, "busy-in-world")).toBe(true);
    expect(showMenuHint(false, "busy-in-world")).toBe(false);
    expect(showMenuHint(true, "applying")).toBe(false);
    expect(showMenuHint(true, null)).toBe(false);
  });
});
