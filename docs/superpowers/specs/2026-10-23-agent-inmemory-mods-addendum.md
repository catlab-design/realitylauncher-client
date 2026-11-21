# Addendum — Agent-Served Protected Mods (in-memory)

**Date:** 2026-10-23
**Status:** Proposed; depends on a feasibility spike (Phase 0 below)
**Extends:** `2026-10-20-protected-custom-mods-design.md`. Everything there still holds; this changes only *how* a protected mod reaches the mod loader. Server encryption, per-instance opt-in, key handout, offline grace, and the four closed download routes are unchanged.

## 1. Why

The base design decrypts a protected mod to a plain `.jar` in `mods/` just before launch and deletes it on exit. The honest weakness (base spec §1): while the game runs, a plain copy sits on disk and can be copied. `reality-agent.jar` is already loaded into every game as a `-javaagent` with a `ClassFileTransformer` ([RealityAgent.java](../../../agent/src/main/java/space/catlabdesign/reality/agent/RealityAgent.java)). If the agent can hand decrypted mod bytes to the loader at load time, no plain `.jar` need ever be written. This raises the effort to copy a protected mod from "open the folder" to "attach your own tooling to the JVM."

## 2. Honest limits (unchanged in spirit)

This is still not unbreakable. The JVM must see plaintext classes to run them, so anyone who can run code inside the game's JVM (their own `-javaagent`, a debugger, a memory inspector) can still recover the classes. What changes: a plain jar is no longer sitting in `mods/` for a casual copy, and a leaked copy is still traceable through the server key-grant log and the per-user fingerprint. We do not add anti-debugging or obfuscation; the goal is to stop casual copying and re-publishing, not to defeat a determined reverse-engineer. Keep this paragraph in any user-facing description.

## 3. Feasibility gate (Phase 0 — spike)

The in-memory path ships **only if** the spike proves all of these on this machine, for one Fabric and one Forge 1.20.1 instance, each with one real protected mod:

- G1. The loader loads the protected mod's classes and the mod is active in-game.
- G2. No plain `.jar` (or extracted `.class`) for the protected mod exists anywhere under the instance dir while the game runs or after it exits.
- G3. The decryption key is never written to disk and never passed on the process command line (it is visible in `ps`); it reaches the agent by a private channel (§5).
- G4. One agent build works for Fabric, Quilt, Forge and NeoForge without per-loader native code. If a loader cannot be covered by the shared hook, that loader falls back to decrypt-to-disk (base spec §6) for its protected mods.
- G5. **Memory stays bounded.** With the same instance and `-Xmx`, compare the game's heap after startup and after 30 minutes of play, with protected mods served by the agent versus the same mods as plain jars in `mods/`. The extra retained heap must be at most about 2× the total plaintext size of the protected jars, and must not grow between the startup and 30-minute measurements.

If G1–G3 fail, we ship the base decrypt-to-disk design unchanged and archive this addendum. G4 may pass for some loaders and fail for others; coverage is per-loader.

## 4. Mechanism (design altitude)

- The launcher syncs protected mods as encrypted `.rlmod` files into `<instance>/.rl-protected/` (base spec §6.2) and does **not** decrypt them to `mods/`.
- The launcher passes the agent, by the private channel in §5: the decryption keys, the per-user fingerprint, and a manifest mapping each `fileId` to its intended mod filename (e.g. `CatMenu.jar`).
- The agent, early in `premain`, decrypts each `.rlmod` in memory and holds the jar bytes in a map keyed by the intended filename. No plaintext is written to disk.
- The agent makes those in-memory jars visible to whichever loader is running, at the point the loader enumerates/opens mod files. The exact interception point is the spike's main unknown and will be documented by Phase 0; it must be expressed in terms of stable `java.base` / loader-API names (the agent's existing rule: no obfuscated names), so one build spans versions.
- The fingerprint is still recorded inside the served bytes (base spec §6.3) so a dump remains traceable.

### 4.1 Memory

- Java loads classes lazily, so the decrypted bytes must stay reachable for the whole game session; the agent cannot free them after startup. This is retained memory, counted against the player's `-Xmx`, not a leak, but it must be bounded and visible.
- The agent keeps **exactly one** decrypted copy per protected mod and returns that same copy on every access. Building a new copy per access would make memory grow with use, which is a real leak.
- Expected overhead is roughly the total plaintext size of the protected jars, possibly up to about 2× if the loader makes its own copy. Phase 0 measures it (gate G5).
- **Optional, only if G5 shows the overhead is too large:** keep each mod encrypted in memory and decrypt only the 1 MiB chunks the loader reads. That reduces retained plaintext but adds complexity, so it is not built unless the numbers call for it.
- The launcher's own memory is unaffected: it streams `.rlmod` files and only passes keys and a small manifest to the agent.

## 5. Key channel (launcher → agent, no disk, no command line)

- Reuse the existing private-file precedent (`-Dreality.session=<file>`, mode `0600`, used by the tab badge) **only** for non-secret manifest data (fileId → filename map, fingerprint).
- The keys themselves are handed over out-of-band from the command line and the filesystem. Candidate channel: the game process's stdin, which the launcher owns and already controls for the child process; the agent reads and closes it in `premain` before the game starts. The spike picks and documents the exact channel; the requirement is only G3 (not on disk, not on the command line).
- Keys live in the agent only as `byte[]`/`SecretKey` and are cleared after each `.rlmod` is decrypted.

## 6. Launcher changes vs base spec

- `prepare_launch` (base spec §6.3): when the agent path is active for an instance, it does **not** decrypt to `mods/`. It instead gathers `{fileId, filename, key}` for the member's granted files and feeds them to the agent over the §5 channel, then launches.
- Cleanup (base spec §6.4) becomes mostly unnecessary for agent-served mods (nothing is written), but the crash-recovery sweep stays as defense in depth in case a fallback path wrote something.
- Per-loader fallback: for a loader Phase 0 marks unsupported, that loader keeps the base decrypt-to-disk behavior.

## 7. Agent changes

- New optional subsystem, gated exactly like the existing ones in `premain`: if no protected-mods channel is present, the agent behaves exactly as today.
- It reuses the agent's existing conventions: `java.base`-only injected code, no branches in injected bytecode, decisions in a `Hooks`-style holder, stable names only.
- Built with the existing `bun run build:agent`; the committed jar is reproducible (CLAUDE.md gotcha 17).

## 8. Rollout

Unchanged from base spec §9 (launcher first), with Phase 0 inserted before launcher implementation. The capability token becomes `protected-mods/1+agent` so the server can tell which clients can take agent-served mods; clients that only do decrypt-to-disk still send `protected-mods/1`. The wire format of `.rlmod` and the key endpoint are unchanged.
