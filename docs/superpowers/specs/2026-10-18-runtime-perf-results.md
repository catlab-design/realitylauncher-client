# Runtime Perf — Results

## Summary vs spec §1 success criteria

| Criterion | Target | Result | |
|---|---|---|---|
| Active-tab renders during a 3s install-progress burst | ≥ 80% fewer | `home` 26 → 2 (−92%); whole app 26 → 3 (−88%) | ✅ met |
| Long-task total over the tab-switch cycle | lower than baseline | 10,153 → 9,154 ms (−10%, near noise) | ⚠️ met, small |
| Slow frames (>20ms) scrolling Install / Servers | lower than baseline | Install 100 → 88; Servers 95 → 95. Servers long-task ms 8,965 → 7,000 (−22%) | ⚠️ partly met |
| Initial JS | 2.0 MB → < 700 KB | entry 1,998 → 321 KB; all JS loaded at startup 1,998 → 696 KB | ✅ met |
| Checks | all green | `cargo check --lib`, `bun test` (16 tests), `bun run check:bridge` green; full `tsc` has no new errors (88 pre-existing, all unused-var) | ✅ met |

### Why scrolling and tab switching improved less
- **React work:** it was cut sharply — Servers scroll renders 125 → 11, progress renders 26 → 3.
- **Where the remaining time goes:** React render time is now ~15% of the blocked time. The rest is WebKitGTK style/layout/paint.
- **Attribution runs (below):**
  - neither the title-bar blur nor looping animations is the bottleneck;
  - removing *all* blur app-wide would recover ~26% of the Servers scroll cost;
  - that is a visible redesign, so it is offered rather than applied.
- **Fixed constraint:** this machine requires `WEBKIT_DISABLE_DMABUF_RENDERER`, so its slower non-DMABuf repaint path cannot change. Windows (WebView2) is expected to fare better but was not measured.

Spec: `2026-10-18-runtime-perf-design.md`

- **Machine:** Linux 7.2.9 (CachyOS), WebKitGTK 2.54.1 (Tauri dev build, React StrictMode on).
- **Method:** `VITE_PERF_BENCH=1 VITE_PERF_BENCH_EXIT=1 bun run tauri dev`. Each value is the median of 3 runs.
- **Long tasks** come from the rAF-gap sampler (WebKitGTK has no `longtask` observer), so a long task means a frame gap ≥ 50ms.
- **Render counts** come from `React.Profiler`: `app` = whole `LauncherAppContent` tree; the other ids = the active tab subtree.
- A **phase** includes its settle waits, so frame counts are not "frames scrolled".

## Bundle (`bun run build`)

| Asset | Baseline | After Task 6 |
|---|---|---|
| Entry JS `index-*.js` | 1,998 KB (563 KB gzip) | 321 KB (90 KB gzip) |
| JS loaded at startup (entry + `index.html` preloads) | 1,998 KB | 696 KB (entry, `vendor-react`, `motion`, `gsap`) |
| `markdown` chunk | in entry | 335 KB, lazy: loads with the first changelog / project page / server story |
| `skinview3d` chunk | 66 KB (separate) | 516 KB (separate; now includes `three`), Wardrobe only |
| CSS | 137 KB (20.8 KB gzip) | 137 KB |
| Datapack icon | `modpack_icon.png` 1,475 KB (1024²) | `modpack_icon.webp` 1 KB (64², shown at 14–16px) |

### Rust release binary
- **Full LTO** (`lto = true`, `codegen-units = 1`): builds cleanly; `target/release/ml-tauri-poc` is 17.8 MB stripped; a cold build took 16m 12s on 4 cores.
- **Shipped profile:** switched to thin LTO + `codegen-units = 16` at the user's choice, to keep release/CI build times close to today's. Its size and build time are not measured here, and the no-profile comparison build was stopped.

## Runtime

Columns are the state after each task: `t4b` = Task 4 (with the Profiler-id fix), `t6` = final.

#### tab-cycle

| Metric | baseline (n=3) | t3 (n=3) | t4b (n=3) | t5 (n=3) | t6 (n=3) |
|---|---|---|---|---|---|
| frames | 163 | 156 | 165 | 174 | 186 |
| slow frames (>20ms) | 121 | 119 | 117 | 120 | 130 |
| p95 frame ms | 204 | 234 | 249 | 230 | 192 |
| long tasks | 82 | 79 | 72 | 73 | 78 |
| long-task total ms | 10153 | 11039 | 10499 | 10332 | 9154 |
| renders `app` | 80 | 71 | 60 | 66 | 69 |
| render ms `app` | 1399 | 1426 | 1563 | 1263 | 1215 |
| renders `explore` | 16 | 11 | 23 | 24 | 24 |
| render ms `explore` | 214 | 248 | 189 | 134 | 143 |
| renders `home` | 17 | 12 | 12 | 13 | 13 |
| render ms `home` | 334 | 352 | 383 | 329 | 302 |
| renders `keep-alive-placeholder` | 0 | 0 | 9 | 9 | 9 |
| render ms `keep-alive-placeholder` | 0 | 0 | 0 | 0 | 0 |
| renders `modpack` | 19 | 11 | 24 | 26 | 26 |
| render ms `modpack` | 167 | 176 | 154 | 144 | 133 |
| renders `servers` | 13 | 13 | 13 | 13 | 15 |
| render ms `servers` | 367 | 381 | 475 | 405 | 386 |
| renders `wardrobe` | 13 | 10 | 11 | 12 | 11 |
| render ms `wardrobe` | 90 | 98 | 134 | 112 | 103 |

#### scroll-explore

| Metric | baseline (n=3) | t3 (n=3) | t4b (n=3) | t5 (n=3) | t6 (n=3) |
|---|---|---|---|---|---|
| frames | 100 | 96 | 146 | 142 | 144 |
| slow frames (>20ms) | 100 | 96 | 87 | 89 | 88 |
| p95 frame ms | 98 | 108 | 43 | 36 | 36 |
| long tasks | 14 | 14 | 5 | 5 | 5 |
| long-task total ms | 1327 | 1464 | 818 | 564 | 498 |
| renders `app` | 5 | 5 | 4 | 4 | 4 |
| render ms `app` | 88 | 101 | 20 | 16 | 17 |
| renders `explore` | 3 | 3 | 3 | 3 | 3 |
| render ms `explore` | 76 | 86 | 0 | 0 | 0 |
| renders `home` | 2 | 1 | 1 | 1 | 1 |
| render ms `home` | 3 | 7 | 7 | 5 | 5 |
| renders `keep-alive-placeholder` | 0 | 0 | 2 | 2 | 2 |
| render ms `keep-alive-placeholder` | 0 | 0 | 0 | 0 | 0 |
| renders `modpack` | 0 | 0 | 3 | 3 | 3 |
| render ms `modpack` | 0 | 0 | 0 | 0 | 0 |

#### scroll-servers

| Metric | baseline (n=3) | t3 (n=3) | t4b (n=3) | t5 (n=3) | t6 (n=3) |
|---|---|---|---|---|---|
| frames | 96 | 95 | 93 | 97 | 97 |
| slow frames (>20ms) | 95 | 95 | 93 | 94 | 95 |
| p95 frame ms | 138 | 133 | 162 | 121 | 111 |
| long tasks | 89 | 89 | 89 | 91 | 92 |
| long-task total ms | 8965 | 7202 | 7660 | 7033 | 7000 |
| renders `app` | 125 | 11 | 12 | 12 | 12 |
| render ms `app` | 1595 | 245 | 296 | 214 | 189 |
| renders `explore` | 2 | 1 | 2 | 2 | 2 |
| render ms `explore` | 9 | 4 | 0 | 0 | 1 |
| renders `modpack` | 0 | 0 | 2 | 2 | 2 |
| render ms `modpack` | 0 | 0 | 0 | 0 | 0 |
| renders `servers` | 123 | 9 | 10 | 10 | 10 |
| render ms `servers` | 1353 | 222 | 283 | 203 | 178 |

#### progress-burst

| Metric | baseline (n=3) | t3 (n=3) | t4b (n=3) | t5 (n=3) | t6 (n=3) |
|---|---|---|---|---|---|
| frames | 150 | 150 | 151 | 152 | 145 |
| slow frames (>20ms) | 15 | 7 | 8 | 8 | 8 |
| p95 frame ms | 27 | 19 | 21 | 25 | 29 |
| long tasks | 6 | 6 | 7 | 7 | 7 |
| long-task total ms | 1152 | 1641 | 1813 | 2090 | 2124 |
| renders `app` | 26 | 3 | 3 | 3 | 3 |
| render ms `app` | 214 | 16 | 22 | 21 | 17 |
| renders `explore` | 0 | 0 | 1 | 1 | 1 |
| render ms `explore` | 0 | 0 | 0 | 0 | 0 |
| renders `home` | 26 | 2 | 3 | 3 | 2 |
| render ms `home` | 139 | 13 | 16 | 15 | 9 |
| renders `modpack` | 0 | 0 | 1 | 1 | 1 |
| render ms `modpack` | 0 | 0 | 0 | 0 | 0 |

### Paint attribution (dev-only `VITE_PERF_EXPERIMENT`, n=2 each, on top of Task 4)

| Experiment | scroll-servers long-task ms | tab-cycle long-task ms |
|---|---|---|
| none (t4b, n=3) | 7660 | 10499 |
| all `backdrop-filter`/`filter` off | 5680 (−26%) | 10372 (~0) |
| title-bar blur off | 7790 (~0) | 10012 (~0) |
| title-bar blur 24px → 12px | 6994 (−9%, noise range) | 10338 (~0) |
| all CSS animations off | 7142 (~0) | 10204 (~0) |

Run-to-run noise is ±10–15%.

- Neither blur nor looping animations dominates. While scrolling, nearly every frame is ≥ 50ms even with no blur, but a static page renders fast frames (progress-burst: 8 slow out of 150).
- This is consistent with the WebKitGTK non-DMABuf rendering path repainting the whole view each frame. This machine requires `WEBKIT_DISABLE_DMABUF_RENDERER`, so that path is a fixed constraint.

### Notes
- **After Task 3:** `installToastLive` = true in 3/3 runs. The progress toast updates while the shell does not re-render.
- **After Task 4:** in 3/3 runs, `modpackNotRemounted`, `hiddenModpackClearsLayout`, `hiddenExploreClearsLayout` and `settingsRoundTripKeepsLayout` are all true.
  - With `KEEP_ALIVE_TABS` emptied (negative control run), `modpackNotRemounted` = false, so the check detects remounts.
  - `modpack`/`explore` render counts rise because hidden-but-mounted tabs re-render on activation toggles; their render ms fall.
- **After Task 5:** in 3/3 runs, `rainbowCycles`, `rainbowPausesWhenHidden` and `rainbowOffRestoresAccent` are all true.
  - **Superseded by the final review:** the CSS rainbow animation restyled the page per frame, which starved the main thread. Rainbow mode is back on the original 10 Hz JS timer, now skipped while hidden. Scroll/tab metrics are unchanged within noise, as expected: Task 5 removes idle/background work (a 10 Hz JS timer, animations and news autoplay while hidden), which this bench does not exercise.
- React render time is ~15% of tab-cycle long-task time. The remainder is style/layout/paint in WebKitGTK.
- **Final review fixes** (`fixgreen`, 3 clean runs; all boolean checks true, including the new `modpackReloadsOnReturn` / `exploreReloadsOnReturn`, which were false before the fix):
  - With rainbow mode on, the main thread manages only 4–5 timer samples per second. This happens with the original JS timer too, so it is the same cost as on `main`: each accent change restyles every element that uses `--secondary-color`. This is a pre-existing cost and is not addressed here.
