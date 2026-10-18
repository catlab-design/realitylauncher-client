# Runtime Perf — Results

Spec: `2026-10-18-runtime-perf-design.md`

- **Machine:** Linux 7.2.9 (CachyOS), WebKitGTK 2.54.1 (Tauri dev build, React StrictMode on).
- **Method:** `VITE_PERF_BENCH=1 VITE_PERF_BENCH_EXIT=1 bun run tauri dev`. Each value is the median of 3 runs.
- **Long tasks** come from the rAF-gap sampler (WebKitGTK has no `longtask` observer), so a long task means a frame gap ≥ 50ms.
- **Render counts** come from `React.Profiler`: `app` = whole `LauncherAppContent` tree; the other ids = the active tab subtree.
- A **phase** includes its settle waits, so frame counts are not "frames scrolled".

## Bundle (`bun run build`)

| Asset | Baseline |
|---|---|
| Entry JS `index-*.js` | 1,998 KB (563 KB gzip) |
| CSS | 137 KB (20.8 KB gzip) |
| `modpack_icon.png` | 1,475 KB |

## Runtime

#### tab-cycle

| Metric | baseline (n=3) | t3 (n=3) |
|---|---|---|
| frames | 163 | 156 |
| slow frames (>20ms) | 121 | 119 |
| p95 frame ms | 204 | 234 |
| long tasks | 82 | 79 |
| long-task total ms | 10153 | 11039 |
| renders `app` | 80 | 71 |
| render ms `app` | 1399 | 1426 |
| renders `explore` | 16 | 11 |
| render ms `explore` | 214 | 248 |
| renders `home` | 17 | 12 |
| render ms `home` | 334 | 352 |
| renders `modpack` | 19 | 11 |
| render ms `modpack` | 167 | 176 |
| renders `servers` | 13 | 13 |
| render ms `servers` | 367 | 381 |
| renders `wardrobe` | 13 | 10 |
| render ms `wardrobe` | 90 | 98 |

#### scroll-explore

| Metric | baseline (n=3) | t3 (n=3) |
|---|---|---|
| frames | 100 | 96 |
| slow frames (>20ms) | 100 | 96 |
| p95 frame ms | 98 | 108 |
| long tasks | 14 | 14 |
| long-task total ms | 1327 | 1464 |
| renders `app` | 5 | 5 |
| render ms `app` | 88 | 101 |
| renders `explore` | 3 | 3 |
| render ms `explore` | 76 | 86 |
| renders `home` | 2 | 1 |
| render ms `home` | 3 | 7 |

#### scroll-servers

| Metric | baseline (n=3) | t3 (n=3) |
|---|---|---|
| frames | 96 | 95 |
| slow frames (>20ms) | 95 | 95 |
| p95 frame ms | 138 | 133 |
| long tasks | 89 | 89 |
| long-task total ms | 8965 | 7202 |
| renders `app` | 125 | 11 |
| render ms `app` | 1595 | 245 |
| renders `explore` | 2 | 1 |
| render ms `explore` | 9 | 4 |
| renders `servers` | 123 | 9 |
| render ms `servers` | 1353 | 222 |

#### progress-burst

| Metric | baseline (n=3) | t3 (n=3) |
|---|---|---|
| frames | 150 | 150 |
| slow frames (>20ms) | 15 | 7 |
| p95 frame ms | 27 | 19 |
| long tasks | 6 | 6 |
| long-task total ms | 1152 | 1641 |
| renders `app` | 26 | 3 |
| render ms `app` | 214 | 16 |
| renders `home` | 26 | 2 |
| render ms `home` | 139 | 13 |

- **After Task 3:** `installToastLive` check = true in 3/3 runs. The progress toast updates while the shell does not re-render.
