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

| Metric | baseline (n=3) |
|---|---|
| frames | 163 |
| slow frames (>20ms) | 121 |
| p95 frame ms | 204 |
| long tasks | 82 |
| long-task total ms | 10153 |
| renders `app` | 80 |
| render ms `app` | 1399 |
| renders `explore` | 16 |
| render ms `explore` | 214 |
| renders `home` | 17 |
| render ms `home` | 334 |
| renders `modpack` | 19 |
| render ms `modpack` | 167 |
| renders `servers` | 13 |
| render ms `servers` | 367 |
| renders `wardrobe` | 13 |
| render ms `wardrobe` | 90 |

#### scroll-explore

| Metric | baseline (n=3) |
|---|---|
| frames | 100 |
| slow frames (>20ms) | 100 |
| p95 frame ms | 98 |
| long tasks | 14 |
| long-task total ms | 1327 |
| renders `app` | 5 |
| render ms `app` | 88 |
| renders `explore` | 3 |
| render ms `explore` | 76 |
| renders `home` | 2 |
| render ms `home` | 3 |

#### scroll-servers

| Metric | baseline (n=3) |
|---|---|
| frames | 96 |
| slow frames (>20ms) | 95 |
| p95 frame ms | 138 |
| long tasks | 89 |
| long-task total ms | 8965 |
| renders `app` | 125 |
| render ms `app` | 1595 |
| renders `explore` | 2 |
| render ms `explore` | 9 |
| renders `servers` | 123 |
| render ms `servers` | 1353 |

#### progress-burst

| Metric | baseline (n=3) |
|---|---|
| frames | 150 |
| slow frames (>20ms) | 15 |
| p95 frame ms | 27 |
| long tasks | 6 |
| long-task total ms | 1152 |
| renders `app` | 26 |
| render ms `app` | 214 |
| renders `home` | 26 |
| render ms `home` | 139 |
