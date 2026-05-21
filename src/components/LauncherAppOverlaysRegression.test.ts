import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const overlaysSource = readFileSync(
  join(import.meta.dir, "LauncherAppOverlays.tsx"),
  "utf8",
);
const microsoftLoginFlowSource = readFileSync(
  join(import.meta.dir, "..", "lib", "microsoftLoginFlow.ts"),
  "utf8",
);

describe("LauncherAppOverlays auth flow", () => {
  it("does not close the login dialog before Microsoft auth starts successfully", () => {
    expect(
      overlaysSource.match(
        /onMicrosoftLogin=\{async \(\) => \{\s*setLoginDialogOpen\(false\);/,
      ),
    ).toBeNull();
  });

  it("can reopen the login dialog when Microsoft auth setup fails", () => {
    expect(microsoftLoginFlowSource).toContain("setLoginDialogOpen(true);");
  });
});
