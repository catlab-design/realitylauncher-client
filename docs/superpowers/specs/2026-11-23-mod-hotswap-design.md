# Experimental Mod Hotswap — Design

**Date:** 2026-11-23
**Status:** Approved in brainstorming, awaiting spec review
**Repos touched:** `realitylauncher-client` (agent + launcher), `../reality-project/realitylauncher-api`, `../reality-project/realitylauncher-management`
**Research:** `../../../../reports/Minecraft launcher mod hotswapping.md` (catlab root) and its notes in `research_notes/Minecraft launcher mod hotswapping/`

## 1. Goal

A server admin can switch on **"Enable live mod hotswapping (beta)"** in a cloud instance's Pack tab. Players on a launcher that supports it then get pack updates applied to the **running** client where that is safe, after a prompt, at the main menu. Everything that cannot be swapped safely is downloaded during play and applied on next launch.

Success means:
- Hotswap off (the default) → launches are byte-for-byte the same as today.
- Older launchers are unaffected whatever the toggle says.
- A swap never leaves the JVM half-changed; a failed swap degrades to "Restart to apply", not a crash.

### Clean-room rule

This feature is designed from public JVM/JVMTI, Fabric/Quilt, Mixin and Forge/NeoForge sources and docs, plus the MIT-licensed `JHVIW/fabric-hot-reload`. **Do not read, copy or port code or design details from `dearIrene/hotwire-public`** (PolyForm Strict + "Clients" clause forbids studying it to build our own). Implementers must not read the Hotwire paragraphs in `research_notes/.../loader_internals_and_prior_art.md`.

### Out of scope (v1)

- Content mods (new blocks/items/entities/registries), networking mods, library/core mods, coremods, mods with early mixins: always tier 3 (restart).
- JetBrains Runtime / enhanced redefinition. Only the runtimes the launcher installs today (Corretto, GraalVM).
- Tiers 1–2 on Forge/NeoForge. Tiers 1–2 on MC versions other than 1.20.1 and 1.21.x.
- Swapping while in a world or connected to a server.
- Protected mods (`.rlmod`, see `2026-10-20-protected-custom-mods-design.md`): any change to one is tier 3 in v1.
- Unloading classes. A removed mod's classes stay in memory, unreferenced, until restart.

## 2. Decisions

| Topic | Decision |
|---|---|
| Who can enable | Any cloud instance (private or public) with a published pack v2. Admin toggle, default off. |
| Player UX | Prompt ("Pack updated – Apply / Later"); swap only at the main menu. |
| Loaders | Fabric/Quilt: tiers 0–2. Forge/NeoForge: tier 0 only. |
| MC versions | Tiers 1–2: 1.20.1 and 1.21.x. Other versions: tier 0 only. |
| Runtime | Stock Corretto/GraalVM; method-body redefinition only. |
| Architecture | Separate `reality-hotswap.jar` agent + file channel (not extending `reality-agent.jar`, not a companion mod). |

## 3. Tiers

| Tier | Change | Loaders / versions | Result |
|---|---|---|---|
| 0 | Resource packs, shader packs, asset/config files | All | Copy files + client resource reload (F3+T equivalent) |
| 1 | Mod jar update where every changed class differs only inside existing method bodies | Fabric/Quilt, 1.20.1 & 1.21.x | Live batch redefinition at main menu |
| 2 | Add or remove a mod on the shipped allowlist | Fabric/Quilt, 1.20.1 & 1.21.x | Live at main menu (remove only with a tested recipe) |
| 3 | Everything else, or any tier 1/2 change the agent rejects | All | Staged; applied on next launch |

The launcher assigns a provisional tier; the agent gives the final verdict for tiers 1–2 and may demote to 3.

## 4. Architecture

```
Portal Pack tab ──toggle──▶ API: instances.hotswap_enabled (default 0)
                              └─▶ patch experimental.hotswap in R2 packs/<id>/manifest.json (no publish)
Launcher (supporting versions only)
  launch: gate passes → -javaagent:reality-hotswap.jar -Dreality.hotswap=<session dir>
  game running: poll manifest (ETag) every 60 s → stage changed files → classify → offer.json
Game (reality-hotswap agent)
  premain: record original bytes; watch offer.json; prompt at title screen
  Apply → plan (transform + JVMTI rule check) → one redefineClasses batch → 10 s health → result.json
Next launch: existing sync moves staged files into place; crash-lock check
Kill switch: app_settings hotswap_globally_disabled
```

## 5. Hotswap agent (`agent-hotswap/` → `reality-hotswap.jar`)

### 5.1 Build and loading
- New Maven module `agent-hotswap/` beside `agent/`; shade + relocate ASM like `agent/`. Built by `bun run build:agent` (extended) and the jar committed to `src-tauri/resources/reality-hotswap.jar`, since CI has no Maven.
- Manifest: `Premain-Class`, `Can-Redefine-Classes: true`, `Can-Retransform-Classes: true`. No `Agent-Class` (never dynamically attached; avoids JEP 451).
- Java 8 bytecode so tier 0 works on old packs; redefinition paths enable only on Java 17+, Fabric/Quilt, MC 1.20.1/1.21.x (passed by the launcher as `-Dreality.hotswap.tiers=0|0,1,2`).
- Embedded in the launcher binary and written to `<mc>/agent/` on launch, like `reality-agent.jar`. `reality-agent.jar` is not changed.
- Follows the existing agent rule: no hard-coded obfuscated names. Minecraft class/member names it needs come from the launcher's `mappings.rs` resolution, passed in a properties file (as `TabScheme` does).

### 5.2 Components

| Component | Responsibility |
|---|---|
| `OriginalBytes` | `ClassFileTransformer` registered first in `premain`. Stores untransformed bytes (deflate-compressed) for classes from mod jars and for every class a mixin targets. Memory is measured in testing (§9). |
| `Channel` | Watches `<session>/offer.json`; writes `status.json` and `result.json` atomically (temp file + rename). Ignores unknown fields; `schema: 1`. |
| `Gate` | Allows a swap only when the game is at the title screen with no world or connection. Reuses the `GameStatus` approach (`state=menu`) plus a title-screen check via resolved names. |
| `Prompt` | Adds "Update ready – Apply / Later" to the title screen. If it cannot render for any reason, the launcher shows a notification with an Apply button that writes `{"apply":true}` to the channel; the swap stays queued. |
| `Planner` | For each changed class: run stored original/new bytes through the loader's transform chain (Fabric access wideners, then the active Mixin transformer's `transformClassBytes`), then check old vs new final bytes with ASM against the JVMTI redefinition rules (fields, methods, signatures, modifiers, supertypes/interfaces, NestHost/NestMembers/Record/PermittedSubclasses, lambda/synthetic method set). Verdict per change: `live` or `restart`. Mixin's own hotswap re-entry is **never** used (known deadlock). |
| `Applier` | Applies the whole plan as one `Instrumentation.redefineClasses` batch on the render thread between ticks. Keeps the previous bytes for rollback. |
| `Health` | For 10 s after a swap, watches the client tick for throwables. On failure, re-applies previous bytes as one batch and reports `failed`; the change falls to tier 3. |

### 5.3 Tier behaviour
- **Tier 0:** copy staged assets/configs into place (never a locked jar), trigger the client resource reload.
- **Tier 1:** batch redefinition per §5.2. One rejected class demotes the whole mod update to `restart`.
- **Tier 2 add:** append the jar to the loader classloader (Fabric/Quilt add-only path, e.g. `KnotClassDelegate.addCodeSource`), select the new mixin configs and re-mix already-loaded targets from original bytes in one batch, run the mod's client entrypoints, register its assets as an extra resource source, reload resources, append keybinds.
- **Tier 2 remove:** only for allowlist entries with `removable: true` and a tested recipe: restore affected targets to original bytes in one batch, remove its keybinds and resource source. Otherwise `restart`.
- **Spike first:** the exact Fabric/Quilt transform-chain calls and the add path are verified on 1.20.1 and 1.21.x before tiers 1–2 are built (plan phase 5 gate).

## 6. Launcher (Rust/Tauri)

### 6.1 Launch gate (`launcher.rs`, beside `branding_jvm_args`)
Hotswap is enabled for a launch only if **all** hold:
1. pack v2 manifest has `experimental.hotswap == true` (missing → false);
2. the user setting "Disable hotswap on this PC" is off;
3. no crash lock for this instance + pack version (§6.4);
4. loader/MC version supports at least tier 0.

Otherwise the launch is unchanged. If enabled: write `reality-hotswap.jar`, create `<instance>/.reality/hotswap/<session-id>/`, add `-javaagent:<…>/reality-hotswap.jar`, `-Dreality.hotswap=<dir>`, `-Dreality.hotswap.tiers=<list>` after the branding agent args.

### 6.2 Watcher (`hotswap_watch.rs`, started beside the presence heartbeat)
- Polls the public pack manifest every 60 s with `If-None-Match`.
- `experimental.hotswap` became false → write `offer.json {"revoked":true}`; agent drops queued offers.
- `version` increased → diff against `.reality/pack-state.json` using the pack v2 diff code; download changed files to `.reality/staging/<version>/`; never delete or overwrite loaded jars.
- Classify: asset/config → 0; mod jar update on supported Fabric/Quilt → 1; allowlisted add/remove → 2; protected mod or anything else → 3.
- Write `offer.json`: `{schema:1, version, changes:[{path, tier, sha256, action}], staging}`.
- Read `status.json`/`result.json`; show "Applied live" / "Restart to apply" / "Swap failed – will apply next launch" in the launcher UI and as notifications.

### 6.3 Allowlist
`hotswap-allowlist.json` embedded in the launcher: `[{modId, mc: "range", addable, removable, removeRecipe}]`. Updated only with launcher releases, never fetched from the server.

### 6.4 Exit / next launch
- Existing sync moves staged files into place as a normal pack update does.
- Crash lock: if the game exited while `result.json` said `applied` without a later `healthy`, write a lock for (instance, pack version), send telemetry, and skip hotswap until the pack version changes.
- Delete old session dirs.

### 6.5 Other
- Add `X-Launcher-Version: <semver>` to API requests.
- Settings: "Disable hotswap on this PC" (default off).
- Verify `closeOnLaunch` never exits the launcher process while a hotswap-enabled game runs; if it does, keep a background process alive for that session.

## 7. API (`realitylauncher-api`)

- **Migration:** `ALTER TABLE instances ADD COLUMN hotswap_enabled INTEGER NOT NULL DEFAULT 0;` plus the Drizzle schema field `hotswapEnabled`.
- **Fix first (own commit):** `assertCanManageInstance` (`modpack-mods.ts:90-97`) must filter the member row by the calling user. Tests: a second admin passes; a non-member fails.
- **`PATCH /instances/:id/pack/settings`** `{hotswapEnabled: boolean}`: `assertCanManageInstance` → update column + `updated_at` → rewrite only `experimental.hotswap` in R2 `packs/<id>/manifest.json` → 409 `"Publish a pack first"` if no published pack.
- **Publish** (`routes/pack.ts`): when writing `manifest.json`, include `experimental: {hotswap: <column>}`.
- **`GET /instances/:id`:** add `hotswapEnabled` to the ETag field list (`instances.ts:155-185`).
- **Kill switch:** `app_settings` key `hotswap_globally_disabled`; when true the manifest route serves `experimental.hotswap: false` (and a distinct ETag) for every instance without touching R2.
- Old launchers parse leniently and ignore `experimental`.

## 8. Portal (`realitylauncher-management`)

`components/pack/SettingsTab.vue` → new **Experimental** section:
- Switch "Enable live mod hotswapping (beta)", default off.
- Help text: "Players on Reality Launcher vX+ will be prompted to apply pack updates live at the main menu. Content mods and most changes still need a restart. Fabric/Quilt 1.20.1/1.21.x get the most; Forge/NeoForge only reload resources."
- Disabled with "Publish a pack first" when no pack is published; "Disabled by platform admin" badge when the kill switch is on.
- Saves immediately via `lib/pack-api.ts` → `PATCH /instances/:id/pack/settings` (not the draft); errors via `errorText`.

## 9. Safety and testing

### Safety rules
1. Off by default at platform, instance and PC level; any off → today's launch.
2. Main menu only.
3. Validate before swap; doubt → restart.
4. One atomic batch per swap.
5. 10 s health check with rollback.
6. Crash lock per (instance, pack version).
7. Allowlist ships with the launcher.
8. Never touch locked files; stage instead.

### Tests
| Layer | Tests |
|---|---|
| Agent unit (JUnit) | Rule checker on crafted class pairs (body change → live; field/method/lambda/supertype/enum change → restart); channel atomic writes under kill. |
| Agent integration | Headless JVM: load sample jar, swap, roll back, byte-compare. |
| Game (manual, per version) | Fabric + Quilt on 1.20.1 and 1.21.x: tier 0 reload; tier 1 on a test mod; tier 2 add/remove per allowlisted mod; 100 apply/rollback cycles watching heap and threads; `OriginalBytes` memory. Forge/NeoForge: tier 0 only, everything else offered as restart. |
| Launcher (Rust) | Tier classification, staging diff, crash-lock rules, ETag poll loop against a fake server. |
| API (Vitest) | Toggle permission (incl. fixed admin check), 409 without published pack, manifest gets `experimental.hotswap`, kill switch override, ETag changes. |
| Backward compat | Current released launcher on a hotswap-on instance behaves as today. |

### Telemetry
`hotswap_offer`, `hotswap_applied`, `hotswap_restart_required` (+reason), `hotswap_failed` (+error), `hotswap_crash_lock`; each with loader, MC version, launcher version.

## 10. Delivery order

1. Permission fix + `X-Launcher-Version` header.
2. API + portal: column, endpoint, manifest field, kill switch.
3. Launcher watch-and-stage loop, tier 3 only (download during play, apply on restart).
4. Agent with tier 0 on all loaders.
5. Spike, then tier 1 on Fabric/Quilt.
6. Tier 2 on Fabric/Quilt with the allowlist.

## 11. Open risks

- `OriginalBytes` memory cost on large packs (measure in phase 4).
- How Fabric Loader treats appending a jar already on `-cp` (the launcher puts `mods/*.jar` on `-cp` for Fabric/Quilt).
- Mixin "loaded too early" behaviour for tier 2 adds; mods that cache state in static initializers (`<clinit>` is never re-run).
- Title-screen prompt needs resolved names per version; the launcher-notification fallback covers gaps.
