import { describe, expect, it } from "bun:test";
import { nextMountedTabs } from "./tabKeepAlive";

describe("nextMountedTabs", () => {
  it("mounts a keep-alive tab on first visit", () => {
    expect(nextMountedTabs([], "modpack")).toEqual(["modpack"]);
  });

  it("returns the same array for tabs that are not kept alive", () => {
    const mounted = ["modpack"];
    expect(nextMountedTabs(mounted, "home")).toBe(mounted);
  });

  it("appends a second keep-alive tab", () => {
    expect(nextMountedTabs(["modpack"], "explore")).toEqual(["modpack", "explore"]);
  });

  it("returns the same array when the tab is already mounted", () => {
    const mounted = ["modpack"];
    expect(nextMountedTabs(mounted, "modpack")).toBe(mounted);
  });
});
