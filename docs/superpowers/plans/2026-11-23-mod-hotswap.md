# Experimental Mod Hotswap (Phase A: platform + tier 0/3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the admin toggle, kill switch, launcher watch-and-stage loop and a hotswap agent that does tier 0 (live resource reload) and tier 3 (staged for next launch), plus the Fabric/Quilt spike that gates tiers 1–2.

**Architecture:** A D1 column is the source of truth for the toggle and is mirrored into the published R2 pack manifest as `experimental.hotswap`; launchers poll that manifest during play, stage changed files, and talk to a separate `reality-hotswap.jar` agent through JSON files in a per-session folder. Tiers 1–2 (class redefinition, live add/remove) are **not** in this plan; they get their own plan after Task 12's spike report.

**Tech Stack:** API: Hono + Drizzle on Cloudflare Workers (D1, R2), `bun:test`. Portal: Nuxt 4 + Vue, `bun:test`. Launcher: Rust + Tauri v2, `cargo test`; React 19 + Zustand frontend. Agent: Java 8 target, Maven, ASM 9.7.1 shaded, JUnit 5.

**Spec:** `docs/superpowers/specs/2026-11-23-mod-hotswap-design.md` (read it first).

## Global Constraints

- Clean-room: never read or port code or design details from `dearIrene/hotwire-public`; do not read the Hotwire paragraphs in `research_notes/Minecraft launcher mod hotswapping/loader_internals_and_prior_art.md`.
- Hotswap is off by default at every level; with it off, the JVM args and files written at launch must be identical to today's.
- Old launchers must keep working: only add optional JSON fields; never change existing fields' type or meaning (`mods[]`, `modpackUrl`, `version`).
- Manifest field: `experimental: { hotswap: boolean }`; missing means `false`.
- D1 column: `hotswap_enabled INTEGER NOT NULL DEFAULT 0`; Drizzle `hotswapEnabled: integer("hotswap_enabled", { mode: "boolean" }).notNull().default(false)`.
- Kill switch key: `APP_SETTING_KEYS.HOTSWAP_GLOBALLY_DISABLED = "hotswap_globally_disabled"`, value `"true"` | `"false"`.
- Poll interval: 60 s, with `If-None-Match`.
- Session dir: `<instance>/.reality/hotswap/<session-id>/`; staging: `<instance>/.reality/staging/<version>/`; channel files `offer.json`, `apply.json`, `status.json`, `result.json`, all `schema: 1`, written temp + rename, unknown fields ignored.
- JVM args added only when enabled, after the branding agent args: `-javaagent:<mc dir>/agent/reality-hotswap.jar`, `-Dreality.hotswap=<session dir>`, `-Dreality.hotswap.tiers=<comma list>`, `-Dreality.hotswap.names=<properties path>`.
- Every flag must be accepted by Java 8–25 (CLIENT `CLAUDE.md` §3.4). Agent: no hard-coded obfuscated names; injected/reflective calls go through java.base only (CLIENT `CLAUDE.md` gotcha 17).
- Never delete or overwrite a loaded jar during play; never remove player or locked mods (CLIENT `CLAUDE.md` gotcha 23).
- Header on all launcher API requests: `X-Launcher-Version: <CARGO_PKG_VERSION>`.
- Client repo pre-commit: `cargo check --lib`, `bun test`, `bun run check:bridge`, update `docs/CHANGELOG.md` (Unreleased), keep `CLAUDE.md` in sync. After agent edits: `bun run build:agent` and commit the jars.
- API/portal: one branch `feat/mod-hotswap` in each repo; do not deploy or run `db:migrate:prod` — the user does that.
- User-facing copy (English, with Thai added to `translations-th.ts` where the launcher has i18n):
  - Portal switch: "Enable live mod hotswapping (beta)"
  - Portal help: "Players on Reality Launcher vX+ will be prompted to apply pack updates live at the main menu. Content mods and most changes still need a restart. Fabric/Quilt 1.20.1/1.21.x get the most; Forge/NeoForge only reload resources." (`vX` = the launcher version this ships in; fill at release.)
  - Portal hints: "Publish a pack first", "Disabled by platform admin"
  - Launcher notifications: "Pack updated – apply now?" (Apply / Later), "Applied live", "Restart to apply", "Swap failed – will apply next launch"
  - Launcher setting: "Disable hotswap on this PC"

## Review Focus

1. **Toggle turned off while a player has an offer pending** → the Apply button disappears and an Apply click already in flight is refused by the agent. Tests: Task 7 `revoked_offer_clears_pending`, Task 10 `apply_after_revoke_is_refused`.
2. **API unreachable or 5xx during play** → the poll loop backs off (60 s → max 10 min), logs once per state change, and never affects the game. Test: Task 9 `poll_backs_off_on_errors`.
3. **Pack published twice before the player applies (v5 → v6 → v7)** → only v7 is offered; v6 staging is deleted. Test: Task 8 `newer_version_supersedes_staging`.
4. **Player-installed and locked mods** → never staged for removal or touched. Test: Task 8 `player_and_locked_mods_untouched`.
5. **Game or launcher exits mid-download** → a partial staging folder is never applied; next launch verifies every staged file's sha before moving, else falls back to the normal sync. Test: Task 8 `partial_staging_is_discarded`.

---

## Part 1 — API (`/mnt/data3rd/@project/catlab/reality-project/realitylauncher-api`)

### Task 1: Fix `assertCanManageInstance` member check

**Files:**
- Modify: `src/routes/modpack-mods.ts:77-103`
- Test: `src/routes/modpack-mods.permissions.test.ts` (create)

**Interfaces:**
- Produces: `assertCanManageInstance(db, user, instanceId)` unchanged signature; now admits any member row with `userId === user.id && memberType === "admin"`.

- [ ] **Step 1: Branch.** `git switch -c feat/mod-hotswap main`
- [ ] **Step 2: Write the failing test.** Build an in-memory DB with `bun:sqlite` by applying every `drizzle/*.sql` file in name order (split on `--> statement-breakpoint`, as `src/lib/verified-username-migration.test.ts` does), wrap it with `drizzle-orm/bun-sqlite` and the schema. Seed one instance owned by `owner`, members `m1 (member)`, `m2 (admin)`, inserted in that order.
  - `it("lets a second-listed admin member manage")` → `assertCanManageInstance(db, {id:"m2", isAdmin:false}, id)` has `instance`, no `error`.
  - `it("rejects a plain member")` → for `m1`, `error.status === 403`.
  - `it("rejects a non-member")` → for `x`, `error.status === 403`.
- [ ] **Step 3: Run** `bun test src/routes/modpack-mods.permissions.test.ts` → the `m2` case FAILS.
- [ ] **Step 4: Implement.** Change the member query's `where` to `and(eq(instanceMembers.instanceId, instanceId), eq(instanceMembers.userId, user.id), eq(instanceMembers.memberType, "admin"))` and admit when a row exists.
- [ ] **Step 5: Run** the test → PASS. Run `bunx tsc --noEmit -p .` → no new errors in `modpack-mods.ts`.
- [ ] **Step 6: Commit** `fix(pack): check the calling user's own membership in assertCanManageInstance`.

### Task 2: Column, manifest flag and publish

**Files:**
- Create: `drizzle/0031_instance_hotswap.sql`
- Modify: `src/db/schema.ts` (instances table, `APP_SETTING_KEYS`), `src/lib/pack-v2.ts:369-425` (`ClientManifest`, new helper), `src/routes/pack.ts:449-514` (publish)
- Test: `src/lib/pack-v2.hotswap.test.ts`, `src/lib/instance-hotswap-migration.test.ts`

**Interfaces:**
- Produces: `ClientManifest.experimental?: { hotswap: boolean }`; `withHotswapFlag(m: ClientManifest, enabled: boolean): ClientManifest` (returns a copy; sets `experimental.hotswap`); `APP_SETTING_KEYS.HOTSWAP_GLOBALLY_DISABLED`.

- [ ] **Step 1: Failing tests.**
  - Migration test: apply 0031 to a minimal `instances` table → `SELECT hotswap_enabled` on an existing row is `0`.
  - `withHotswapFlag(m, true).experimental` equals `{hotswap:true}`; `withHotswapFlag(m, false)` → `{hotswap:false}`; input `m` is not mutated; every other key is deep-equal to `m`.
- [ ] **Step 2: Run** both → FAIL.
- [ ] **Step 3: Implement.** Migration `ALTER TABLE \`instances\` ADD \`hotswap_enabled\` integer DEFAULT 0 NOT NULL;`. Add the Drizzle field and the settings key. Add `withHotswapFlag`. In `publish()` write `withHotswapFlag(toClientManifest(...), instance.hotswapEnabled)` to `manifestKey`.
- [ ] **Step 4: Run** tests → PASS; `bunx tsc --noEmit -p .` clean for touched files.
- [ ] **Step 5: Commit** `feat(pack): hotswap_enabled column and experimental.hotswap manifest flag`.

### Task 3: Settings endpoints, kill switch, ETag

**Files:**
- Modify: `src/routes/pack.ts` (new routes; public manifest route at `:704-713`), `src/routes/instances.ts:155-185` (`computeInstanceMetadataETag`)
- Create: `src/lib/hotswap-manifest.ts`
- Test: `src/lib/hotswap-manifest.test.ts`

**Interfaces:**
- Consumes: `withHotswapFlag`, `APP_SETTING_KEYS.HOTSWAP_GLOBALLY_DISABLED` (Task 2).
- Produces:
  - `GET /instances/:id/pack/settings` (guarded) → `{ hotswapEnabled: boolean, globallyDisabled: boolean, hasPublished: boolean }`
  - `PATCH /instances/:id/pack/settings` (guarded) body `{ hotswapEnabled: boolean }` → same shape; 400 if body field not boolean; 409 `{error:"Publish a pack first"}` if no `manifestKey` object.
  - `killSwitchEtag(etag: string): string` → `etag` with `-hsoff` inserted before the closing quote (`"abc"` → `"abc-hsoff"`).
  - `overrideManifestBody(json: string): string` → manifest JSON with `experimental.hotswap = false`.

- [ ] **Step 1: Failing tests** for `killSwitchEtag` (quoted and `W/"…"` weak ETags) and `overrideManifestBody` (sets false when absent or true; keeps other fields).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement helpers**, then routes:
  - PATCH: `guard()` → update `hotswapEnabled` + `updatedAt` → read `manifestKey` object; if missing, 409 (column update rolled back by doing the R2 read first) → `put` the parsed manifest through `withHotswapFlag` with the same `httpMetadata`.
  - Public manifest route: read the kill-switch setting; when `"true"`, `get` without `onlyIf`, compute `killSwitchEtag(obj.httpEtag)`, return 304 if it equals `If-None-Match`, else return `overrideManifestBody(await obj.text())` with that ETag. When not `"true"`, keep today's code path unchanged.
  - Add `hotswapEnabled` to the field list hashed by `computeInstanceMetadataETag`.
- [ ] **Step 4: Run** `bun test src/lib/hotswap-manifest.test.ts` → PASS; `bunx tsc --noEmit -p .` clean.
- [ ] **Step 5: Manual check** with `bun run db:migrate` then `wrangler dev`: PATCH true → `GET /instances/:id/pack/manifest` shows `experimental.hotswap: true` and a new ETag; repeat with the ETag → 304; set the kill switch row to `"true"` → body shows `false`, ETag ends `-hsoff"`.
- [ ] **Step 6: Commit** `feat(pack): hotswap settings endpoint and global kill switch`.

## Part 2 — Portal and admin

### Task 4: Pack tab switch (management) and kill switch (admin)

**Files:**
- Modify: `/mnt/data3rd/@project/catlab/reality-project/realitylauncher-management/app/lib/pack-api.ts:121-230`, `app/components/pack/SettingsTab.vue`
- Create: `app/lib/hotswap-switch.ts`, `app/lib/hotswap-switch.test.ts`
- Modify: `/mnt/data3rd/@project/catlab/reality-project/realitylauncher-admin` settings page that edits `maintenance_mode` (add a boolean row for `hotswap_globally_disabled`, same pattern)

**Interfaces:**
- Consumes: Task 3 endpoints.
- Produces: `api.getSettings(): Promise<PackSettings>`, `api.setSettings(p: { hotswapEnabled: boolean }): Promise<PackSettings>`, `type PackSettings = { hotswapEnabled: boolean; globallyDisabled: boolean; hasPublished: boolean }`; `hotswapSwitchState(s: PackSettings, canManage: boolean): { disabled: boolean; hint: "publish-first" | "platform-disabled" | null }`.

- [ ] **Step 1: Branch** `git switch -c feat/mod-hotswap main` in management and admin.
- [ ] **Step 2: Failing test** `hotswapSwitchState`: unpublished → `{disabled:true, hint:"publish-first"}`; globally disabled → `{disabled:true, hint:"platform-disabled"}` (takes precedence over publish-first); `canManage:false` → `disabled:true, hint:null`; normal → `{disabled:false, hint:null}`.
- [ ] **Step 3: Run** `bun test app/lib/hotswap-switch.test.ts` → FAIL; implement; → PASS.
- [ ] **Step 4: UI.** In `SettingsTab.vue` add an "Experimental" `<section>` after game version with the switch and help copy from Global Constraints; load with `api.getSettings()` on mount; on change call `api.setSettings` immediately (not the draft), revert the switch and toast `errorText(e)` on failure.
- [ ] **Step 5: Admin.** Add the `hotswap_globally_disabled` toggle labelled "Disable hotswap for all instances".
- [ ] **Step 6: Verify** `nuxt dev` against local API: switch disabled before publish, works after; kill switch shows the badge.
- [ ] **Step 7: Commit** each repo: `feat(pack): experimental hotswap switch in Pack settings` / `feat(settings): global hotswap kill switch`.

## Part 3 — Launcher (`/mnt/data3rd/@project/catlab/realitylauncher-client`, branch `feat/mod-hotswap`)

### Task 5: `X-Launcher-Version` header

**Files:** Modify `src-tauri/src/http_client.rs:16-26`, plus the separate UA builders in `pack_v2.rs:320,352`, `download.rs:258`, `content.rs:246,999,1019` only where they hit `api.reality.catlabdesign.space`.
**Interfaces:** Produces `pub fn launcher_default_headers() -> reqwest::header::HeaderMap` in `http_client.rs`.

- [ ] **Step 1: Failing unit test** `launcher_headers_include_version` → map has `x-launcher-version` == `env!("CARGO_PKG_VERSION")`.
- [ ] **Step 2: Run** `cargo test --lib launcher_headers` → FAIL; implement via `ClientBuilder::default_headers`; → PASS.
- [ ] **Step 3: Commit** `feat(http): send X-Launcher-Version on API requests` (+ CHANGELOG).

### Task 6: Pure gate, tiers and allowlist (`hotswap.rs`)

**Files:** Create `src-tauri/src/hotswap.rs`, `src-tauri/resources/hotswap-allowlist.json` (`[]` for now); modify `src-tauri/src/lib.rs`.

**Interfaces:**
- Produces:
  - `pub enum Tier { Zero, One, Two, Three }` (serde as `0..3`)
  - `pub struct GateInput { manifest_flag: bool, pc_disabled: bool, crash_locked: bool, loader: LoaderType, mc: String, names_resolved: bool }`
  - `pub fn enabled_tiers(g: &GateInput) -> Vec<Tier>` — empty = launch unchanged.
  - `pub enum ChangeKind { Asset, Config, ShaderPack, ResourcePack, ModUpdate, ModAdd, ModRemove, Protected, Other }`
  - `pub fn classify(kind: ChangeKind, enabled: &[Tier], allowlisted: bool) -> Tier`
  - `pub fn change_kind(path: &str, prev_present: bool, now_present: bool) -> ChangeKind` (`.rlmod` or `.rl-protected/` → Protected; `mods/*.jar` → ModUpdate/Add/Remove; `config/`, `defaultconfigs/` → Config; `resourcepacks/` → ResourcePack; `shaderpacks/` → ShaderPack; other files under `assets/` or `kubejs/assets/` → Asset; everything else → Other).

- [ ] **Step 1: Failing tests:**
  - `off_when_flag_false`, `off_when_pc_disabled`, `off_when_crash_locked` → `[]`.
  - `fabric_1_20_1_gets_zero_only_in_phase_a` → `[Zero]` (Phase A never returns One/Two; leave a `const PHASE_A: bool = true` gate the tier-1 plan flips).
  - `forge_any_version_zero_when_names_resolved` → `[Zero]`; `names_resolved:false` → `[]`.
  - `classify`: Asset/Config/ResourcePack/ShaderPack with `[Zero]` → Zero; ModUpdate/ModAdd/ModRemove/Protected/Other → Three.
  - `change_kind` table for each path rule above.
- [ ] **Step 2: Run** `cargo test --lib hotswap::` → FAIL; implement; → PASS.
- [ ] **Step 3: Commit** `feat(hotswap): launch gate and change tiers`.

### Task 7: Channel files (`hotswap_channel.rs`)

**Files:** Create `src-tauri/src/hotswap_channel.rs`.

**Interfaces:**
- Produces (serde camelCase, `schema: 1`, `#[serde(default)]` on every optional):
  - `Offer { schema, version: u64, revoked: bool, changes: Vec<OfferChange>, staging: String }`; `OfferChange { path, tier: Tier, sha256, action: "add"|"update"|"remove" }`
  - `Apply { schema, version: u64 }` (written by the launcher when the player clicks Apply)
  - `Status { schema, state: "idle"|"ready"|"applying"|"busy-in-world", version: Option<u64> }` (agent)
  - `HotswapResult { schema, version, outcome: "applied"|"restart"|"failed"|"healthy"|"refused", applied: Vec<String>, restart: Vec<String>, error: Option<String> }` (agent)
  - `pub fn write_json<T: Serialize>(dir: &Path, name: &str, v: &T) -> Result<(), String>` (temp + rename)
  - `pub fn read_json<T: DeserializeOwned>(dir: &Path, name: &str) -> Option<T>` (missing/invalid → None)

- [ ] **Step 1: Failing tests:** round-trip each type; `unknown_fields_ignored`; `half_written_temp_not_read` (a `.tmp` file next to `offer.json` is ignored); `revoked_offer_clears_pending` (writing `Offer{revoked:true}` then reading yields `revoked == true` and `changes` empty).
- [ ] **Step 2: Run** → FAIL; implement; → PASS.
- [ ] **Step 3: Commit** `feat(hotswap): launcher–agent channel files`.

### Task 8: Running-mode staging in `pack_v2.rs`

**Files:** Modify `src-tauri/src/pack_v2.rs` (make `Manifest` `pub(crate)`, add `experimental`), create `src-tauri/src/hotswap_staging.rs`.

**Interfaces:**
- Consumes: `change_kind`, `classify` (Task 6), `Offer` (Task 7), existing `wants_from`, `needs_update`, `load_state`, `download_layer`, `extract_from_layer`, `write_atomic`.
- Produces:
  - `Manifest.experimental: Experimental { hotswap: bool }` with `#[serde(default)]`.
  - `pub async fn stage(cloud_id: &str, instance_dir: &Path, manifest: &Manifest, enabled: &[Tier]) -> Result<Offer, String>` — downloads changed files into `.reality/staging/<version>/<path>`, writes `staging/<version>/plan.json` (the `Offer` minus `revoked`), deletes older `staging/*` dirs, never writes outside `staging/`.
  - `pub fn apply_staged(instance_dir: &Path) -> Result<Option<u64>, String>` — called at launch **before** `pack_v2::sync`; for the newest staging dir verifies every file's sha256 against `plan.json`, moves files into place (removals delete only paths the previous `.reality/managed-mods.json` lists and that are not locked), updates `pack-state.json`, deletes the staging dir; any mismatch → delete the dir, return `Ok(None)` and let the normal sync run.

- [ ] **Step 1: Failing tests** (temp dirs, fake manifests, local file:// or in-memory layer fixtures):
  - `stages_only_changed_files` — unchanged entries not downloaded.
  - `newer_version_supersedes_staging` — staging v6 then v7 leaves only `staging/7`.
  - `player_and_locked_mods_untouched` — a player mod and a locked mod are absent from `plan.json` removals and still present after `apply_staged`.
  - `partial_staging_is_discarded` — truncate one staged file → `apply_staged` returns `Ok(None)` and removes the dir.
  - `apply_staged_moves_and_updates_state` — files end at their paths, `pack-state.json` version = 7.
  - `manifest_without_experimental_parses` — `experimental.hotswap == false`.
- [ ] **Step 2: Run** `cargo test --lib hotswap_staging pack_v2` → FAIL; implement; → PASS.
- [ ] **Step 3: Commit** `feat(hotswap): stage pack updates during play and apply them at next launch`.

### Task 9: Launch wiring, crash lock, watcher

**Files:** Modify `src-tauri/src/launcher.rs` (`ensure_agent_jar` pattern at `:1925-1939`, `branding_jvm_args` at `:2034`, spawn at `:700-800`), `src-tauri/src/mappings.rs`, `src-tauri/src/config.rs` (new `disableHotswap: bool`, default false); create `src-tauri/src/hotswap_watch.rs`.

**Interfaces:**
- Consumes: Tasks 6–8.
- Produces:
  - `const REALITY_HOTSWAP_JAR: &[u8] = include_bytes!("../resources/reality-hotswap.jar");` + `fn ensure_hotswap_jar(minecraft_dir) -> Result<PathBuf, String>` (same atomic-if-changed logic).
  - `fn hotswap_jvm_args(jar: &Path, session: &Path, tiers: &[Tier], names: &Path) -> Vec<String>` (exact four args from Global Constraints).
  - `pub fn resolve_hotswap_names(mc: &str, loader: LoaderType) -> Option<HotswapNames>` in `mappings.rs`, cached like tab schemes; `HotswapNames { minecraft_class, get_instance, get_connection, level_field, reload_resource_packs }` written as `hotswap-names.properties` in the session dir. `None` → `names_resolved:false`.
  - Crash lock file `<instance>/.reality/hotswap/crash-lock.json` `{ packVersion: u64 }`; `fn crash_locked(instance_dir, pack_version) -> bool`; `fn update_crash_lock(instance_dir, session_dir)` — sets the lock if the last `result.json` is `applied` with no later `healthy`.
  - `pub fn spawn_hotswap_watch(app, cloud_id, instance_dir, session_dir, enabled: Vec<Tier>, current_version: u64) -> WatchHandle` — loop every 60 s with `If-None-Match`; on errors back off ×2 up to 600 s; on 200 with `experimental.hotswap == false` write `Offer{revoked:true}`; on higher `version` call `stage` and write `offer.json`; emits Tauri event `hotswap-offer` `{instanceId, version, liveCount, restartCount}` and `hotswap-result` when `result.json` changes. Stops on `game-stopped`.

- [ ] **Step 1: Failing tests:** `hotswap_args_exact` (four strings, in order); `no_hotswap_args_when_tiers_empty` (launch arg list equals today's for a fixture instance); `crash_lock_set_when_applied_without_healthy`; `crash_lock_cleared_when_pack_version_changes`; `poll_backs_off_on_errors` (inject a fake fetcher returning Err three times → delays 60, 120, 240 s, then 200 resets to 60).
- [ ] **Step 2: Run** → FAIL; implement; → PASS.
- [ ] **Step 3: Wire launch:** in `instances_launch`, after the cloud sync call `apply_staged` first; then build `GateInput` (manifest flag from the synced manifest, `config.disable_hotswap`, `crash_locked`, `resolve_hotswap_names(...).is_some()`), and if `enabled_tiers` is non-empty create the session dir, write names, append `hotswap_jvm_args`, and start `spawn_hotswap_watch` next to `spawn_presence`. On game exit call `update_crash_lock` and delete session dirs older than the current one.
- [ ] **Step 4: Check `closeOnLaunch`:** confirm no code path exits the launcher process while the game runs; if one does, skip `exit` while a watch handle is live. Record the finding in the commit message.
- [ ] **Step 5: Commit** `feat(hotswap): launch gate, crash lock and manifest watcher`.

### Task 10: Launcher UI — prompt, result toasts, setting

**Files:** Modify `src/api.ts` (`onHotswapOffer`, `onHotswapResult`, `hotswapApply(instanceId, version)`), `src-tauri/src/main.rs` (register `hotswap_apply` command), `src-tauri/src/hotswap_watch.rs` (command writes `apply.json`), `src/components/LauncherApp.tsx` (listen + notification), `src/components/tabs/settingsTabs/` game/launcher settings tab (switch for `disableHotswap`), `src/i18n/translations-en.ts`, `translations-th.ts`, `src/types/launcher.ts`.

**Interfaces:**
- Consumes: `hotswap-offer`, `hotswap-result` events (Task 9); `Apply` (Task 7).
- Produces: Tauri command `hotswap_apply(instance_id: String, version: u64) -> Result<(), String>` — refuses with `"revoked"` if the current offer is revoked or its version differs.

- [ ] **Step 1: Failing tests:** Rust `apply_after_revoke_is_refused`, `apply_wrong_version_is_refused`; bridge parity in `src/api.test.ts` passes for the new methods.
- [ ] **Step 2: Run** `cargo test --lib hotswap_watch` and `bun test` → FAIL; implement; → PASS.
- [ ] **Step 3: UI:** a persistent notification "Pack updated – apply now?" with Apply/Later when `liveCount > 0`; "Restart to apply" when only restart items; result toasts per outcome copy. Apply is disabled unless `game-status.properties` says `state=menu` (show "Go to the main menu to apply").
- [ ] **Step 4: Run** `bun run check:bridge` → clean.
- [ ] **Step 5: Commit** `feat(hotswap): launcher prompt, results and per-PC opt-out` (+ CHANGELOG, CLAUDE.md module list and gotcha entry).

## Part 4 — Agent

### Task 11: `reality-hotswap.jar` with tier 0

**Files:** Create `agent-hotswap/pom.xml` (copy `agent/pom.xml` shading/relocation to `space.catlabdesign.reality.hotswap.shaded.asm`, `release` 8, reproducible timestamp, manifest `Premain-Class: space.catlabdesign.reality.hotswap.HotswapAgent`, `Can-Redefine-Classes: true`, `Can-Retransform-Classes: true`, JUnit 5 test scope); `agent-hotswap/src/main/java/space/catlabdesign/reality/hotswap/{HotswapAgent,Channel,Names,GameAccess,TierZero}.java`; tests under `agent-hotswap/src/test/java/...`. Modify `package.json` `build:agent` to also build and copy `agent-hotswap/target/reality-hotswap.jar` to `src-tauri/resources/reality-hotswap.jar`.

**Interfaces:**
- Consumes: channel schema (Task 7), names properties (Task 9).
- Produces:
  - `HotswapAgent.premain(String, Instrumentation)` — reads `reality.hotswap`, `reality.hotswap.tiers`, `reality.hotswap.names`; if any missing returns immediately; starts daemon thread `Reality-Hotswap` polling `apply.json` every 1 s.
  - `GameAccess.atMainMenu(): boolean` (reflective `getInstance()`, `getConnection()==null && level==null`), `GameAccess.onRenderThread(Runnable)` (via `java.util.concurrent.Executor.execute` on the Minecraft instance), `GameAccess.reloadResources(): CompletableFuture<?>`.
  - `TierZero.apply(Path instanceDir, Path staging, List<Change>)` — copies tier-0 files into place (temp + rename), then `reloadResources()`.
  - Writes `status.json` (`busy-in-world` when not at menu) and `result.json`: tier-0 items → `applied`, all others → `restart`; on any exception → `failed` with message; after reload completes without error for 10 s → `healthy`.

- [ ] **Step 1: Failing JUnit tests:** `channel_reads_apply_and_ignores_unknown_fields`, `channel_write_is_atomic` (no partial file visible under concurrent read), `tier_zero_copies_only_tier_zero_files`, `non_menu_yields_busy_in_world` (with a fake `GameAccess`), `exception_reports_failed`.
- [ ] **Step 2: Run** `mvn -q -f agent-hotswap/pom.xml test` → FAIL; implement; → PASS.
- [ ] **Step 3: Build** `bun run build:agent`; confirm `unzip -p src-tauri/resources/reality-hotswap.jar META-INF/MANIFEST.MF` shows both `Can-*` lines; confirm `reality-agent.jar` bytes are unchanged (`git diff --stat` shows no change to it).
- [ ] **Step 4: Manual game test** (record results in `docs/superpowers/specs/2026-11-23-mod-hotswap-results.md`): Fabric 1.20.1, Fabric 1.21.1, NeoForge 1.21.1, Forge 1.20.1 test instances with hotswap on — publish a pack changing one texture in a resource pack and one config → prompt appears at the menu → Apply → texture changes without restart, `result.json` `applied` then `healthy`; publish a mod-jar change → "Restart to apply", next launch has the new jar. Launch the same instance with the current released launcher → behaves as today.
- [ ] **Step 5: Commit** `feat(agent): reality-hotswap agent with tier 0 resource reload` (+ CHANGELOG, CLAUDE.md gotcha for the new agent and jar).

### Task 12: Fabric/Quilt spike for tiers 1–2 (throwaway code)

**Files:** Create `docs/superpowers/specs/2026-11-23-mod-hotswap-spike.md`; spike code only in a scratch branch `spike/hotswap-tier1`, never merged.

- [ ] **Step 1:** On Fabric 1.20.1 and 1.21.1 (and Quilt 1.20.1), in the hotswap agent on the spike branch, prove or disprove each, using only public Fabric Loader, Mixin and JDK sources:
  - S1. An `OriginalBytes` transformer registered first in `premain` sees each mod class and mixin target before Mixin/access wideners.
  - S2. Running stored bytes through Fabric's access-widener step and the active Mixin transformer's `transformClassBytes` reproduces the loaded bytes for an unchanged class (byte-equal or ASM-equivalent).
  - S3. A method-body change to a test mod's class plus its mixin targets applies via one `redefineClasses` batch from the render thread, 100 cycles, no heap growth (> 5 % after GC) or thread growth.
  - S4. Appending a test jar via Knot's add-code-source path and running its client entrypoint works for a client-only mod already on `-cp` and one not on `-cp`.
  - S5. Memory cost of `OriginalBytes` on a 150-mod pack (MB, compressed).
- [ ] **Step 2:** Write the spike report: pass/fail per item with evidence, exact API calls used, recommendation for the tier 1–2 plan.
- [ ] **Step 3: Commit** the report only on `feat/mod-hotswap`: `docs(hotswap): tier 1–2 feasibility spike results`.

---

## After this plan

Write a separate plan for tiers 1–2 (Planner, Applier, Health, in-game title-screen prompt, allowlist entries) from the spike report. Flip `PHASE_A` only in that plan.
