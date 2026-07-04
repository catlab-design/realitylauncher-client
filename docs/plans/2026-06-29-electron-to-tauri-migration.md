# Electron → Tauri Full Feature-Parity Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans (or subagent-driven-development) to implement this plan task-by-task. Each phase below is a milestone; expand the per-phase task lists into bite-sized TDD steps when you start that phase.

**Goal:** Bring `ml-client-new` (Tauri v2 + React + Rust) to full feature parity with the feature-complete Electron launcher `ml-client` (which becomes `ml-client-old`), then make Tauri the shipping client.

**Architecture (decided — user deferred backend choice):** Hybrid, **native-first**.
- **Rust Tauri commands** own everything touching the OS: filesystem, Minecraft launch/process, hashing, cloud-sync downloads, secure token storage, deep links, Discord RPC, window. This mirrors Electron's `native/` Rust crate + main-process modules.
- **React frontend** owns pure UI + ml-api REST calls that are public/stateless. **Authenticated ml-api calls** (anything sending the bearer token: instances, sync content, notifications, telemetry, reviews) go through thin Rust passthrough commands so the token never lives in the webview and CORS is bypassed.
- **Use official Tauri plugins** instead of hand-rolling: `tauri-plugin-updater`, `tauri-plugin-deep-link`, `tauri-plugin-dialog` (file pickers), `tauri-plugin-opener`, `tauri-plugin-single-instance`, `tauri-plugin-http` (for passthrough where convenient).
- **Events** (sync/install/launch progress, log lines) use Tauri's `emit`/`listen` to replace Electron's `webContents.send` + `ipcRenderer.on`.

**Tech Stack:** Tauri 2, Rust (reqwest, tokio, sha1/sha2, zip), React 18 + Vite + Tailwind 4, `@tauri-apps/api`.

**Source of truth for porting:** `../ml-client/src/electron/*` (logic) and `../ml-client/src/components/*` (UI). Filenames below are relative to repo root `e:\mlauncher`.

---

## Phase roadmap (ordered by dependency)

| # | Phase | Why this order |
|---|---|---|
| 0 | Project hygiene & rename finalize | Clean base before piling on code |
| 1 | Foundation: config, auth, window, types, bridge | Everything depends on auth + config |
| 2 | Core runtime: instances, Java, launch, live log | The launcher's reason to exist |
| 3 | Content: Modrinth + CurseForge, mods/packs, import/export | Needed before cloud sync (sync reuses download/hash) |
| 4 | Cloud sync + server instances (incl. 404 resilience) | The newest Electron feature; depends on 2+3 |
| 5 | Version/update reporting (ml-api `/launcher/latest`) + updater | Standalone; quick win |
| 6 | Social/integration: ServerMenu/Detail/reviews, notifications, server-status, Discord RPC, telemetry | Depends on auth + ml-api passthrough |
| 7 | Wardrobe (skins + 3D), i18n (th/en), settings parity | UI-heavy, lower risk |
| 8 | Packaging, CI, signing/updater feed, cleanup | Ship |

**Per-phase exit gate:** `cargo check` (or `cargo test`) green, `bun run build` green, app launches via `bun run tauri dev`, and the phase's feature manually verified against the Electron behavior. Commit at the end of every task.

---

## Phase 0: Project hygiene & rename finalize

**Files:**
- Modify: `ml-client-new/.gitignore` (create if missing)
- Modify: `ml-client-new/src-tauri/tauri.conf.json` (identifier/productName)
- Rename (blocked): `ml-client` → `ml-client-old`

**Step 1 — Finish the rename (when the editor releases the lock).**
`ml-client` is an embedded git repo currently held open by VSCode (Access denied on rename). Once the user closes it in VSCode / closes any terminal cwd'd into it:
```bash
git mv ml-client ml-client-old
```
Expected: clean rename; `git ls-files -s ml-client-old | head -1` shows mode `160000` gitlink.

**Step 2 — Stop tracking build artifacts.** `ml-client-new` currently commits `node_modules/` and `src-tauri/target/` (~8000 files). Add `.gitignore`:
```
node_modules/
dist/
src-tauri/target/
src-tauri/gen/schemas/
```
Then `git rm -r --cached node_modules src-tauri/target` and commit. Expected: tracked file count drops dramatically.

**Step 3 — Fix app identity** in `src-tauri/tauri.conf.json`: `productName: "Reality Launcher"`, `identifier: "net.catlab.reality-launcher"` (match Electron `appId`), window title `Reality Launcher`. Verify `bun run tauri dev` still boots.

**Step 4 — Commit.** `chore(tauri): finalize rename, ignore build artifacts, fix app identity`

---

## Phase 1: Foundation (config, auth, window, types, bridge)

Port from: `ml-client/src/electron/config.ts`, `auth.ts`, `auth-refresh.ts`, `window-bounds.ts`, `lib/constants.ts`, `types/launcher.ts`; UI `components/tabs/settingsTabs/AccountTab.tsx`.
Tauri targets: `src-tauri/src/config.rs`, `auth.rs`, `window.rs`, `src/types/launcher.ts`, `src/api.ts`.

**Tasks (each = TDD: failing test → minimal impl → pass → commit):**
1. **Shared types parity** — copy/reconcile `GameInstance`, `LauncherConfig`, `AuthAccount` into `ml-client-new/src/types/launcher.ts`; mirror as serde structs in Rust. Test: a Rust serde round-trip test for `LauncherConfig`.
2. **Config command** — `config_get`/`config_set` persist to the same on-disk shape Electron uses (so existing users' config is readable). Test: write→read returns identical struct; unknown keys preserved.
3. **Constants** — `API_URL = https://api.reality.catlabdesign.space` in one Rust module + one TS module. Test: assert equal across both (cspell/string test).
4. **Microsoft auth** — verify `login_microsoft` in `auth.rs` matches Electron's device/redirect flow + token persistence. Test: token expiry math (`expiresAt`) unit test.
5. **CatID + token refresh** — port `auth-refresh.ts` (`auth_refresh` command) and `/auth/session/me` resolution. Test: refresh-needed predicate.
6. **Bridge cleanup** — make `src/api.ts` only expose commands that exist in Rust; mark not-yet-ported ones as `throw new Error("not implemented in Tauri yet")` so missing features fail loudly, not silently. Test: a TS test asserting every `invoke('x')` name has a matching `#[tauri::command]` (parse both files).
7. **Window state** — port `window-bounds.ts` (remember size/pos) via Tauri window events. Manual verify.

**Exit gate:** log in with Microsoft, config persists across restart, window remembers bounds.

---

## Phase 2: Core runtime (instances, Java, launch, live log)

Port from: `electron/instances.ts`, `MinecraftRun/*` (`javaRuntime.ts`, `versionManifest.ts`, `nativesCache.ts`, `modLoaders.ts`, `rustLauncher.ts`, `fsUtils.ts`), `launcher.ts`; UI `ModPack.tsx`, `ModPackTabs/*`, `InstanceDetail.tsx`, `LiveLog.tsx`, `CreateInstanceModal.tsx`.
Tauri targets: `src-tauri/src/instances.rs`, `launcher.rs`, new `java.rs`, `version_manifest.rs`, `mod_loaders.rs`; events for progress + log.

**Tasks:**
1. Instances CRUD parity (already partly in `instances.rs`) — reconcile fields, icon handling, duplicate. Tests for create/list/delete/duplicate.
2. Java runtime: detect + auto-install Corretto per-arch (port `javaRuntime.ts` + `JavaVersionSelectionRegression` cases). Tests for version-selection logic.
3. Version manifest + natives cache (port `versionManifest.ts`, `nativesCache.ts`). Test: manifest URL/version resolution; cross-platform native targets (port `CrossPlatformNativeTargets.test.ts`).
4. Mod loaders: Forge / Fabric / NeoForge / Quilt install (port `modLoaders.ts`). Tests per loader argument-building.
5. Launch pipeline (port `rustLauncher.ts` + `launchPolicy.ts`): assemble classpath/JVM args, launch, track running instance, kill. Port `launchPolicy.test.ts`.
6. Live log streaming via Tauri events → `LiveLog.tsx`. Manual verify a real launch streams logs.

**Exit gate:** create a vanilla + a Fabric instance and launch Minecraft successfully; logs stream; kill works.

---

## Phase 3: Content (Modrinth + CurseForge, mods/packs, import/export)

Port from: `electron/modrinth.ts`, `curseforge.ts`, `curseforge-api.ts`, `content.ts`, `content-links.ts`, `modpack-installer.ts`, `modpack-exporter.ts`; UI `Explore.tsx`, `ExploreTabs/*`, `InstanceContentBrowser.tsx`.
Tauri targets: `src-tauri/src/modrinth.rs` (exists), new `curseforge.rs`, `content.rs` (exists), `modpack.rs`.

**Tasks:**
1. Modrinth parity: search/project/versions/game-versions + **download with redirect + statusCode-tagged errors** (port the resilient `downloadFile` incl. the new `statusCode` attachment). Tests for hash verify + error tagging.
2. CurseForge search/install (`curseforge_search` etc.). Tests for normalizer parity.
3. Install content into instance (mods/resourcepacks/shaders/datapacks) + enable/disable/delete. Tests.
4. Modpack import (.mrpack/CurseForge zip) + export. Tests for manifest parse/build.
5. Content browser UI wired to commands. Manual verify install+launch a mod.

**Exit gate:** search → install a mod from each provider → it loads in game.

---

## Phase 4: Cloud sync + server instances (newest Electron feature)

Port from: `electron/cloud-instances.ts`, `cloud-sync-utils.ts`, `ipc/instance-cloud-handlers.ts`, `ipc/instance-handlers.ts`; UI join/leave dialogs, ModPack cloud sync button.
Tauri target: new `src-tauri/src/cloud_sync.rs` + authenticated ml-api passthrough; progress events.

**Tasks (carry over the fixes just made in Electron):**
1. Authenticated ml-api passthrough commands: `GET /instances`, `GET /instances/:id`, `GET /instances/:id/content[?manifest=1]` with bearer + ETag/If-None-Match. Tests for header/ETag handling.
2. Manifest + metadata caching (`MANIFEST_CACHE_TTL_MS`, ETag) and `normalizeServerMods`. Tests port from `CloudSyncListCompareCache.test.ts`.
3. Sync engine: plan downloads (existence/size/hash check) → batch download → cleanup extras (mods/ only). Reuse Phase 3 download+hash. Tests for signatures (`buildServerModsListSignature` etc.).
4. **404 resilience parity:** skip files with permanent HTTP (400/401/403/404/410) or exhausted retries, collect `failedMods`, throw only if ALL fail. Test: partial-failure completes; total-failure throws.
5. Join/leave instance + import cloud instance; progress events to UI. Manual verify joining a server instance syncs and launches.

**Exit gate:** join a cloud instance, sync (including a deliberately-missing file → sync still completes), launch.

---

## Phase 5: Version/update reporting + updater

Port from: the just-added `ipc/update-handlers.ts` (`check-latest-version` → ml-api `/launcher/latest`) + `settingsTabs/UpdateTab.tsx` + `About.tsx`.
Tauri targets: `src-tauri/src/update.rs`, `tauri-plugin-updater`, `src/components/tabs/About.tsx` + `settingsTabs/UpdateTab.tsx`.

**Tasks:**
1. `check_latest_version` command: fetch `/launcher/latest`, semver-compare to `app.version()`, return `{updateAvailable, latest, releaseDate, changelog, downloadUrl}`. Tests for the semver compare (port the `compareVersions` cases).
2. Wire `tauri-plugin-updater` for in-app download/install; fall back to opening `downloadUrl`. Manual verify.
3. About + Update tabs show ml-api version. Manual verify.

**Exit gate:** Update tab reports the real latest from ml-api and can download.

---

## Phase 6: Social / integration

Port from: `ServerMenu.tsx`, `ServerDetailView.tsx`, `ServerItem.tsx`, `electron/server-status.ts`, `notifications.ts`, `ipc/notification-handlers.ts`, `discord.ts`, `telemetry.ts`.
Tauri targets: `server.rs`, `notifications.rs`, `discord.rs` (`discord-rich-presence` crate), `telemetry.rs`.

**Tasks:**
1. Server list/detail/reviews UI + ml-api passthrough. Port `ServerDetailSecurityRegression` cases.
2. Server status pinger. Test.
3. Notifications sync (announcements + invitations). Tests for invitation shape.
4. Discord RPC via `discord-rich-presence`. Manual verify.
5. Telemetry batch POST (`/telemetry/batch`) with `launcherVersion = app.version()`, queue + flush. Tests for batching/flush thresholds.

**Exit gate:** browse servers, see reviews, receive a notification, RPC shows, telemetry flushes.

---

## Phase 7: Wardrobe, i18n, settings parity

Port from: `Wardrobe.tsx`, `wardrobe/SkinPreview3D.tsx`, `i18n/translations-{th,en}.ts`, all `settingsTabs/*`.
Tauri targets: `src/components/tabs/Wardrobe.tsx`, `wardrobe/*`, `src/i18n/*`, `settingsTabs/*`.

**Tasks:**
1. Port i18n th/en dictionaries + `useTranslation`. Test: key parity between th/en (port `TranslationsSizeGuard`/`SettingsLanguageTab` ideas).
2. Skin upload/apply + 3D preview (three.js). Manual verify.
3. Remaining settings tabs (Account, Language, Update, Java, telemetry toggle, auto-update). Manual verify.

**Exit gate:** change skin, switch language, all settings tabs functional.

---

## Phase 8: Packaging, CI, cleanup

**Tasks:**
1. Tauri bundler config (Windows nsis/msi, macOS dmg per-arch x64+arm64 — carry the macOS per-arch lesson, Linux deb/rpm/AppImage). Build each.
2. Updater feed signing keys + `latest.json`/manifest publishing aligned with ml-admin/ml-api `/launcher/*`.
3. GitLab/GitHub CI: build + test (`cargo test`, `bun test`, `cargo check`). Port `check-release-workflow` intent.
4. Remove dead stubs in `api.ts`; delete unused POC assets; final `ml-client-old` archival note in repo README.

**Exit gate:** signed installers build in CI for all platforms; auto-update works end-to-end against ml-api.

---

## Risks & notes
- **Config compatibility:** keep the on-disk config schema readable so existing users migrate seamlessly.
- **Token security:** never expose the API bearer token to the webview — keep it in Rust (passthrough commands), unlike some current `api.ts` stubs.
- **Events vs IPC:** Electron progress used `webContents.send`; Tauri uses `emit` — keep the same payload shapes so UI port is mechanical.
- **`api.ts` is aspirational:** several stubs (curseforge, file pickers, RPC, notifications) have no Rust command yet — Phase 1 task 6 makes these fail loudly.
- **Don't delete `ml-client-old`** until Phase 8 ships and is verified; it's the reference + fallback.
