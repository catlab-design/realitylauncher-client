# Runtime Responsiveness & Startup Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut re-renders, tab-switch cost and paint cost in the launcher UI, then shrink the startup bundle. Prove each step with an in-app benchmark.

**Architecture:**
- **Measure:** a dev-only probe (React Profiler + frame/long-task sampler) and a scripted bench run inside `bun run tauri dev`. They report JSON to stdout through a debug-only Rust command.
- **Fix in four groups:** re-render chain → keep-alive tabs → paint/animation → startup.
- **Re-measure:** bench after each group to attribute gains.

**Tech Stack:** React 19, Zustand 5 (`zustand/react/shallow`), framer-motion 12, Vite 6, Tailwind v4, Tauri 2 / Rust, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-10-18-runtime-perf-design.md`

## Global Constraints

- No visual/behavioral change except repeated list cards losing `backdrop-blur`; the tab transition style is preserved.
- Every commit passes `cargo check --lib` (in `src-tauri/`), `bun test`, `bun run check:bridge`.
- `docs/CHANGELOG.md` gets an `[Unreleased] — 2026-10-18` entry for each fix group. `CLAUDE.md` is kept in sync (new files, new command, new env vars).
- All probe/bench code is behind `import.meta.env.DEV` and is absent from `bun run build` output (grep `dist/` for `PERF_REPORT` → no match).
- No `any` in new code. File names: `camelCase.ts` utilities, `PascalCase.tsx` components. No redundant comments.
- Bench never calls install/launch/config-write IPC.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Settings opened over a kept-alive ModPack/Explore, then closed** → `fullBleed`/`immersive` match the visible tab (Task 4 smoke step).
2. **Account switch or logout while ModPack is hidden-but-mounted** → returning shows the new account's instances, not stale ones (Task 4 smoke step).
3. **Language/theme change while a kept-alive tab is hidden** → shown in the new language/colors on return (`React.memo` must not block store-driven updates) (Task 4 smoke step).
4. **Install running while the user switches tabs** → progress panel keeps updating live after progress reads move out of `LauncherApp` (Task 3 smoke step).
5. **Window minimized then restored (with rainbow mode on)** → animations and the calendar clock resume at the correct time (Task 5 smoke step).

---

## File Map

| File | Responsibility |
|---|---|
| `src/lib/perfStats.ts` (new) | Pure functions: frame/long-task summaries. Unit-tested. |
| `src/lib/perfStats.test.ts` (new) | Tests for the above. |
| `src/lib/perfProbe.ts` (new) | Dev-only collectors: Profiler callback, rAF sampler, longtask observer, phases. |
| `src/lib/perfBench.ts` (new) | Dev-only scripted bench; reports via `window.api.devPerfReport`. |
| `src/components/PerfTab.tsx` (new) | `<PerfTab id>`: `React.Profiler` in DEV, passthrough otherwise. |
| `src-tauri/src/telemetry.rs` | Add `dev_perf_report`. |
| `src-tauri/src/main.rs` | Register `dev_perf_report`. |
| `src/api.ts` | Add `devPerfReport`. |
| `src/main.tsx` | Schedule bench when env flag set. |
| `src/lib/tabKeepAlive.ts` (new) + `.test.ts` | Pure `nextMountedTabs` + `TabActiveContext` / `useTabActive`. |
| `src/components/InstallProgressPanel.tsx` (new) | Progress panel extracted from `LauncherAppShell.tsx:224-319`; reads progressStore itself. |
| `src/components/ui/LiveClock.tsx` (new) | 1s clock isolated from `CalendarWidget`. |
| `src/lib/pageVisibility.ts` (new) | Sets `data-hidden` on `<html>`; `isPageHidden()`. |
| `docs/superpowers/specs/2026-10-18-runtime-perf-results.md` (new) | Baseline/after tables. |

---

### Task 1: Measurement harness

**Files:**
- Create: `src/lib/perfStats.ts`, `src/lib/perfStats.test.ts`, `src/lib/perfProbe.ts`, `src/lib/perfBench.ts`, `src/components/PerfTab.tsx`
- Modify: `src-tauri/src/telemetry.rs`, `src-tauri/src/main.rs:198`, `src/api.ts:372`, `src/main.tsx`, `src/components/LauncherAppShell.tsx:633-648`, `CLAUDE.md` (§4.2 telemetry row, §6, §7)

**Interfaces:**
- Produces:
  - `summarizeFrames(deltasMs: number[]): { frames: number; slow: number; p95: number }`. `slow` = deltas > 20. `p95` is nearest-rank, and 0 for an empty input.
  - `rafGapLongTasks(deltasMs: number[]): { count: number; totalMs: number }`. Gaps ≥ 50 count; `totalMs` sums those gaps.
  - `perfProbe.onRender(id: string, phase: string, actualDuration: number): void`
  - `perfProbe.runPhase(name: string, fn: () => Promise<void>): Promise<void>`
  - `perfProbe.report(): PerfReport`, where:
    - `PerfReport = { phases: Record<string, PhaseMetrics> }`
    - `PhaseMetrics = { renders: Record<string, { count: number; ms: number }>; frames: ReturnType<typeof summarizeFrames>; longTasks: { count: number; totalMs: number; source: 'observer' | 'raf' } }`
  - `<PerfTab id: string>{children}</PerfTab>`
  - `scheduleBench(): void`
  - `window.api.devPerfReport(report: PerfReport): Promise<void>` → Rust `dev_perf_report(report: serde_json::Value) -> Result<(), String>`

- [ ] **Step 1: Write failing tests** in `src/lib/perfStats.test.ts`:
  - `summarizeFrames([16,16,40,16,25])` → `{ frames: 5, slow: 2, p95: 40 }`
  - `summarizeFrames([])` → `{ frames: 0, slow: 0, p95: 0 }`
  - `rafGapLongTasks([16, 60, 16, 120, 49])` → `{ count: 2, totalMs: 180 }`
- [ ] **Step 2:** Run `bun test src/lib/perfStats.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `perfStats.ts`.** Run the test again. Expected: PASS.
- [ ] **Step 4: Implement `perfProbe.ts`.**
  - Renders accumulate into the current phase. Outside any phase they go to the `"idle"` bucket.
  - Long tasks: use `PerformanceObserver` with `type: 'longtask'` when `PerformanceObserver.supportedEntryTypes` includes it. Otherwise feed rAF deltas to `rafGapLongTasks`.
  - Record the source used.
- [ ] **Step 5: Implement `PerfTab`.**
  - `import.meta.env.DEV` → `<React.Profiler id={id} onRender={(id, phase, d) => perfProbe.onRender(id, phase, d)}>`; else render `children` as-is.
  - In `LauncherAppShell.tsx`, wrap each tab element in `<PerfTab id="<tabId>">` and the whole `<main>` content in `<PerfTab id="shell">`.
- [ ] **Step 6: Add the Rust command.**
  - In `telemetry.rs`: `#[tauri::command] pub fn dev_perf_report(report: serde_json::Value) -> Result<(), String>`.
  - Body: `#[cfg(debug_assertions)] println!("PERF_REPORT {}", report);`; then `Ok(())`. In release, add `let _ = report;` to silence unused.
  - Register in `main.rs` next to `telemetry::telemetry_log_event`.
  - `api.ts`: `devPerfReport: (report: unknown) => invoke<void>('dev_perf_report', { report })`.
- [ ] **Step 7: Implement `perfBench.ts` `scheduleBench()`.**
  - Start: poll every 250ms until `document.querySelector('main')` exists, wait 3000ms, then run the phases in order:
    1. `tab-cycle`: `['home','servers','modpack','explore','wardrobe','home']` ×3 via `useUiStore.getState().setActiveTab`, 600ms each.
    2. `scroll-explore`: set tab `explore`, wait 1500ms, scroll `main` 0 → `scrollHeight` → 0 in 40 rAF steps each way.
    3. `scroll-servers`: same, on the servers tab.
    4. `progress-burst`: on `home`, call `useProgressStore.getState().setInstallProgress({ type: 'progress', stage: 'download', percent: i, current: i, total: 25, message: 'bench' })` every 120ms for 25 ticks, then `setInstallProgress(null)`.
  - After the phases: `await window.api.devPerfReport(perfProbe.report())`. If `import.meta.env.VITE_PERF_BENCH_EXIT === '1'`, call `window.api.windowClose()`.
  - Check the `InstallProgress` type in `src/types/launcher.ts` and match its field names exactly.
- [ ] **Step 8: Wire up `main.tsx`.** `if (import.meta.env.DEV && import.meta.env.VITE_PERF_BENCH === '1') void import('./lib/perfBench').then((m) => m.scheduleBench());`. Add both vars to `src/env.d.ts` `ImportMetaEnv`.
- [ ] **Step 9: Verify everything passes.**
  - `cd src-tauri && cargo check --lib` → no errors.
  - `bun test` → all pass; the bridge test picks up `dev_perf_report`.
  - `bun run check:bridge` → clean.
  - `bun run build && grep -r PERF_REPORT dist/ ; grep -rl perfBench dist/` → no matches.
- [ ] **Step 10: Smoke test.** `VITE_PERF_BENCH=1 VITE_PERF_BENCH_EXIT=1 bun run tauri dev 2>&1 | grep PERF_REPORT` → one JSON line with 4 phases, then the window closes.
- [ ] **Step 11:** Update `CLAUDE.md` (telemetry row `dev_perf_report`; §6/§7 bench command; §2 new files), then commit with `feat(perf): add dev-only render/frame benchmark harness`.

### Task 2: Baseline

**Files:** Create `docs/superpowers/specs/2026-10-18-runtime-perf-results.md`.

- [ ] **Step 1:** Run the Task 1 Step 10 command 3 times. Save the lines to `$SCRATCHPAD/baseline-{1,2,3}.json`.
- [ ] **Step 2: Write the results doc.**
  - One table per phase: renders per Profiler id (count, ms), frames/slow/p95, longTasks count/totalMs/source.
  - Each value is the median of the 3 runs.
  - Add `bun run build` chunk sizes (entry JS, CSS, largest assets).
  - Add a "Machine" line: OS, WebView engine.
- [ ] **Step 3:** Commit with `docs(perf): record baseline measurements`.

### Task 3: Re-render chain

**Files:**
- Create: `src/components/InstallProgressPanel.tsx`
- Modify:
  - `src/components/LauncherApp.tsx:36-46`
  - `src/components/LauncherAppShell.tsx:224-319, 351-378, 634-646`
  - `src/components/layout/Sidebar.tsx:26-29`
  - `src/components/tabs/ServerMenu.tsx:129-136`
  - `src/components/tabs/ModPack.tsx:118, 173`
  - `src/components/tabs/Wardrobe.tsx:170-171`
  - `src/components/tabs/settingsTabs/AccountTab.tsx:43`
  - The tab components' exports

**Interfaces:**
- Produces: `<InstallProgressPanel colors={colors} onCancel={handleCancelInstall} />`. It reads `isInstalling`, `installProgress`, `operationType`, `isInstallMinimized` from `useProgressStore` with `useShallow`. `LauncherAppShell` props `isInstalling`, `installProgress`, `operationType` are removed.

- [ ] **Step 1: Replace all 14 whole-store calls.**
  - Find them with `grep -rnE "use(Config|Auth|Ui|Launch|Progress)Store\(\)" src`.
  - Use `useStore(useShallow((s) => ({ ...picked })))` and pick only the fields used in that component.
  - `const config = useConfigStore()` sites keep the full config object via `useConfigStore(useShallow((s) => s))`. Zustand state is replaced only on `set`, and actions are stable, so `config` changes only when config changes.
- [ ] **Step 2: Move progress reads out of `LauncherApp` render scope.**
  - Handlers/effects that read `installProgress`/`isInstalling` use `useProgressStore.getState()` instead.
  - Setters come from `useProgressStore.getState()` or individual selectors.
- [ ] **Step 3: Extract `InstallProgressPanel`.** Move `LauncherAppShell.tsx:224-319` verbatim into `InstallProgressPanel` and render it in the same place. Any other Shell spots that read `isInstalling` use `useProgressStore((s) => s.isInstalling)`.
- [ ] **Step 4: Stabilize props passed from `LauncherApp` to `LauncherAppShell` and the tabs.**
  - Wrap every function prop in `useCallback`, with deps listed exhaustively.
  - Wrap `colors`/`titleBarColors` in `useMemo` on the theme inputs.
  - `t` from `useTranslation` must be stable per language. If it isn't, memoize it in `useTranslation.ts` on `language`.
- [ ] **Step 5: Memoize the tabs.** Export `Home`, `ServerMenu`, `ModPack`, `Explore`, `Wardrobe`, `About`, `AdminPanel` wrapped in `React.memo`, keeping the existing export names.
- [ ] **Step 6: Verify.** `cargo check --lib`, `bun test` and `bun run check:bridge` are all clean.
- [ ] **Step 7: Smoke-test** in `bun run tauri dev`:
  - every tab renders;
  - **Review Focus 4:** start an install on a small instance, switch tabs during it; the panel keeps updating, and cancel works.
- [ ] **Step 8: Bench ×3.** Append an "After Task 3" column to the results doc. Expected: `progress-burst` renders for the `home` and `shell` ids drop ≥ 80% vs baseline. If they don't, find the remaining subscriber with the Profiler data before continuing.
- [ ] **Step 9:** Add a CHANGELOG `### Perf` entry, then commit with `perf(ui): narrow store subscriptions and memoize tabs`.

### Task 4: Keep-alive for ModPack and Explore

**Files:**
- Create: `src/lib/tabKeepAlive.ts`, `src/lib/tabKeepAlive.test.ts`
- Modify:
  - `src/components/LauncherAppShell.tsx:626-650`
  - `src/components/tabs/ModPack.tsx:798-820`
  - `src/components/tabs/ExploreTabs/ProjectDetailPage.tsx:111-115`

**Interfaces:**
- Produces:
  - `KEEP_ALIVE_TABS = ['modpack', 'explore'] as const`
  - `nextMountedTabs(mounted: readonly string[], active: string): string[]`. Appends `active` if it is in `KEEP_ALIVE_TABS` and not already present; otherwise returns `mounted` unchanged (same reference).
  - `TabActiveContext = React.createContext(true)`; `useTabActive(): boolean`

- [ ] **Step 1: Write failing tests:**
  - `nextMountedTabs([], 'modpack')` → `['modpack']`
  - `nextMountedTabs(['modpack'], 'home')` → the same reference
  - `nextMountedTabs(['modpack'], 'explore')` → `['modpack','explore']`
  - `nextMountedTabs(['modpack'], 'modpack')` → the same reference
- [ ] **Step 2:** Run `bun test src/lib/tabKeepAlive.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, then re-run. Expected: PASS.
- [ ] **Step 4: Change the shell to keep heavy tabs alive.**
  - `const [mounted, setMounted] = useState<string[]>([])`, with an effect `setMounted((m) => nextMountedTabs(m, contentTab))`.
  - Non-keep-alive tabs stay inside the existing `AnimatePresence` exactly as now.
  - For each id in `mounted`, render outside `AnimatePresence`: `<div hidden={contentTab !== id} className="h-full"><TabActiveContext.Provider value={contentTab === id && !settingsDialogOpen}><motion.div key={…}>…</motion.div></TabActiveContext.Provider></div>`.
    - Remount the `motion.div` (key bump) on activation so the `page` variant `hidden → show` replays.
    - `ModPack` gets `isActive={contentTab === 'modpack'}`.
  - Inside `AnimatePresence`, render nothing for keep-alive tab ids.
  - The shared scroller reset still happens on every `contentTab` change. Today it runs on exit-complete; also call `mainRef.current?.scrollTo({ top: 0 })` when switching to or from a keep-alive tab.
- [ ] **Step 5: Gate shared shell state on activity.**
  - `ModPack.tsx:798-820`: add `isActive` to both effects' conditions and deps. When `!isActive`, set nothing and attach no scroll listener; the cleanup resets as it does now.
  - `ProjectDetailPage.tsx:111-115`: `const active = useTabActive()`. Run `setFullBleed(true)` only when `active`, with the cleanup unchanged and `[active, setFullBleed]` as deps.
- [ ] **Step 6: Verify.** `cargo check --lib`, `bun test` and `bun run check:bridge` are all clean.
- [ ] **Step 7: Smoke-test** in `bun run tauri dev`:
  - ModPack list → detail → Explore → back to ModPack: still on the same detail, with no refetch spinner.
  - Explore project detail → Home: Home hero is immersive and full-bleed. Explore → Servers: Servers is not full-bleed.
  - **Review Focus 1:** open settings over ModPack detail, then close; the layout is unchanged.
  - **Review Focus 2:** switch account while on Home after visiting ModPack; go to ModPack and the instances belong to the new account. If they're stale, key the ModPack keep-alive element on `session?.uuid`.
  - **Review Focus 3:** change language while ModPack is hidden; it shows the new language on return.
- [ ] **Step 8: Bench ×3** and add an "After Task 4" column. Expected: `tab-cycle` long-task totalMs is below the Task 3 column.
- [ ] **Step 9:** CHANGELOG, then commit with `perf(ui): keep ModPack and Explore mounted across tab switches`.

### Task 5: Paint and animation cost

**Files:**
- Create: `src/lib/pageVisibility.ts`, `src/components/ui/LiveClock.tsx`
- Modify:
  - `src/components/tabs/ServerItem.tsx`, `src/components/tabs/serverStory.tsx`
  - `src/components/LauncherApp.tsx:1248-1263`
  - `src/styles/global.css:44-80`
  - `src/components/ui/CalendarWidget.tsx:146, 220-223, 708`
  - `src/components/tabs/Home.tsx:471`
  - `src/components/tabs/ExploreTabs/ProjectCard.tsx`
  - `src/components/tabs/InstanceContentBrowser.tsx` (result rows)
  - `src/main.tsx`

**Interfaces:**
- Produces:
  - `installPageVisibility(): void`: toggles the `data-hidden` attribute on `document.documentElement` on `visibilitychange`.
  - `isPageHidden(): boolean`
  - `<LiveClock language: string />`: renders the same `toLocaleTimeString` output as `CalendarWidget.tsx:708`.

- [ ] **Step 1: Remove blur from repeated cards** in `ServerItem.tsx`/`serverStory.tsx`.
  - Remove `backdrop-blur-*` from elements rendered per list item; keep it on page-level panels/overlays.
  - On each affected element raise the background alpha by 0.15. For example `bg-black/40` becomes `bg-black/55`; for `rgba(…, a)` use `a+0.15`, capped at 0.95.
  - Record the changed lines in the commit message.
- [ ] **Step 2: Move rainbow mode to CSS.**
  - Delete the interval effect at `LauncherApp.tsx:1248-1263`. Replace it with an effect that toggles `data-rainbow` on `document.documentElement` from `config.rainbowMode`.
  - In `global.css`, replace `rainbow-accent-cycle` stops with 13 stops at hue 0°, 30°, …, 360°, each `hsl(h, 90%, 65%)` (the same color as today).
  - Add `:root[data-rainbow] { animation: rainbow-accent-cycle 18s steps(180) infinite; }` (18s = today's 2°/100ms; `steps(180)` = today's 10 updates/s).
  - When rainbow is off, `:root` has no animation, so `--secondary-color` falls back to its normal value.
- [ ] **Step 3: Pause work while the window is hidden.**
  - Call `installPageVisibility()` in `main.tsx`.
  - CSS: `:root[data-hidden], :root[data-hidden] * { animation-play-state: paused !important; }`.
  - `Home.tsx:471` autoplay tick and the `LiveClock` tick return early when `isPageHidden()`.
- [ ] **Step 4: Extract `LiveClock`.**
  - Move the 1s interval and the line-708 time text into `LiveClock`.
  - `CalendarWidget` keeps a `currentDate` state that updates once per minute, aligned to the minute boundary (`setTimeout` to the next minute, then `setInterval(60000)`). It needs only the date, for today and the current month.
- [ ] **Step 5: Skip drawing off-screen rows.** Add `[content-visibility:auto] [contain-intrinsic-size:auto_<h>px]` to the root of `ProjectCard` and the `InstanceContentBrowser` result row. `<h>` is the row's rendered height, measured in devtools.
- [ ] **Step 6: Verify.** `cargo check --lib`, `bun test` and `bun run check:bridge` are all clean.
- [ ] **Step 7: Smoke-test.**
  - Server cards look the same apart from no blur, checked side by side with `git stash`.
  - Rainbow mode cycles at the same speed, and turning it off restores the accent.
  - The calendar clock ticks every second.
  - **Review Focus 5:** minimize for 10s and restore; the clock shows the correct time immediately (it re-reads `new Date()` on the next tick, at most 1s later) and animations resume.
- [ ] **Step 8: Bench ×3** and add an "After Task 5" column. Expected: slow frames in `scroll-servers` are below the Task 4 column.
- [ ] **Step 9:** CHANGELOG, then commit with `perf(ui): cut paint cost of cards, rainbow mode and idle timers`.

### Task 6: Startup

**Files:**
- Modify: `src/components/LauncherAppLazyTabs.tsx`, `vite.config.ts`, `src/components/tabs/ExploreTabs/ProjectDetailPage.tsx:24`, `src/styles/global.css:19`, `src-tauri/Cargo.toml`
- Replace: `src/assets/modpack_icon.png` → `src/assets/modpack_icon.webp`

- [ ] **Step 1: Real lazy tabs.**
  - `LauncherAppLazyTabs.tsx`: each export becomes `React.lazy(() => import("./tabs/X").then((m) => ({ default: m.X })))`, using `default` directly for `AdminPanel`.
  - Keep the importer functions in a `const loaders = [...]` array.
  - `preloadTabs()` runs `loaders.forEach((l) => void l())` inside `requestIdleCallback`, falling back to `setTimeout(…, 1500)`.
  - The existing `React.Suspense` boundaries in the shell already cover this.
  - Keep-alive tabs from Task 4 must sit inside a `Suspense` too; add one around the keep-alive block if they aren't.
- [ ] **Step 2: Split vendor chunks.** In `vite.config.ts`, set `build.rollupOptions.output.manualChunks(id)`:
  - `react` / `react-dom` / `scheduler` → `vendor-react`
  - `framer-motion` / `motion-dom` / `motion-utils` → `motion`
  - `gsap` → `gsap`
  - `react-markdown`, `remark-*`, `rehype-*`, `mdast-*`, `hast-*`, `micromark*`, `unified` → `markdown`
  - `skinview3d` / `three` → `skinview3d`
- [ ] **Step 3: Shrink the icon.**
  - Run `magick src/assets/modpack_icon.png -resize 256x256 -quality 85 src/assets/modpack_icon.webp`, then check it's under 80 KB with `ls -l`.
  - `git rm src/assets/modpack_icon.png` and update the import in `ProjectDetailPage.tsx:24`.
  - The icon renders in small loader badges; confirm the displayed size is ≤ 128px in devtools, and use 512 instead if it's larger.
- [ ] **Step 4: Drop the unused font weight.** Remove `@import "@fontsource/prompt/300.css";`.
- [ ] **Step 5: Add the release profile** to `src-tauri/Cargo.toml`: `[profile.release]` with `lto = true`, `codegen-units = 1`, `strip = true`, `opt-level = 3`.
- [ ] **Step 6: Verify the build.**
  - `bun run build`: the entry `index-*.js` is < 700 KB, and the build prints no chunk-size warning for the entry.
  - `cargo check --lib`, `bun test` and `bun run check:bridge` are all clean.
- [ ] **Step 7: Smoke-test.**
  - First visit to each tab after startup shows no spinner, or a spinner for at most one frame.
  - The Explore datapack icon renders.
  - The settings dialog opens.
- [ ] **Step 8: Record sizes.** Add "After Task 6" build sizes to the results doc, and add a release binary size note if a `bun run tauri build` is run.
- [ ] **Step 9:** CHANGELOG, then commit with `perf(startup): lazy-load tabs, split vendor chunks, shrink assets, tune release profile`.

### Task 7: Wrap-up

- [ ] **Step 1: Results summary.** Add a top section to the results doc comparing baseline with final, per success criterion from spec §1. Mark each as met or not met, with actual numbers.
- [ ] **Step 2: Sync `CLAUDE.md`:**
  - §2 new files;
  - §4.1 `devPerfReport`;
  - §6 `perfStats`/`tabKeepAlive` tests;
  - §7 bench command;
  - §9 gotcha: "ModPack/Explore are kept mounted; gate shell-state effects on `isActive` / `useTabActive()`".
- [ ] **Step 3: Final checks.** `cargo check --lib`, `bun test`, `bun run check:bridge` and `bun run build`.
- [ ] **Step 4:** Commit with `docs(perf): results summary and CLAUDE.md sync`.
