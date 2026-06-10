# ml-client Electron Layer Readability Refactor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Make `src/electron/**` readable for a new contributor by splitting every 1,000+ line file into single-responsibility modules, deleting the dead `minecraft-java-core` dependency, and adding sparse English comments only where logic is non-obvious.

**Architecture:** Pure mechanical extraction — move functions into new sibling modules, keep public entry points (`registerXxxHandlers`, `launchGameRust`, `preInstallInstance`) as thin composition roots so no IPC channel name or renderer-facing API changes. The existing SizeGuard tests are the TDD vehicle: lower the line cap first (test fails), extract until it passes.

**Tech Stack:** Electron main process (TypeScript, bundled with esbuild), bun test, `bun run typecheck` (astro check + tsc).

**Scope note:** The stalled **UI component** refactor (`docs/refactor-baseline.md`, plan `ml-client-stateless-brook.md`) is a separate track — do not mix it into these commits.

**Verification commands (used in every task):**

```bash
cd e:\mlauncher\ml-client
bun test               # all regression + size-guard tests
bun run typecheck      # astro check + tsc --noEmit
bun run electron:build # esbuild bundles main + preload
```

---

## Baseline (2026-06-10)

| File | LOC | Worst offender inside |
|---|---:|---|
| `src/electron/MinecraftRun/rustLauncher.ts` | 1,847 | `launchGameRust` is ONE ~884-line function (L704–1588) |
| `src/electron/ipc/auth-handlers.ts` | 1,453 | ~20 `ipcMain.handle` in one register function |
| `src/electron/ipc/instance-pack-handlers.ts` | 1,340 | 10 handlers |
| `src/electron/cloud-instances.ts` | 1,335 | `syncServerMods` is ~1,020 lines (L315–1335) |
| `src/electron/ipc/utility-handlers.ts` | 1,292 | Java install/detect handlers L351–1118 |
| `src/electron/modpack-installer.ts` | 1,049 | |
| `src/electron/modrinth.ts` | 1,017 | |

Existing size-guard caps: rustLauncher 1850, cloud-instances 1500, instance-handlers 1500.
Comment density ~1–2% — the problem is **missing** explanation, not too much. Comments added must be English, concise, non-obvious-only (see team feedback convention).

---

### Task 1: Confirm green baseline

**Step 1:** Run `bun test` — expected: all pass. If anything fails, STOP and report; do not refactor on a red baseline.
**Step 2:** Run `bun run typecheck` — expected: 0 errors.
**Step 3:** Create branch: `git checkout -b refactor/electron-readability`

### Task 2: Remove dead dependency `minecraft-java-core`

It is in `package.json` and the esbuild `--external` flag but imported nowhere in `src/`.

**Step 1:** Verify: `grep -rn "minecraft-java-core" src/` → expected: no matches.
**Step 2:** Modify `package.json`: remove `"minecraft-java-core": "^3.4.3"` from dependencies; remove `--external:minecraft-java-core` from the `electron:build` script.
**Step 3:** Run `bun install`, then `bun run electron:build` — expected: bundle succeeds.
**Step 4:** Run `bun test` — expected: pass (note `RustBridgeMigration.test.ts` may assert on this — read it first; if it asserts the dep is gone, even better).
**Step 5:** Commit: `chore: drop unused minecraft-java-core dependency`

### Task 3: rustLauncher.ts — extract Java runtime module

**Files:**
- Create: `src/electron/MinecraftRun/javaRuntime.ts`
- Modify: `src/electron/MinecraftRun/rustLauncher.ts`
- Modify: `src/electron/MinecraftRun/RustLauncherSizeGuard.test.ts`

**Step 1 (failing test):** Lower the cap in `RustLauncherSizeGuard.test.ts` from 1850 → **1530** (revised from 1250: only ~326 lines actually move in this task; the rest of L11–639 is Task 4 scope), delete the stale "should be refactored" note. Run `bun test MinecraftRun` → expected FAIL.
**Step 2:** Move to `javaRuntime.ts` (exact symbols, currently rustLauncher.ts L11–639): `JAVA_DISCOVERY_CACHE_TTL_MS`, `JAVA_MAJOR_CACHE_TTL_MS`, `MAX_JAVA_*_CACHE`, `javaPathSelectionCache`, `javaMajorVersionCache`, `getRequiredJavaVersion`, `addBoundedCacheEntry`, `getJavaMajorVersion`, `getJavaPath`. Export what rustLauncher needs; import them back.
**Step 3:** Run `bun test` + `bun run typecheck` → expected PASS (size guard now passes too).
**Step 4:** Add size guard for the new file (copy the existing guard pattern, cap **700**).
**Step 5:** Commit: `refactor: extract Java runtime discovery from rustLauncher`

### Task 4: rustLauncher.ts — extract manifest/assets/natives helpers

**Files:**
- Create: `src/electron/MinecraftRun/versionManifest.ts` — `getManifestCachePath`, `getVersionManifestCached`, `loadVersionJson`, `VERSION_MANIFEST_CACHE_TTL_MS`
- Create: `src/electron/MinecraftRun/nativesCache.ts` — `NativeExtractionMeta`, `computeNativeFingerprint`, `hasNativeBinary`, `canReuseExtractedNatives`, `saveNativeExtractionMarker`
- Create: `src/electron/MinecraftRun/assetCheck.ts` — `getMissingAssetDownloadsFromIndex`, `AssetIndexData`, `RESOURCES_URL`
- Small shared helpers (`readJsonFileSafe`, `fileExists`, `yieldToEventLoop`, `logPerfStep`) → `src/electron/MinecraftRun/fsUtils.ts`

**Steps:** Same TDD loop as Task 3 — lower rustLauncher cap 1530 → **1255** first, extract, `bun test` + `typecheck`, commit: `refactor: split manifest/natives/asset helpers out of rustLauncher`

### Task 5: Decompose the 884-line `launchGameRust` function

Highest-value, highest-care task. Read the whole function first; it almost certainly has sequential phases (resolve version → ensure Java → download libs/assets via native module → extract natives → build classpath/args → spawn → wire callbacks/telemetry).

**Step 1:** Read L704–1588, write down the phase boundaries as comments in place (this is the map for the extraction).
**Step 2:** Extract **pure** helpers first (no fs/process side effects — e.g. arg/classpath assembly, alongside the existing `redactLaunchArgs`) into `src/electron/MinecraftRun/launchArgs.ts`.
**Step 3 (new unit tests):** Write `launchArgs.test.ts` covering the extracted pure functions (memory args, classpath separator per platform, token redaction). These are the first real unit tests for launch logic — keep them.
**Step 4:** Extract side-effecting phases into named `async function`s in rustLauncher.ts itself (same file is fine — readability goal is named phases, not more files). `launchGameRust` body should end ≤ ~150 lines of phase calls.
**Step 5:** `bun test` + `typecheck` + manually launch a game once via `bun run dev` if possible. Lower cap 1255 → **1100**.
**Step 6:** Commit: `refactor: break launchGameRust into named phases`

### Task 6: Split `auth-handlers.ts` (1,453) by domain

**Files:**
- Create: `src/electron/ipc/auth/session-handlers.ts` — `auth-logout`, `auth-get-session`, `auth-is-logged-in`, `auth-refresh-token`, identity sync helpers (`getCatIDDisplayName`, `getCatIDSessionUuid`, `syncCatIDSessionIdentity`)
- Create: `src/electron/ipc/auth/window-handlers.ts` — `open-auth-window`, `close-auth-window` (the BrowserWindow construction at L324–440)
- Create: `src/electron/ipc/auth/device-code-handlers.ts` — `auth-device-code-start` + polling (L444–889)
- Create: `src/electron/ipc/auth/password-handlers.ts` — `auth-forgot-password`, OTP/registration handlers (L918–1275)
- Create: `src/electron/ipc/auth/http.ts` — `fetchWithRetry`, `parseRetryAfterMs`, `fetchOAuthConfig`
- Modify: `auth-handlers.ts` → keep only `registerAuthHandlers` calling the four `registerXxx` functions. Target ≤ 100 lines.

**Steps:** Add a size guard test for `auth-handlers.ts` cap **150** FIRST (fails), extract one module per commit (4 commits), `bun test` + `typecheck` between each. **Do not rename any IPC channel string.**
Commits: `refactor: extract auth session/window/device-code/password handlers`

### Task 7: Split `utility-handlers.ts` (1,292) — Java management out

**Files:**
- Create: `src/electron/ipc/java-handlers.ts` — `auto-detect-java`, `detect-java-installations`, `test-java-execution`, `install-java`, `delete-java`, `browse-java` + helpers `getNativeJavaModule`, `normalizeJavaInstallations` (bulk is L351–1118)
- Create: `src/electron/ipc/minecraft-profile-cache.ts` — the profile cache helpers (L93–196)
- Modify: `utility-handlers.ts`, register new module in `src/electron/ipc/index.ts`

**Steps:** Size guard for utility-handlers cap **600** first → fails → extract → pass → commit: `refactor: extract Java management IPC handlers`

### Task 8: `cloud-instances.ts` — decompose ~1,020-line `syncServerMods`

Same recipe as Task 5: read it, mark phases, extract pure diff/compare helpers into `cloud-sync-utils.ts` (already exists, 673 lines — if it would exceed ~900, create `cloud-sync-mods.ts` instead) with unit tests for the pure parts. Watch out: `CloudSyncListCompareCache.test.ts` and `CloudSyncLocalModsNativeBridge.test.ts` already pin some behavior — read them first.
Lower `CloudInstancesSizeGuard` cap 1500 → **900**.
Commit: `refactor: break syncServerMods into named phases`

### Task 9: Split `instance-pack-handlers.ts` (1,340)

10 handlers. Group by lifecycle: pack install/update vs pack export vs pack metadata. Create 2–3 modules under `src/electron/ipc/`, same size-guard-first TDD loop, cap the remainder at **400**.
Commit: `refactor: split instance pack handlers by lifecycle`

### Task 10: Comments + module headers pass

For every file created/touched above:
- 1–3 line header comment: what this module owns, what it deliberately does not.
- Inline comments ONLY at non-obvious constraints (cache TTL rationale, platform quirks, ordering requirements). English, concise, no AI filler, no "this function does X" narration.
- No behavior changes in this commit — reviewable as comment-only diff.
Commit: `docs: add module headers and constraint comments to electron layer`

### Task 11: Global guard + baseline update

**Step 1:** Create `src/electron/ElectronLayerSizeGuard.test.ts`: walk `src/electron/**/*.ts` (exclude `*.test.ts`), assert no file exceeds **1,000** lines. This subsumes future regressions without per-file tests.
**Step 2:** Update `docs/refactor-baseline.md` with a new "Electron layer" section mirroring the table above + new numbers.
**Step 3:** Full gate: `bun run ci:check` — expected: pass.
**Step 4:** Commit: `test: add electron layer global size guard`

---

## Appendix: library replacement evaluation (decided, not tasks)

- **Custom Rust launcher**: KEEP. The team deliberately migrated off `minecraft-java-core` (see `RustBridgeMigration.test.ts`); going back is a rewrite, not a refactor. Task 2 just deletes the leftover dependency.
- **`discord-rpc`, `electron-updater`**: already third-party. Nothing to do.
- **`modrinth.ts` / `curseforge.ts`**: thin REST wrappers; no maintained library is a clear win. Revisit only if they grow.
- **Future candidate (not now, YAGNI):** `zod` for validating IPC payloads at the main-process boundary — would catch renderer/main drift, but adds a dependency; decide after the split makes payload shapes visible.

## Out of scope

- UI component refactor (resume `docs/refactor-baseline.md` plan separately)
- `modpack-installer.ts` / `modrinth.ts` (~1,000 LOC each, just under threshold — global guard from Task 11 will hold the line)
- Any behavior, IPC channel, or API change
