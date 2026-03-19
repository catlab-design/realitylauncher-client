import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const modPackSource = readFileSync(join(import.meta.dir, "ModPack.tsx"), "utf8");
const instanceDetailSource = readFileSync(
  join(import.meta.dir, "InstanceDetail.tsx"),
  "utf8",
);

describe("modpack install lock", () => {
  it("locks play only for the instance that is currently installing", () => {
    expect(modPackSource).toContain("isInstanceInstallLocked");
    expect(modPackSource).toContain(
      "const isInstallingThisInstance = isInstanceInstallLocked(",
    );
    expect(modPackSource).toContain(
      "const isInstallingThisServerInstance = isInstanceInstallLocked(",
    );
    expect(modPackSource).toContain(
      "disabled={disablePlayButton || isInstallingThisInstance}",
    );
    expect(modPackSource).toContain("disabled={isInstallingThisServerInstance}");
  });

  it("shows installing copy only on the active server install target", () => {
    expect(modPackSource).toContain(
      "const isInstallingThisServerCard = isInstallTargetActive(",
    );
    expect(modPackSource).toContain(
      "isInstallingThisServerCard ? t('installing_modpack') : t('install')",
    );
  });

  it("prevents launching from instance detail while that instance is installing", () => {
    expect(instanceDetailSource).toContain("isInstallLocked?: boolean");
    expect(instanceDetailSource).toContain(
      "disabled={disablePlayStopButton || isInstallLocked}",
    );
  });
});
