import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";


const apiSource = readFileSync(join(import.meta.dir, "api.ts"), "utf8");
const rustDir = join(import.meta.dir, "..", "src-tauri", "src");

function invokedCommands(src: string): Set<string> {
  const names = new Set<string>();
  const re = /invoke(?:<[^>]*>)?\(\s*'([a-z_]+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) names.add(m[1]);
  return names;
}

function rustCommands(dir: string): Set<string> {
  const names = new Set<string>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".rs")) continue;
    const src = readFileSync(join(dir, file), "utf8");
    const re = /#\[tauri::command\][\s\S]*?fn\s+([a-z_]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) names.add(m[1]);
  }
  return names;
}

describe("Tauri IPC bridge", () => {
  const invoked = invokedCommands(apiSource);
  const rust = rustCommands(rustDir);

  it("finds the expected commands on both sides", () => {
    expect(invoked.size).toBeGreaterThan(15);
    expect(rust.has("start_device_code_auth")).toBe(true);
    expect(rust.has("curseforge_search")).toBe(true);
    expect(rust.has("discord_rpc_set_enabled")).toBe(true);
  });

  it("every invoke() target is a real Rust #[tauri::command]", () => {
    const missing = [...invoked].filter((name) => !rust.has(name));
    expect(missing).toEqual([]);
  });

  it("does not invoke the non-existent 'auth_login' (regression)", () => {
    expect(invoked.has("auth_login")).toBe(false);
  });

  it("successfully mapped formerly unported features directly to Rust commands", () => {
    expect(invoked.has("curseforge_search")).toBe(true);
    expect(invoked.has("discord_rpc_set_enabled")).toBe(true);
    expect(invoked.has("browse_directory")).toBe(true);
    expect(invoked.has("browse_modpack")).toBe(true);
    expect(invoked.has("notifications_fetch_user")).toBe(true);
  });
});


const KNOWN_UNPORTED = new Set<string>([
  "fetchInstanceAgendas",
  "fetchAllAgendas",
]);

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.tsx?$/.test(name) && !name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

function definedApiMethods(src: string): Set<string> {
  const names = new Set<string>();
  const re = /^\s+([A-Za-z][A-Za-z0-9]*)\s*:\s*(?:\(|async)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) names.add(m[1]);
  return names;
}


const CALL_PATTERNS = [
  /(?:window\.api|windowApi)\??\.\s*([A-Za-z][A-Za-z0-9]*)/g,
  /\(window as any\)\.api\??\.\s*([A-Za-z][A-Za-z0-9]*)/g,
  /\(window\.api as any\)\??\.\s*([A-Za-z][A-Za-z0-9]*)/g,
];

function calledApiMethods(srcDir: string): Set<string> {
  const names = new Set<string>();
  for (const file of listSourceFiles(srcDir)) {
    const src = readFileSync(file, "utf8");
    for (const re of CALL_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) names.add(m[1]);
    }
  }
  return names;
}

describe("window.api surface", () => {
  const defined = definedApiMethods(apiSource);
  const called = calledApiMethods(import.meta.dir);

  it("every window.api.X call is defined, an on* listener, or a known gap", () => {
    const undefinedCalls = [...called].filter(
      (name) => !defined.has(name) && !/^on[A-Z]/.test(name) && !KNOWN_UNPORTED.has(name),
    );
    expect(undefinedCalls).toEqual([]);
  });

  it("the allowlist has no stale entries that are now implemented", () => {
    const stale = [...KNOWN_UNPORTED].filter((name) => defined.has(name));
    expect(stale).toEqual([]);
  });
});
