import { perfProbe } from "./perfProbe";
import { useUiStore } from "../store/uiStore";
import { useProgressStore } from "../store/progressStore";
import { useConfigStore } from "../store/configStore";

type BenchTab = "home" | "servers" | "modpack" | "explore" | "wardrobe" | "about" | "settings";

const TAB_CYCLE: BenchTab[] = ["home", "servers", "modpack", "explore", "wardrobe", "home"];
const TAB_DWELL_MS = 600;
const SCROLL_SETTLE_MS = 1500;
const SCROLL_STEPS = 40;
const PROGRESS_TICK_MS = 120;
const PROGRESS_TICKS = 25;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function setTab(tab: string) {
  useUiStore.getState().setActiveTab(tab);
}

async function waitForMain(): Promise<HTMLElement> {
  for (;;) {
    const main = document.querySelector<HTMLElement>("main");
    if (main) return main;
    await wait(250);
  }
}

async function scrollThrough(tab: BenchTab) {
  setTab(tab);
  await wait(SCROLL_SETTLE_MS);
  const main = await waitForMain();
  const max = main.scrollHeight - main.clientHeight;
  for (let i = 1; i <= SCROLL_STEPS; i++) {
    main.scrollTop = (max * i) / SCROLL_STEPS;
    await nextFrame();
  }
  for (let i = SCROLL_STEPS - 1; i >= 0; i--) {
    main.scrollTop = (max * i) / SCROLL_STEPS;
    await nextFrame();
  }
}

// The progress toast must keep showing fresh values without its parent re-rendering.
async function checkInstallToastLive(): Promise<boolean> {
  const { setInstalling, setInstallProgress } = useProgressStore.getState();
  setInstalling(true);
  setInstallProgress({ percent: 10, message: "bench-toast-a" });
  await wait(500);
  const sawFirst = document.body.innerText.includes("bench-toast-a");
  setInstallProgress({ percent: 60, message: "bench-toast-b" });
  await wait(500);
  const sawSecond = document.body.innerText.includes("bench-toast-b");
  setInstallProgress(null);
  setInstalling(false);
  return sawFirst && sawSecond;
}

// Hidden kept-alive tabs must not leave shell layout flags set, and must not remount on return.
async function checkKeepAlive(): Promise<Record<string, boolean>> {
  const shell = () => {
    const { fullBleed, immersive } = useUiStore.getState();
    return { fullBleed, immersive };
  };
  const goto = async (tab: BenchTab) => {
    setTab(tab);
    await wait(TAB_DWELL_MS);
  };

  await goto("modpack");
  const modpackMounts = perfProbe.mountCount("modpack");
  await goto("about");
  const aboutAfterModpack = shell();
  await goto("explore");
  await goto("about");
  const aboutAfterExplore = shell();
  await goto("modpack");
  const modpackRemounted = perfProbe.mountCount("modpack") !== modpackMounts;
  const modpackOwnLayout = shell();
  await goto("settings");
  setTab(useUiStore.getState().lastContentTab);
  await wait(TAB_DWELL_MS);
  const afterSettings = shell();
  await goto("home");

  return {
    hiddenModpackClearsLayout: !aboutAfterModpack.fullBleed && !aboutAfterModpack.immersive,
    hiddenExploreClearsLayout: !aboutAfterExplore.fullBleed && !aboutAfterExplore.immersive,
    modpackNotRemounted: !modpackRemounted,
    settingsRoundTripKeepsLayout: afterSettings.fullBleed === modpackOwnLayout.fullBleed,
  };
}

// Coming back to a kept-alive tab must refetch its instance list (read-only call, counted).
async function checkReloadOnReturn(): Promise<Record<string, boolean>> {
  const api = window.api;
  const original = api?.instancesList;
  if (!api || !original) return { modpackReloadsOnReturn: false, exploreReloadsOnReturn: false };
  let calls = 0;
  api.instancesList = ((...args: Parameters<typeof original>) => {
    calls += 1;
    return original(...args);
  }) as typeof original;
  const goto = async (tab: string) => {
    setTab(tab);
    await wait(TAB_DWELL_MS);
  };
  try {
    await goto("modpack");
    await goto("about");
    calls = 0;
    await goto("modpack");
    const modpackReloadsOnReturn = calls > 0;
    await goto("explore");
    await goto("about");
    calls = 0;
    await goto("explore");
    const exploreReloadsOnReturn = calls > 0;
    await goto("home");
    return { modpackReloadsOnReturn, exploreReloadsOnReturn };
  } finally {
    api.instancesList = original;
  }
}

// Rainbow must cycle and turning it off must restore the accent; changes/samples per second are
// reported as metrics (each accent change restyles the whole page). Toggled in memory only.
async function checkRainbow(): Promise<Record<string, boolean | number>> {
  const root = document.documentElement;
  const accent = () => getComputedStyle(root).getPropertyValue("--secondary-color").trim();
  const { rainbowMode, setConfig } = useConfigStore.getState();
  const before = accent();
  let changes = 0;
  let samples = 0;
  try {
    setConfig({ rainbowMode: true });
    await wait(200);
    let last = accent();
    const end = performance.now() + 1000;
    while (performance.now() < end) {
      await wait(10);
      samples += 1;
      const now = accent();
      if (now !== last) changes += 1;
      last = now;
    }
  } finally {
    setConfig({ rainbowMode });
  }
  await wait(200);
  return {
    rainbowCycles: changes > 0,
    rainbowOffRestoresAccent: rainbowMode || accent() === before,
    rainbowChangesPerSecond: changes,
    rainbowSamples: samples,
  };
}

// Servers › Explore must load the public server list (read-only GET) and render it.
async function checkPublicServers(): Promise<Record<string, boolean | number>> {
  const originalFetch = window.fetch;
  let requested = false;
  let returnedNames: string[] = [];
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const res = await originalFetch(...args);
    const target = String(args[0] instanceof Request ? args[0].url : args[0]);
    if (target.includes("/instances/public")) {
      requested = true;
      const data = await res.clone().json().catch(() => null);
      const items: Array<{ name?: string }> = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      returnedNames = items.map((i) => i.name ?? "").filter(Boolean);
    }
    return res;
  };
  try {
    setTab("servers");
    await wait(1500);
    const tabs = document.querySelectorAll<HTMLButtonElement>('main [role="tablist"] [role="tab"]');
    tabs[1]?.click();
    await wait(3000);
    const text = document.body.innerText;
    tabs[0]?.click();
    await wait(TAB_DWELL_MS);
    setTab("home");
    await wait(TAB_DWELL_MS);
    return {
      publicServersRequested: requested,
      publicServersShown: returnedNames.some((name) => text.includes(name)),
      publicServersReturned: returnedNames.length,
    };
  } finally {
    window.fetch = originalFetch;
  }
}

// VITE_PERF_LITE=1 measures with Performance mode on (in memory; the saved value is restored).
async function withPerformanceMode(fn: () => Promise<BenchResult>): Promise<BenchResult> {
  const { performanceMode, setConfig } = useConfigStore.getState();
  setConfig({ performanceMode: true });
  await wait(300);
  const liteApplied = document.documentElement.hasAttribute("data-perf-lite");
  try {
    const result = await fn();
    return { ...result, checks: { ...result.checks, liteApplied } };
  } finally {
    setConfig({ performanceMode });
    await wait(300);
  }
}

type BenchResult = ReturnType<typeof perfProbe.report> & { checks: Record<string, boolean | number> };

async function runBench(): Promise<BenchResult> {
  await perfProbe.runPhase("tab-cycle", async () => {
    for (let round = 0; round < 3; round++) {
      for (const tab of TAB_CYCLE) {
        setTab(tab);
        await wait(TAB_DWELL_MS);
      }
    }
  });

  await perfProbe.runPhase("scroll-explore", () => scrollThrough("explore"));
  await perfProbe.runPhase("scroll-servers", () => scrollThrough("servers"));

  setTab("home");
  await wait(TAB_DWELL_MS);
  await perfProbe.runPhase("progress-burst", async () => {
    const { setInstallProgress } = useProgressStore.getState();
    for (let i = 1; i <= PROGRESS_TICKS; i++) {
      setInstallProgress({ type: "progress", stage: "download", percent: (i / PROGRESS_TICKS) * 100, current: i, total: PROGRESS_TICKS, message: "bench" });
      await wait(PROGRESS_TICK_MS);
    }
    setInstallProgress(null);
  });

  const checks = { installToastLive: await checkInstallToastLive(), ...(await checkKeepAlive()), ...(await checkRainbow()), ...(await checkReloadOnReturn()), ...(await checkPublicServers()) };
  return { ...perfProbe.report(), checks };
}

// Attribution runs: strip one class of paint cost app-wide to see what it was worth.
const EXPERIMENT_CSS: Record<string, string> = {
  noblur: "*, *::before, *::after { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; filter: none !important; }",
  notitleblur: "header[data-tauri-drag-region] { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }",
  titleblurmd: "header[data-tauri-drag-region] { backdrop-filter: blur(12px) !important; -webkit-backdrop-filter: blur(12px) !important; }",
  noanim: "*, *::before, *::after { animation-play-state: paused !important; animation: none !important; }",
};

function applyExperiment() {
  const css = EXPERIMENT_CSS[import.meta.env.VITE_PERF_EXPERIMENT ?? ""];
  if (!css) return;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}

export function scheduleBench(): void {
  applyExperiment();
  void (async () => {
    await waitForMain();
    await wait(3000);
    const lite = import.meta.env.VITE_PERF_LITE === "1";
    const result = lite ? await withPerformanceMode(runBench) : await runBench();
    const restored = !lite || !document.documentElement.hasAttribute("data-perf-lite");
    await window.api?.devPerfReport({ ...result, checks: { ...result.checks, ...(lite ? { liteRestored: restored } : {}) } });
    if (import.meta.env.VITE_PERF_BENCH_EXIT === "1") await window.api?.windowClose();
  })();
}
