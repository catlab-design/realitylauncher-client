import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

type Handler = (...args: any[]) => Promise<any>;

function getModCacheKey(filepath: string, size: number, mtime: string): string {
  const cleanPath = filepath.endsWith(".disabled")
    ? filepath.slice(0, -".disabled".length)
    : filepath;
  return `${cleanPath}|${size}|${mtime}`;
}

function createIpcMainMock() {
  const handlers = new Map<string, Handler>();
  return {
    handlers,
    handle(channel: string, listener: Handler) {
      handlers.set(channel, listener);
    },
  };
}

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("instance mod icon regressions", () => {
  it("returns updated icon metadata even when the mods directory mtime is unchanged", async () => {
    mock.module("electron", () => ({
      BrowserWindow: {
        getAllWindows: () => [],
      },
    }));

    const { registerInstanceModHandlers } = await import("./instance-mod-handlers");

    const root = mkdtempSync(join(tmpdir(), "ml-client-mod-icons-"));
    tempDirs.push(root);

    const modsDir = join(root, "mods");
    mkdirSync(modsDir, { recursive: true });

    const filename = "example-mod.jar";
    const filePath = join(modsDir, filename);
    writeFileSync(filePath, "jar-content");

    const modFileStats = statSync(filePath);
    const modMtime = modFileStats.mtime.toISOString();
    const cacheKey = getModCacheKey(filePath, modFileStats.size, modMtime);

    const ipcMain = createIpcMainMock();
    const modMetadataCache = new Map<string, Record<string, unknown>>([
      [
        cacheKey,
        {
          displayName: "Example Mod",
          icon: undefined,
        },
      ],
    ]);

    registerInstanceModHandlers({
      ipcMain: ipcMain as any,
      logger: {
        info() {},
        warn() {},
      },
      getInstance: () => ({ gameDirectory: root }),
      getInstancesDir: () => root,
      getNativeModule: () => ({}),
      modMetadataCache: modMetadataCache as any,
      pendingModrinthLookups: new Set<string>(),
      ensureModMetadata: async () => ({}),
      getModCacheKey,
      saveMetadataCache: () => {},
      updateInstance: () => {},
      activeOperations: new Map(),
      createThrottledProgressSender: () => () => {},
      refreshMicrosoftTokenIfNeeded: async () => ({ ok: true, session: null }),
      getSession: () => null,
    });

    const listMods = ipcMain.handlers.get("instance-list-mods");
    expect(listMods).toBeDefined();

    const firstResult = await listMods?.({}, "instance-1");
    expect(firstResult?.ok).toBe(true);
    expect(firstResult?.mods).toHaveLength(1);
    expect(firstResult?.mods[0]?.icon).toBeNull();

    modMetadataCache.set(cacheKey, {
      displayName: "Example Mod",
      icon: "https://cdn.example.com/example-mod.png",
      modrinthId: "found",
    });

    const secondResult = await listMods?.({}, "instance-1");
    expect(secondResult?.ok).toBe(true);
    expect(secondResult?.mods[0]?.icon).toBe(
      "https://cdn.example.com/example-mod.png",
    );
  });

  it("still schedules metadata enrichment when a mod has local version info but no icon yet", async () => {
    mock.module("electron", () => ({
      BrowserWindow: {
        getAllWindows: () => [],
      },
    }));

    const { registerInstanceModHandlers } = await import("./instance-mod-handlers");

    const root = mkdtempSync(join(tmpdir(), "ml-client-mod-icons-"));
    tempDirs.push(root);

    const modsDir = join(root, "mods");
    mkdirSync(modsDir, { recursive: true });

    const filename = "configured-mod.jar";
    const filePath = join(modsDir, filename);
    writeFileSync(filePath, "jar-content");

    const modFileStats = statSync(filePath);
    const modMtime = modFileStats.mtime.toISOString();
    const cacheKey = getModCacheKey(filePath, modFileStats.size, modMtime);

    const ipcMain = createIpcMainMock();
    const modMetadataCache = new Map<string, Record<string, unknown>>([
      [
        cacheKey,
        {
          displayName: "Configured Mod",
          version: "1.2.3",
          icon: undefined,
        },
      ],
    ]);

    let ensureCalls = 0;

    registerInstanceModHandlers({
      ipcMain: ipcMain as any,
      logger: {
        info() {},
        warn() {},
      },
      getInstance: () => ({ gameDirectory: root }),
      getInstancesDir: () => root,
      getNativeModule: () => ({}),
      modMetadataCache: modMetadataCache as any,
      pendingModrinthLookups: new Set<string>(),
      ensureModMetadata: async () => {
        ensureCalls += 1;
        return {};
      },
      getModCacheKey,
      saveMetadataCache: () => {},
      updateInstance: () => {},
      activeOperations: new Map(),
      createThrottledProgressSender: () => () => {},
      refreshMicrosoftTokenIfNeeded: async () => ({ ok: true, session: null }),
      getSession: () => null,
    });

    const listMods = ipcMain.handlers.get("instance-list-mods");
    expect(listMods).toBeDefined();

    const result = await listMods?.({}, "instance-1");
    expect(result?.ok).toBe(true);
    expect(result?.mods[0]?.version).toBe("1.2.3");
    expect(ensureCalls).toBe(1);
  });

  it("continues scheduling later metadata batches on cache-hit refreshes for large mod lists", async () => {
    mock.module("electron", () => ({
      BrowserWindow: {
        getAllWindows: () => [],
      },
    }));

    const { registerInstanceModHandlers } = await import("./instance-mod-handlers");

    const root = mkdtempSync(join(tmpdir(), "ml-client-mod-icons-"));
    tempDirs.push(root);

    const modsDir = join(root, "mods");
    mkdirSync(modsDir, { recursive: true });
    const filePaths: string[] = [];

    for (let i = 0; i < 12; i += 1) {
      const filePath = join(modsDir, `batch-mod-${i}.jar`);
      filePaths.push(filePath);
      writeFileSync(filePath, `jar-${i}`);
    }

    const ipcMain = createIpcMainMock();
    const modMetadataCache = new Map<string, Record<string, unknown>>();
    let ensureCalls = 0;

    registerInstanceModHandlers({
      ipcMain: ipcMain as any,
      logger: {
        info() {},
        warn() {},
      },
      getInstance: () => ({ gameDirectory: root }),
      getInstancesDir: () => root,
      getNativeModule: () => ({}),
      modMetadataCache: modMetadataCache as any,
      pendingModrinthLookups: new Set<string>(),
      ensureModMetadata: async (filePath, _instanceId, size, mtime) => {
        ensureCalls += 1;
        const cacheKey = getModCacheKey(filePath, size!, mtime!);
        modMetadataCache.set(cacheKey, {
          displayName: filePath.split("\\").pop()?.replace(".jar", ""),
          modrinthId: "checked_missing",
        });
        return {};
      },
      getModCacheKey,
      saveMetadataCache: () => {},
      updateInstance: () => {},
      activeOperations: new Map(),
      createThrottledProgressSender: () => () => {},
      refreshMicrosoftTokenIfNeeded: async () => ({ ok: true, session: null }),
      getSession: () => null,
    });

    const listMods = ipcMain.handlers.get("instance-list-mods");
    expect(listMods).toBeDefined();

    const firstResult = await listMods?.({}, "instance-1");
    expect(firstResult?.ok).toBe(true);
    expect(ensureCalls).toBe(10);

    const secondResult = await listMods?.({}, "instance-1");
    expect(secondResult?.ok).toBe(true);
    expect(ensureCalls).toBe(12);
  });

  it("hydrates the first visible unknown-version mods immediately when filename fallback cannot determine a version", async () => {
    mock.module("electron", () => ({
      BrowserWindow: {
        getAllWindows: () => [],
      },
    }));

    const { registerInstanceModHandlers } = await import("./instance-mod-handlers");

    const root = mkdtempSync(join(tmpdir(), "ml-client-mod-icons-"));
    tempDirs.push(root);

    const modsDir = join(root, "mods");
    mkdirSync(modsDir, { recursive: true });

    const filename = "Ascendoflife.jar";
    const filePath = join(modsDir, filename);
    writeFileSync(filePath, "jar-content");

    let ensureCalls = 0;

    const ipcMain = createIpcMainMock();
    registerInstanceModHandlers({
      ipcMain: ipcMain as any,
      logger: {
        info() {},
        warn() {},
      },
      getInstance: () => ({ gameDirectory: root }),
      getInstancesDir: () => root,
      getNativeModule: () => ({}),
      modMetadataCache: new Map() as any,
      pendingModrinthLookups: new Set<string>(),
      ensureModMetadata: async () => {
        ensureCalls += 1;
        return {
          displayName: "Ascendoflife",
          version: "1.0.0",
        };
      },
      getModCacheKey,
      saveMetadataCache: () => {},
      updateInstance: () => {},
      activeOperations: new Map(),
      createThrottledProgressSender: () => () => {},
      refreshMicrosoftTokenIfNeeded: async () => ({ ok: true, session: null }),
      getSession: () => null,
    });

    const listMods = ipcMain.handlers.get("instance-list-mods");
    expect(listMods).toBeDefined();

    const result = await listMods?.({}, "instance-1");
    expect(result?.ok).toBe(true);
    expect(ensureCalls).toBe(1);
    expect(result?.mods[0]?.version).toBe("1.0.0");
  });
});
