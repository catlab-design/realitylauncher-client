import { describe, expect, it } from "bun:test";
import {
  getLaunchPolicyForInstance,
  isSyncLaunchProgressType,
  shouldShowLaunchSpinner,
  shouldShowStopButton,
  shouldRevealServerSyncLoading,
} from "./launchPolicy";

describe("getLaunchPolicyForInstance", () => {
  it("treats empty cloudId as local modpack", () => {
    const policy = getLaunchPolicyForInstance({ cloudId: "   " });

    expect(policy.isServerBacked).toBe(false);
    expect(policy.launchOptions.skipServerModSync).toBe(true);
    expect(policy.suppressInstallProgressModal).toBe(true);
  });

  it("treats cloudId as server modpack", () => {
    const policy = getLaunchPolicyForInstance({ cloudId: "server-123" });

    expect(policy.isServerBacked).toBe(true);
    expect(policy.launchOptions.skipServerModSync).toBe(false);
    expect(policy.suppressInstallProgressModal).toBe(false);
  });
});

describe("isSyncLaunchProgressType", () => {
  it("returns true for sync progress events", () => {
    expect(isSyncLaunchProgressType("sync-start")).toBe(true);
    expect(isSyncLaunchProgressType("sync-download")).toBe(true);
    expect(isSyncLaunchProgressType("sync-complete")).toBe(true);
  });

  it("returns false for non-sync launch events", () => {
    expect(isSyncLaunchProgressType("extract")).toBe(false);
    expect(isSyncLaunchProgressType("download")).toBe(false);
    expect(isSyncLaunchProgressType(undefined)).toBe(false);
  });
});

describe("shouldRevealServerSyncLoading", () => {
  it("does not reveal loading during sync checks", () => {
    expect(shouldRevealServerSyncLoading({ type: "sync-start" })).toBe(false);
    expect(shouldRevealServerSyncLoading({ type: "sync-check" })).toBe(false);
    expect(shouldRevealServerSyncLoading({ type: "sync-clean" })).toBe(false);
  });

  it("reveals loading only when there are files to download", () => {
    expect(
      shouldRevealServerSyncLoading({
        type: "sync-download",
        current: 0,
        total: 0,
        percent: 0,
      }),
    ).toBe(false);

    expect(
      shouldRevealServerSyncLoading({
        type: "sync-download",
        current: 0,
        total: 3,
        percent: 0,
      }),
    ).toBe(true);
  });
});

describe("launch button state", () => {
  it("shows stop button immediately when launching starts", () => {
    expect(shouldShowStopButton(true, false)).toBe(true);
  });

  it("shows stop button while playing", () => {
    expect(shouldShowStopButton(false, true)).toBe(true);
  });

  it("shows play button only when not launching and not playing", () => {
    expect(shouldShowStopButton(false, false)).toBe(false);
  });

  it("shows spinner only during launching phase", () => {
    expect(shouldShowLaunchSpinner(true, false)).toBe(true);
    expect(shouldShowLaunchSpinner(false, true)).toBe(false);
    expect(shouldShowLaunchSpinner(false, false)).toBe(false);
  });
});
