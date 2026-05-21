import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const serverDetailSource = readFileSync(
  join(import.meta.dir, "ServerDetailView.tsx"),
  "utf8",
);
const utilityHandlersSource = readFileSync(
  join(import.meta.dir, "..", "..", "electron", "ipc", "utility-handlers.ts"),
  "utf8",
);

describe("server detail safety regressions", () => {
  it("filters malformed socials data before rendering buttons", () => {
    expect(serverDetailSource).toContain("parseSocialLinks");
    expect(serverDetailSource).toContain("Array.isArray");
    expect(serverDetailSource).not.toContain("socialLinks = JSON.parse(instance.socials);");
  });

  it("validates external URLs in the renderer before opening them", () => {
    expect(serverDetailSource).toContain("getSafeExternalUrl");
    expect(serverDetailSource).toContain("safeWebsiteUrl");
    expect(serverDetailSource).toContain("window.api?.openExternal");
  });

  it("rejects non-http protocols in the Electron open-external handler", () => {
    expect(utilityHandlersSource).toContain("parseSafeExternalUrl");
    expect(utilityHandlersSource).toContain("parsed.protocol !== \"https:\"");
    expect(utilityHandlersSource).toContain("parsed.protocol !== \"http:\"");
  });
});
