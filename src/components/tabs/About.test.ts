import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const aboutSource = readFileSync(join(import.meta.dir, "About.tsx"), "utf8");

describe("About tab", () => {
  it("shows Discord icon with invite link", () => {
    expect(aboutSource).toContain("Icons.Discord");
    expect(aboutSource).toContain("https://discord.com/invite/PewhYEehFQ");
  });
});
