export interface FrameSummary {
  frames: number;
  slow: number;
  p95: number;
}

export interface LongTaskSummary {
  count: number;
  totalMs: number;
}

const SLOW_FRAME_MS = 20;
const LONG_TASK_MS = 50;

export function summarizeFrames(deltasMs: number[]): FrameSummary {
  if (deltasMs.length === 0) return { frames: 0, slow: 0, p95: 0 };
  const sorted = [...deltasMs].sort((a, b) => a - b);
  const rank = Math.ceil(0.95 * sorted.length) - 1;
  return {
    frames: deltasMs.length,
    slow: deltasMs.filter((d) => d > SLOW_FRAME_MS).length,
    p95: sorted[rank],
  };
}

export function rafGapLongTasks(deltasMs: number[]): LongTaskSummary {
  const gaps = deltasMs.filter((d) => d >= LONG_TASK_MS);
  return { count: gaps.length, totalMs: gaps.reduce((sum, d) => sum + d, 0) };
}
