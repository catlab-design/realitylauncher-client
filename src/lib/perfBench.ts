import { perfProbe } from "./perfProbe";
import { useUiStore } from "../store/uiStore";
import { useProgressStore } from "../store/progressStore";

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

// Rainbow accent must cycle from CSS alone, and freeze while the page is marked hidden.
async function checkRainbowCss(): Promise<Record<string, boolean>> {
  const root = document.documentElement;
  const accent = () => getComputedStyle(root).getPropertyValue("--secondary-color").trim();
  const wasRainbow = root.hasAttribute("data-rainbow");
  const before = accent();
  root.toggleAttribute("data-rainbow", true);
  await wait(50);
  const a = accent();
  await wait(400);
  const b = accent();
  root.toggleAttribute("data-hidden", true);
  await wait(50);
  const c = accent();
  await wait(400);
  const d = accent();
  root.toggleAttribute("data-hidden", document.hidden);
  root.toggleAttribute("data-rainbow", wasRainbow);
  await wait(50);
  return {
    rainbowCycles: a !== b,
    rainbowPausesWhenHidden: c === d,
    rainbowOffRestoresAccent: accent() === before,
  };
}

async function runBench() {
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

  const checks = { installToastLive: await checkInstallToastLive(), ...(await checkKeepAlive()), ...(await checkRainbowCss()) };
  await window.api?.devPerfReport({ ...perfProbe.report(), checks });
  if (import.meta.env.VITE_PERF_BENCH_EXIT === "1") await window.api?.windowClose();
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
    await runBench();
  })();
}
