# Runtime Responsiveness & Startup Performance — Design

- **Date:** 2026-10-18
- **Branch:** `perf/runtime-responsiveness`
- **Approach:** A — measure first, targeted fixes, re-measure

## 1. Goal

Make the launcher feel snappier in use — primarily **tab switching** and
**scrolling / animations** — then improve **startup**. The user does not know
of other slow spots, so the work starts by measuring.

### Constraints
- No visual or behavioral change, except: repeated list cards lose
  `backdrop-blur` in favor of a slightly more opaque background.
- Tab transition style (fade-out, fade + 8px rise) is preserved.
- Must hold up on Linux (WebKitGTK — worst case for blur/repaint) and Windows (WebView2).
- Pre-commit checklist from `CLAUDE.md` applies to every commit
  (`cargo check --lib`, `bun test`, `bun run check:bridge`, `docs/CHANGELOG.md`, `CLAUDE.md` sync).

### Success criteria
| Metric | Target |
|---|---|
| Renders of the active tab during a 3s install-progress burst | ≥ 80% fewer than baseline |
| Long-task total (≥50ms) over the scripted tab-switch cycle | lower than baseline (report actual %) |
| Dropped frames (>20ms) while scrolling Explore / Servers | lower than baseline (report actual %) |
| Initial JS entry chunk | 2.0 MB → < 700 KB (minified) |
| Checks | `cargo check --lib`, `bun test`, `bun run check:bridge` all green |

Baseline and after numbers are the median of 3 bench runs and are recorded in
`docs/superpowers/specs/2026-10-18-runtime-perf-results.md`.

## 2. Baseline findings (from read-only exploration)

- `LauncherApp.tsx` subscribes to whole stores (`useProgressStore()`,
  `useConfigStore()`, `useAuthStore()`, `useUiStore()`); 14 such whole-store
  subscriptions exist app-wide. Install progress is throttled to ~120ms
  (`useGameEvents.ts`), so the root and every child re-render ~8×/s during
  install/sync.
- `LauncherAppShell.tsx:626` remounts the tab on every switch
  (`AnimatePresence mode="wait"` keyed by `contentTab`); tabs refetch on mount.
  Tab props include fresh objects/callbacks each render; only one component in
  the app uses `React.memo`.
- 66 `backdrop-blur` usages; `ServerItem.tsx` (8) and `serverStory.tsx` (6) are
  rendered repeatedly in lists.
- Rainbow mode writes `--secondary-color` on `:root` every 100ms from JS
  (`LauncherApp.tsx:1254`) → whole-document style recalc 10×/s.
- `CalendarWidget.tsx:221` re-renders every 1s.
- 16 infinite CSS/framer animations; none pause when the window is hidden.
- `LauncherAppLazyTabs.tsx` imports every tab eagerly; `preloadTabs()` is empty.
  Single JS chunk: 1,998 KB (563 KB gzip).
- `src/assets/modpack_icon.png` ships at 1.47 MB.
- Prompt weight 300 is loaded but `font-light` is never used.
- `src-tauri/Cargo.toml` has no `[profile.release]`.

## 3. Measurement harness

### 3.1 `src/lib/perfProbe.ts` (dev-only)
Tree-shaken out of production: every entry point is guarded by
`import.meta.env.DEV`.
- `PerfTab` component wrapping `React.Profiler` (id = tab name) → render count +
  summed `actualDuration` per id.
- `PerformanceObserver({ type: 'longtask' })` when supported → count + total ms.
  WebKitGTK may not support `longtask`; fallback is a rAF-gap sampler that
  counts gaps ≥ 50ms as long tasks.
- rAF frame sampler active during a named phase → frame count, frames > 20ms,
  p95 frame time.
- `phase(name, fn)` collects metrics per phase.

### 3.2 Scripted bench (`src/lib/perfBench.ts`)
Runs only when `import.meta.env.DEV && import.meta.env.VITE_PERF_BENCH === '1'`,
starting 3s after the main window enters main mode. Phases:
1. **tab-cycle** — `home → servers → modpack → explore → wardrobe → home`, ×3,
   via `useUiStore.getState().setActiveTab`, waiting 600ms per tab.
2. **scroll-explore / scroll-servers** — scroll the shared `<main>` scroller
   top → bottom → top in 40 steps of rAF.
3. **progress-burst** — calls `useProgressStore.getState().setInstallProgress`
   with synthetic progress every 120ms for 3s, then sets it back to `null`.
   It never touches IPC or install state.

The bench reads local launcher data only. It never installs, launches, or writes config.

### 3.3 Reporting
New Rust command `dev_perf_report(report: serde_json::Value)` in
`src-tauri/src/telemetry.rs`. It prints `PERF_REPORT <json>` to stdout. In
non-debug builds it is a no-op returning `Ok(())` so the bridge parity test
stays uniform. It is exposed in `api.ts` as `devPerfReport`. After reporting,
the bench calls `window_close` only when `VITE_PERF_BENCH_EXIT === '1'`,
so runs can be scripted:

```
VITE_PERF_BENCH=1 VITE_PERF_BENCH_EXIT=1 bun run tauri dev | grep PERF_REPORT
```

## 4. Fixes

### 4.1 Re-render chain
- Replace whole-store hooks with selectors (`useStore(s => s.x)`, or
  `useShallow` for grouped picks) in all 14 sites.
- `installProgress` / `isInstalling` are read only by components that display
  them (progress panel in `LauncherAppShell`, install indicators). They are no
  longer read in `LauncherApp` render scope. Handlers that need them use
  `useProgressStore.getState()`.
- Stabilize tab props in `LauncherApp` / `LauncherAppShell`: `useCallback` for
  handlers, `useMemo` for `colors`. `config` comes from the selector so it is
  referentially stable unless config changes.
- Wrap tab components (`Home`, `ServerMenu`, `ModPack`, `Explore`, `Wardrobe`,
  `About`, `AdminPanel`) in `React.memo`.

### 4.2 Keep-alive for heavy tabs
- `ModPack` and `Explore` stay mounted once visited. When inactive they are
  rendered inside a `hidden` wrapper (`display: none`), outside
  `AnimatePresence`. When active they get the same `page` fade-in variant.
  Other tabs keep the current remount behavior.
- Each kept-alive tab gets an `isActive` prop (`ModPack` already has one, today
  hardwired to `true`). Effects that touch shared shell state —
  `setFullBleed`, `setImmersive`, the shared `<main>` scroll listener
  (`ModPack.tsx:798-820`, `ProjectDetailPage.tsx:111-115`) — run only while
  `isActive` and clean up when it turns false, instead of only on unmount.
- The scroller is reset to top on every switch as today.
- Fallback: if a tab shows a state bug under keep-alive that cannot be fixed
  cleanly, revert that tab to remount behavior and record it in the results doc.

### 4.3 Paint / animation cost
- `ServerItem.tsx`, `serverStory.tsx`: drop `backdrop-blur-*` on repeated
  cards and raise background alpha (~+0.15) to keep visual weight. Panels and
  overlays keep blur.
- Rainbow mode: replace the JS interval with a CSS `@keyframes` animating the
  already-registered `@property --secondary-color`, toggled by a
  `data-rainbow` attribute on `<html>`.
- Global `visibilitychange` → `data-hidden` on `<html>`. Infinite CSS animations
  get `animation-play-state: paused` under `[data-hidden]`. The Home news
  autoplay and `CalendarWidget` timers skip ticks while `document.hidden`.
- `CalendarWidget`: tick once per minute, aligned to the minute boundary,
  unless seconds are displayed.
- List rows in Explore results and `InstanceContentBrowser` get
  `content-visibility: auto` with `contain-intrinsic-size` matching the row
  height.

### 4.4 Startup
- `LauncherAppLazyTabs.tsx`: real `React.lazy` for ServerMenu, ModPack,
  Explore, Wardrobe, About, AdminPanel, SettingsDialog. Home stays eager.
  `preloadTabs()` triggers those imports in `requestIdleCallback`
  (fallback `setTimeout(1500)`) after main mode, so first visits do not show the spinner.
- `vite.config.ts`: `manualChunks` → `vendor-react`, `motion` (framer-motion),
  `gsap`, `markdown` (react-markdown + remark/rehype), `skinview3d`.
- `modpack_icon.png` → WebP at the largest displayed size ×2 (target < 80 KB).
  All imports are updated.
- Drop `@fontsource/prompt/300.css`.
- `src-tauri/Cargo.toml`:
  ```toml
  [profile.release]
  lto = true
  codegen-units = 1
  strip = true
  opt-level = 3
  ```
  (`panic = "unwind"` kept.)

## 5. Testing & verification

1. Implement the harness (§3) first; record the baseline on the untouched code.
2. Each fix group (4.1 → 4.4) is its own commit; bench after 4.1, 4.2 and 4.3
   to attribute gains.
3. `bun test` — the bridge parity test covers the new `devPerfReport` /
   `dev_perf_report`.
4. Manual smoke in `bun run tauri dev`, covering:
   - every tab;
   - Home and ServerDetail immersive title bar;
   - ModPack list ↔ detail, coming back to ModPack after visiting Explore (keep-alive state);
   - rainbow mode;
   - settings dialog;
   - install progress panel.
5. Bundle size from `bun run build` output, before and after.

## 6. Out of scope
- Splitting `LauncherApp.tsx` / `InstanceDetail.tsx` structurally (approach B).
- List virtualization libraries.
- Rust download/launch performance.
- Changes to the progress throttle interval itself.
