import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const useInstancesSource = readFileSync(
  join(import.meta.dir, "useInstances.ts"),
  "utf8",
);

describe("useInstances performance regressions", () => {
  it("does not stringify selected instances while syncing fresh data", () => {
    expect(useInstancesSource).toContain("isSameInstanceSnapshot");
    expect(useInstancesSource).not.toContain("JSON.stringify(fresh)");
    expect(useInstancesSource).not.toContain("JSON.stringify(selectedInstance)");
  });

  it("limits running-status IPC checks instead of launching one call per instance", () => {
    expect(useInstancesSource).toContain("RUNNING_STATUS_CHECK_CONCURRENCY");
    expect(useInstancesSource).toContain("syncRunningInstanceIds");
    expect(useInstancesSource).toContain("while (cursor < instances.length)");
    expect(useInstancesSource).not.toContain("instances.map(async");
  });

  it("does not reload joined servers just because the joined server count changed", () => {
    expect(useInstancesSource).toContain("hasLoadedJoinedServersRef");
    expect(useInstancesSource).not.toContain("joinedServers.length");
  });
});
