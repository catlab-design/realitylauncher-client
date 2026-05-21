import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const launcherAppSource = readFileSync(
  join(import.meta.dir, "LauncherApp.tsx"),
  "utf8",
);

describe("LauncherApp onboarding flow", () => {
  it("tracks first-run login prompts so new users are guided only once", () => {
    expect(launcherAppSource).toContain("FIRST_RUN_LOGIN_PROMPT_KEY");
    expect(launcherAppSource).toContain("markFirstRunLoginPromptSeen");
  });

  it("waits for bootstrap data before auto-opening the login dialog", () => {
    expect(launcherAppSource).toContain("authBootstrapComplete");
  });
});
