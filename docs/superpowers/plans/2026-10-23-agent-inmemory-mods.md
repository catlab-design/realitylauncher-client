# Agent-Served Protected Mods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
> **This plan is gated.** Phase 0 is a spike. Phases 1+ run only if Phase 0's gates pass; otherwise stop and ship the base plan (`2026-10-21-protected-mods-launcher.md`) unchanged.

**Goal:** Serve protected custom mods to the mod loader from memory via `reality-agent.jar`, so no plain `.jar` is written to `mods/`.

**Architecture:** Server encryption and key handout are unchanged (base spec). The launcher syncs `.rlmod` files but does not decrypt to disk; it hands keys + a filename manifest to the already-present `-javaagent`, which decrypts in memory and makes the jars visible to the loader at load time. Per-loader fallback to decrypt-to-disk where the shared hook can't reach.

**Tech Stack:** Rust (Tauri) launcher; Java 8 agent (ASM, `bun run build:agent`, reproducible jar — CLAUDE.md gotcha 17).

**Specs:** `2026-10-23-agent-inmemory-mods-addendum.md` (extends `2026-10-20-protected-custom-mods-design.md`)

## Global Constraints

- Build the agent with `bun run build:agent` and commit the reproducible jar (CLAUDE.md gotcha 17). CI has no Maven.
- Agent injected code: `java.base`-only, branch-free, decisions in a `Hooks`-style holder, stable (non-obfuscated) names only — match the existing agent conventions.
- **Never** write the decryption key to disk or put it on the game command line (visible in `ps`). Never log keys, tokens, or fingerprints (CLAUDE.md gotcha 20).
- Agent stays fully inert when no protected-mods channel is present (existing `premain` gating pattern).
- The base plan's `.rlmod` v1 wire format is frozen; this plan does not change it.

## Review Focus

1. **A loader the shared hook can't cover.** Its protected mods must fall back to decrypt-to-disk, not silently vanish. Covered by Phase 0 gate G4 and Phase 2.
2. **Key left recoverable.** Key on disk or on the command line fails the whole approach. Covered by Phase 0 gate G3; Phase 1 step verifies `ps` and the instance tree.
3. **Agent channel absent / malformed.** Game must still launch (unprotected or fallback), never hang waiting on a channel. Covered by Phase 3 manual check.
4. **Member revoked / offline.** Reuses base plan grant logic; agent never receives keys the server didn't grant. Covered by base plan Tasks 5 & 7.
5. **Memory growth.** The agent must keep exactly one decrypted copy per mod and reuse it on every access; retained heap must not grow during play. Covered by Phase 0 gate G5, T1.1 and T3.2.

---

## Phase 0 — Feasibility spike (THROWAWAY)

Output is a recommendation, not kept code. Build a minimal agent hook + one encrypted real mod in a temporary worktree or the scratchpad. Do not touch `agent/` or `src-tauri/` on the branch.

- [ ] **S1. Read the loaders' mod-discovery entry points** for Fabric/Quilt and Forge/NeoForge 1.20.1 — where each enumerates and opens files in `mods/`. Record the stable `java.base`/loader-API names involved.
- [ ] **S2. Prototype the in-memory hook** in a throwaway agent: decrypt one `.rlmod` in `premain`, hold bytes in memory, make the loader load it. Try the shared interception point first; note which loaders it covers.
- [ ] **S3. Prototype the key channel** (§5 of the addendum; start with game stdin). Confirm the agent reads the key before the game starts and the key is not on disk or the command line.
- [ ] **S4. Verify the gates** on this machine, Fabric + Forge, one real mod each:
  - G1 mod loads and is active in-game
  - G2 no plain `.jar`/`.class` of the mod anywhere under the instance dir during or after the run
  - G3 key absent from disk and from `ps -ef` output
  - G4 record per-loader coverage (pass/fail each)
  - G5 memory: same instance and `-Xmx`, protected mods agent-served vs. the same mods as plain jars. Record used heap after startup and after 30 minutes of play (`jcmd <pid> GC.heap_info` after `jcmd <pid> GC.run`). Pass if the extra heap is at most ~2× the protected jars' total plaintext size and does not grow between the two readings
- [ ] **S5. Write findings** to `docs/superpowers/specs/2026-10-23-agent-inmemory-mods-addendum.md` under a new "Phase 0 findings" section: the interception point, the key channel, per-loader coverage, the G5 memory numbers, and a go/no-go recommendation. If G5's overhead is too large, also say whether chunk-on-demand decryption (addendum §4.1) is needed. Delete the throwaway prototype.

**Gate:** If G1–G3 and G5 pass for at least one loader, continue to Phase 1 (loaders that fail G4 use fallback). If G1–G3 fail, STOP — ship the base plan. If only G5 fails, either add chunk-on-demand decryption to Phase 1 (if the findings show it fixes the overhead) or STOP.

## Phase 1 — Agent protected-mods subsystem

(Only after a go decision. Exact hook/channel per Phase 0 findings.)

- [ ] **T1.1** Add the subsystem to `agent/`, gated in `premain` like the existing title/icon/badge subsystems: active only when the protected-mods channel is present. Decrypt `.rlmod` bytes in memory into a filename→bytes map; clear key material after each file. The map holds exactly one copy per mod, created once in `premain` and never replaced; every access returns that same copy (or a read-only view of it), never a new array.
- [ ] **T1.2** Implement the loader interception found in Phase 0, expressed in stable names, covering the loaders that passed G4.
- [ ] **T1.3** Record the per-user fingerprint inside the served bytes (base spec §6.3).
- [ ] **T1.4** `bun run build:agent`; commit the reproducible jar.
- [ ] **T1.5** Manual: Fabric + Forge instance, protected mod loads from memory, gates G2/G3 hold. Commit: `feat(agent): serve protected mods from memory`

## Phase 2 — Launcher wiring + per-loader fallback

- [ ] **T2.1** In `prepare_launch` (base plan Task 7): for an agent-supported loader, skip decrypt-to-disk; gather `{fileId, filename, key}` for granted files and feed them to the agent over the Phase 0 channel. For an unsupported loader, keep base decrypt-to-disk.
- [ ] **T2.2** Pass the non-secret manifest (fileId→filename, fingerprint) via a `0600` file like the existing `-Dreality.session` precedent; pass keys only over the private channel.
- [ ] **T2.3** Bump the capability token to `protected-mods/1+agent` for agent-capable launches; keep `protected-mods/1` for decrypt-to-disk (base plan Task 4/8).
- [ ] **T2.4** Keep the crash-recovery cleanup sweep as defense in depth.
- [ ] **T2.5** `cargo check --lib && cargo test --lib`. Commit: `feat(protected): hand protected mods to the agent, fallback per loader`

## Phase 3 — Verification & docs

- [ ] **T3.1** Manual matrix: Fabric, Quilt, Forge, NeoForge — protected mod loads; for unsupported loaders confirm fallback; confirm absent/malformed channel still launches.
- [ ] **T3.2** Confirm G2/G3 across the matrix (no plain jar; key not on disk or in `ps`), and repeat the G5 memory measurement on Fabric and Forge with the final agent build.
- [ ] **T3.3** Update `docs/CHANGELOG.md` (Added) and `CLAUDE.md` (agent gotcha 17 + §2 agent file list). Pre-commit checklist (CLAUDE.md §10). Commit: `docs: agent-served protected mods`
