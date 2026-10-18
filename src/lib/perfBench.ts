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

function setTab(tab: BenchTab) {
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

  const checks = { installToastLive: await checkInstallToastLive(), ...(await checkKeepAlive()) };
  await window.api?.devPerfReport({ ...perfProbe.report(), checks });
  if (import.meta.env.VITE_PERF_BENCH_EXIT === "1") await window.api?.windowClose();
}

export function scheduleBench(): void {
  void (async () => {
    await waitForMain();
    await wait(3000);
    await runBench();
  })();
}
