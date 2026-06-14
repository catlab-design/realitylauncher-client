import { expect, test, describe } from "bun:test";
import path from "path";
import {
  redactLaunchArgs,
  fixUnreplacedVars,
  getOfflineUuid,
  escapeArgfileContent,
} from "./launchArgs.js";

describe("launchArgs pure helpers", () => {
  test("redactLaunchArgs should redact access tokens", () => {
    const originalArgs = [
      "--username",
      "Player",
      "--accessToken",
      "secret-token-123",
      "--accessToken=secret-token-456",
      "secret-token-123",
      "--version",
      "1.20",
    ];
    const redacted = redactLaunchArgs(originalArgs, "secret-token-123");
    expect(redacted).toEqual([
      "--username",
      "Player",
      "--accessToken",
      "[redacted]",
      "--accessToken=[redacted]",
      "[redacted]",
      "--version",
      "1.20",
    ]);
  });

  test("fixUnreplacedVars should substitute template variables", () => {
    const templates = [
      "session:${auth_session}",
      "client:${clientid}",
      "xuid:${auth_xuid}",
      "w:${resolution_width}",
      "h:${resolution_height}",
      "sep:${path_separator}",
      "jar:${primary_jar_name}",
    ];

    const result = templates.map((t) =>
      fixUnreplacedVars(t, "my-token-789", "1.20.1"),
    );

    expect(result).toEqual([
      "session:my-token-789",
      "client:",
      "xuid:0",
      "w:854",
      "h:480",
      `sep:${path.delimiter}`,
      "jar:1.20.1.jar",
    ]);
  });

  test("getOfflineUuid should generate correct offline UUID", () => {
    const uuid = getOfflineUuid("Player1");
    // Offline UUID is md5 based, check structure and length
    expect(uuid).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
    
    // Check deterministic behaviour
    expect(getOfflineUuid("Player1")).toBe(uuid);
    expect(getOfflineUuid("Player2")).not.toBe(uuid);
  });

  test("escapeArgfileContent should escape backslashes and wrap spaces in quotes", () => {
    const args = [
      "C:\\Program Files\\Java",
      "--gameDir",
      "E:\\My Games",
      "normalArg",
      "\"alreadyWrapped\"",
    ];
    const escaped = escapeArgfileContent(args);
    expect(escaped).toBe(
      `"C:\\\\Program Files\\\\Java"\n` +
      `--gameDir\n` +
      `"E:\\\\My Games"\n` +
      `normalArg\n` +
      `"alreadyWrapped"`,
    );
  });
});
