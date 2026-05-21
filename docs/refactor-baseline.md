# Refactor Baseline — ml-client

Captured at start of phased refactor (see `C:\Users\Sammy\.claude\plans\ml-client-stateless-brook.md`).
These numbers establish the starting state — every phase should move them down, never up.

## God components (LOC)

| Component | LOC | Size guard cap |
|---|---:|---:|
| `src/components/LauncherApp.tsx` | 1,284 | 1,300 |
| `src/components/LauncherAppShell.tsx` | 489 | 500 |
| `src/components/tabs/InstanceDetail.tsx` | 1,529 | 1,550 |
| `src/components/tabs/InstanceContentBrowser.tsx` | 1,295 | 1,300 |
| `src/components/tabs/ModPack.tsx` | 1,165 | 1,200 |
| `src/components/tabs/Explore.tsx` | 1,025 | 1,100 |
| `src/components/tabs/ModPackTabs/InstanceSettingsModal.tsx` | 1,318 | 1,350 |

Target per plan: each refactored component ≤ 300 LOC (shell) after Phase 5–7.

## Props drilling

- `LauncherAppShellProps` interface fields: 55 (cap 60)
- Target after Phase 6: ≤ 10

## API layer

- `window.api` references in `src/components/**`: **240**
- `(window.api as any)` casts in `src/components/**`: **80**
- Target after Phase 8: **0** (everything routed through `src/api/` wrapper)

## Inline styles

- `style={{` occurrences in `src/components/**`: **1,613**
- Target after Phase 3 (folder-by-folder migration to CSS vars): substantially reduced; absolute target tied to drop-`colors`-prop guards per leaf folder.

## Existing guardrails kept

- `bun test` runs 34 `.test.ts` regression files
- `bun run ci:check` adds: asar-write check, release-workflow check, build, cargo check
- Newly added scripts: `bun run typecheck` (astro check + tsc --noEmit), `bun run test`

## How to refresh these numbers

```
cd ml-client
wc -l src/components/LauncherApp.tsx src/components/LauncherAppShell.tsx \
      src/components/tabs/InstanceDetail.tsx \
      src/components/tabs/InstanceContentBrowser.tsx \
      src/components/tabs/ModPack.tsx \
      src/components/tabs/Explore.tsx \
      src/components/tabs/ModPackTabs/InstanceSettingsModal.tsx

grep -rE "window\.api" src/components/ | wc -l
grep -rE "\(window\.api as any\)" src/components/ | wc -l
grep -rE "style=\{\{" src/components/ | wc -l
```
