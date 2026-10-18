import { rafGapLongTasks, summarizeFrames, type FrameSummary } from "./perfStats";

export interface PhaseMetrics {
  renders: Record<string, { count: number; ms: number }>;
  frames: FrameSummary;
  longTasks: { count: number; totalMs: number; source: "observer" | "raf" };
}

export interface PerfReport {
  phases: Record<string, PhaseMetrics>;
}

interface PhaseState {
  renders: Record<string, { count: number; ms: number }>;
  frameDeltas: number[];
  observedLongTasks: number[];
}

const IDLE = "idle";
const supportsLongTask =
  typeof PerformanceObserver !== "undefined" &&
  (PerformanceObserver.supportedEntryTypes ?? []).includes("longtask");

const phases: Record<string, PhaseState> = {};
let current = IDLE;

function phaseState(name: string): PhaseState {
  return (phases[name] ??= { renders: {}, frameDeltas: [], observedLongTasks: [] });
}

function onRender(id: string, _phase: string, actualDuration: number): void {
  const bucket = (phaseState(current).renders[id] ??= { count: 0, ms: 0 });
  bucket.count += 1;
  bucket.ms += actualDuration;
}

async function runPhase(name: string, fn: () => Promise<void>): Promise<void> {
  const state = phaseState(name);
  current = name;

  const observer = supportsLongTask
    ? new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) state.observedLongTasks.push(entry.duration);
      })
    : null;
  observer?.observe({ type: "longtask", buffered: false });

  let sampling = true;
  let last = performance.now();
  const sample = (now: number) => {
    if (!sampling) return;
    state.frameDeltas.push(now - last);
    last = now;
    requestAnimationFrame(sample);
  };
  requestAnimationFrame((now) => {
    last = now;
    requestAnimationFrame(sample);
  });

  try {
    await fn();
  } finally {
    sampling = false;
    observer?.disconnect();
    current = IDLE;
  }
}

function report(): PerfReport {
  const out: PerfReport = { phases: {} };
  for (const [name, state] of Object.entries(phases)) {
    const longTasks = supportsLongTask
      ? {
          count: state.observedLongTasks.length,
          totalMs: state.observedLongTasks.reduce((sum, d) => sum + d, 0),
          source: "observer" as const,
        }
      : { ...rafGapLongTasks(state.frameDeltas), source: "raf" as const };
    out.phases[name] = {
      renders: Object.fromEntries(
        Object.entries(state.renders).map(([id, r]) => [id, { count: r.count, ms: Math.round(r.ms * 10) / 10 }]),
      ),
      frames: summarizeFrames(state.frameDeltas),
      longTasks: { ...longTasks, totalMs: Math.round(longTasks.totalMs) },
    };
  }
  return out;
}

export const perfProbe = { onRender, runPhase, report };
