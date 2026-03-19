import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const launcherAppSource = readFileSync(
  join(import.meta.dir, "LauncherApp.tsx"),
  "utf8",
);

const launcherAppShellSource = readFileSync(
  join(import.meta.dir, "LauncherAppShell.tsx"),
  "utf8",
);

const settingsDialogSource = readFileSync(
  join(import.meta.dir, "SettingsDialog.tsx"),
  "utf8",
);

const settingsSource = readFileSync(
  join(import.meta.dir, "tabs", "Settings.tsx"),
  "utf8",
);

describe("settings popup regression", () => {
  it("renders settings as an overlay while preserving the last content tab", () => {
    expect(launcherAppSource).toContain(
      'const settingsDialogOpen = activeTab === "settings";',
    );
    expect(launcherAppSource).toContain(
      'const contentTab = activeTab === "settings" ? lastContentTab : activeTab;',
    );
    expect(launcherAppShellSource).toContain("contentTab");
    expect(launcherAppShellSource).toContain("<SettingsDialog");
    expect(launcherAppShellSource).not.toContain('{activeTab === "settings" && (');
  });

  it("wraps the settings screen in a real dialog shell", () => {
    expect(settingsDialogSource).toContain('role="dialog"');
    expect(settingsDialogSource).toContain('aria-modal="true"');
    expect(settingsDialogSource).toContain('t("close")');
    expect(settingsDialogSource).toContain("<Settings");
  });

  it("keeps the popup in a landscape layout with a dedicated nav rail", () => {
    expect(settingsDialogSource).toContain('max-w-[1520px]');
    expect(settingsDialogSource).toContain('h-[min(80vh,760px)]');
    expect(settingsSource).toContain(
      'md:grid-cols-[240px_minmax(0,1fr)]',
    );
  });

  it("animates the popup shell and settings content transitions", () => {
    expect(settingsDialogSource).toContain("AnimatePresence");
    expect(settingsDialogSource).toContain("motion.div");
    expect(settingsDialogSource).toContain("exit={{ opacity: 0");
    expect(settingsSource).toContain("key={settingsTab}");
    expect(settingsSource).toContain("initial={{ opacity: 0, x: 18 }}");
  });
});
