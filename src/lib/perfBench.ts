import { perfProbe } from "./perfProbe";
import { useUiStore } from "../store/uiStore";
import { useProgressStore } from "../store/progressStore";

type BenchTab = "home" | "servers" | "modpack" | "explore" | "wardrobe";

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

  await window.api?.devPerfReport(perfProbe.report());
  if (import.meta.env.VITE_PERF_BENCH_EXIT === "1") await window.api?.windowClose();
}

export function scheduleBench(): void {
  void (async () => {
    await waitForMain();
    await wait(3000);
    await runBench();
  })();
}
