import path from "path";
import crypto from "crypto";

export function redactLaunchArgs(args: string[], accessToken?: string): string[] {
  return args.map((arg, index) => {
    const previous = args[index - 1];
    if (previous === "--accessToken") {
      return "[redacted]";
    }
    if (arg.startsWith("--accessToken=")) {
      return "--accessToken=[redacted]";
    }
    if (accessToken && arg === accessToken) {
      return "[redacted]";
    }
    return arg;
  });
}

export function fixUnreplacedVars(
  arg: string,
  accessToken?: string,
  version?: string,
): string {
  return arg
    .replace(/\$\{auth_xuid\}/g, "0")
    .replace(/\$\{clientid\}/g, "")
    .replace(/\$\{auth_session\}/g, accessToken || "token:0")
    .replace(/\$\{resolution_width\}/g, "854")
    .replace(/\$\{resolution_height\}/g, "480")
    .replace(/\$\{path_separator\}/g, path.delimiter)
    .replace(/\$\{primary_jar_name\}/g, version ? `${version}.jar` : "");
}

export function getOfflineUuid(username: string): string {
  const md5 = crypto
    .createHash("md5")
    .update(`OfflinePlayer:${username}`)
    .digest();
  
  md5[6] = (md5[6] & 0x0f) | 0x30;
  md5[8] = (md5[8] & 0x3f) | 0x80;
  const hex = md5.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function escapeArgfileContent(args: string[]): string {
  return args
    .map((arg) => {
      let escaped = arg.replace(/\\/g, "\\\\");
      if (escaped.includes(" ") && !escaped.startsWith('"')) escaped = `"${escaped}"`;
      return escaped;
    })
    .join("\n");
}
