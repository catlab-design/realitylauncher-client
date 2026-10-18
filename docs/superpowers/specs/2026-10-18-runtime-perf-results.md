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

| Metric | baseline (n=3) | t3 (n=3) | t4b (n=3) |
|---|---|---|---|
| frames | 163 | 156 | 165 |
| slow frames (>20ms) | 121 | 119 | 117 |
| p95 frame ms | 204 | 234 | 249 |
| long tasks | 82 | 79 | 72 |
| long-task total ms | 10153 | 11039 | 10499 |
| renders `app` | 80 | 71 | 60 |
| render ms `app` | 1399 | 1426 | 1563 |
| renders `explore` | 16 | 11 | 23 |
| render ms `explore` | 214 | 248 | 189 |
| renders `home` | 17 | 12 | 12 |
| render ms `home` | 334 | 352 | 383 |
| renders `keep-alive-placeholder` | 0 | 0 | 9 |
| render ms `keep-alive-placeholder` | 0 | 0 | 0 |
| renders `modpack` | 19 | 11 | 24 |
| render ms `modpack` | 167 | 176 | 154 |
| renders `servers` | 13 | 13 | 13 |
| render ms `servers` | 367 | 381 | 475 |
| renders `wardrobe` | 13 | 10 | 11 |
| render ms `wardrobe` | 90 | 98 | 134 |

#### scroll-explore

| Metric | baseline (n=3) | t3 (n=3) | t4b (n=3) |
|---|---|---|---|
| frames | 100 | 96 | 146 |
| slow frames (>20ms) | 100 | 96 | 87 |
| p95 frame ms | 98 | 108 | 43 |
| long tasks | 14 | 14 | 5 |
| long-task total ms | 1327 | 1464 | 818 |
| renders `app` | 5 | 5 | 4 |
| render ms `app` | 88 | 101 | 20 |
| renders `explore` | 3 | 3 | 3 |
| render ms `explore` | 76 | 86 | 0 |
| renders `home` | 2 | 1 | 1 |
| render ms `home` | 3 | 7 | 7 |
| renders `keep-alive-placeholder` | 0 | 0 | 2 |
| render ms `keep-alive-placeholder` | 0 | 0 | 0 |
| renders `modpack` | 0 | 0 | 3 |
| render ms `modpack` | 0 | 0 | 0 |

#### scroll-servers

| Metric | baseline (n=3) | t3 (n=3) | t4b (n=3) |
|---|---|---|---|
| frames | 96 | 95 | 93 |
| slow frames (>20ms) | 95 | 95 | 93 |
| p95 frame ms | 138 | 133 | 162 |
| long tasks | 89 | 89 | 89 |
| long-task total ms | 8965 | 7202 | 7660 |
| renders `app` | 125 | 11 | 12 |
| render ms `app` | 1595 | 245 | 296 |
| renders `explore` | 2 | 1 | 2 |
| render ms `explore` | 9 | 4 | 0 |
| renders `modpack` | 0 | 0 | 2 |
| render ms `modpack` | 0 | 0 | 0 |
| renders `servers` | 123 | 9 | 10 |
| render ms `servers` | 1353 | 222 | 283 |

#### progress-burst

| Metric | baseline (n=3) | t3 (n=3) | t4b (n=3) |
|---|---|---|---|
| frames | 150 | 150 | 151 |
| slow frames (>20ms) | 15 | 7 | 8 |
| p95 frame ms | 27 | 19 | 21 |
| long tasks | 6 | 6 | 7 |
| long-task total ms | 1152 | 1641 | 1813 |
| renders `app` | 26 | 3 | 3 |
| render ms `app` | 214 | 16 | 22 |
| renders `explore` | 0 | 0 | 1 |
| render ms `explore` | 0 | 0 | 0 |
| renders `home` | 26 | 2 | 3 |
| render ms `home` | 139 | 13 | 16 |
| renders `modpack` | 0 | 0 | 1 |
| render ms `modpack` | 0 | 0 | 0 |

### Notes
- **After Task 3:** `installToastLive` = true in 3/3 runs. The progress toast updates while the shell does not re-render.
- **After Task 4:** in 3/3 runs, `modpackNotRemounted`, `hiddenModpackClearsLayout`, `hiddenExploreClearsLayout` and `settingsRoundTripKeepsLayout` are all true.
  - With `KEEP_ALIVE_TABS` emptied (negative control run), `modpackNotRemounted` = false, so the check detects remounts.
  - `modpack`/`explore` render counts rise because hidden-but-mounted tabs re-render on activation toggles; their render ms fall.
- React render time is ~15% of tab-cycle long-task time. The remainder is style/layout/paint in WebKitGTK.
