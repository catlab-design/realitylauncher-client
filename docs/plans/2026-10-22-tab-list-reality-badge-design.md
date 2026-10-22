# Reality badge in the multiplayer tab list — design

**Date:** 2026-10-22 · **Status:** proposed · **Builds on:** in-game branding agent (`agent/`, branch `feat/in-game-branding`)

## Goal

In multiplayer, a Reality Launcher user sees a small Reality logo before the name of every player in the tab list who is **currently playing through Reality Launcher**. Client-side only: works on any server (Paper/Purpur, Velocity, modded Forge/Fabric) with no server plugin. Only Reality users see the badge.

Scope: Minecraft **1.19 – 1.21.x**, all loaders (Vanilla, Fabric, Quilt, Forge, NeoForge). Other versions launch normally with no badge.

## Non-goals

- Badges visible to non-Reality players (that needs a server plugin).
- Nametags above heads, chat prefixes.
- Versions before 1.19 (different text API).

## Overview

```
Launcher ──heartbeat (api_token)──▶ API: game_presence rows keyed by Minecraft UUID
   │  ◀── lookupToken ─────────────┘
   │ writes agent/session.json (lookupToken, runtime names)
   ▼
Game + agent ──POST /presence/lookup {uuids, token}──▶ API: which UUIDs are live Reality players
   │
   └─ tab list name = literal(badge glyph) + original name   (glyph from launcher-installed resource pack)
```

## 1. Backend (`realitylauncher-api`)

New table `game_presence` (D1 migration `0028_game_presence.sql`):

| column | notes |
|---|---|
| `mc_uuid` TEXT | dashed lowercase UUID as it appears in tab lists; PK with `session_id` |
| `session_id` TEXT | random id per game launch |
| `user_id` TEXT | from the authenticated API session |
| `instance_id` TEXT | |
| `lookup_token_hash` TEXT | SHA-256 of the lookup token |
| `started_at`, `last_seen_at` INTEGER | epoch ms |

A launch registers **two** UUIDs: the account's real UUID (online-mode servers) and the offline UUID derived from the username (offline-mode servers and proxies). CatID accounts only have the offline UUID.

Routes (new `src/routes/presence.ts`, mounted at `/presence`):

- `POST /presence/start` — `authMiddleware` (launcher `api_token`). Body `{ instanceId, uuids: string[≤2] }`. Creates a session, returns `{ sessionId, lookupToken, heartbeatSeconds: 120 }`.
- `POST /presence/heartbeat` — auth. Body `{ sessionId }`. Bumps `last_seen_at`.
- `POST /presence/end` — auth. Body `{ sessionId }`. Deletes the rows.
- `POST /presence/lookup` — **no account auth**; header `X-Presence-Token: <lookupToken>`. Body `{ uuids: string[≤100] }`. Token must belong to a session seen in the last 5 minutes. Returns `{ reality: string[] }`: the subset with a session whose `last_seen_at` is within 5 minutes, excluding the caller's own session. Rate-limited per token.

**Privacy:** you only learn about UUIDs you send, and only while your own game is live through Reality. The lookup token can't do anything else. Sessions that stop heartbeating (crashes) drop out after 5 minutes. A cron purge isn't needed; lookups filter by freshness and `start` deletes the same user's stale rows.

## 2. Launcher (Rust)

- **Presence client** (`presence.rs`): on game start → `start`; every `heartbeatSeconds` while the game runs → `heartbeat`; on game stop → `end`. Failures are logged and never block or kill the game.
- **Agent session file** `<mc dir>/agent/session-<pid-or-launch-id>.json` (permissions 0600 on Unix), path passed as `-Dreality.session=<path>`. Contains the lookup token, API URL and the resolved runtime names (below). No secrets on the command line.
- **Runtime name resolution** (`mappings.rs`): the agent needs 5 members, named per loader:

  | Mojang name | |
  |---|---|
  | `PlayerTabOverlay#getNameForDisplay(PlayerInfo) → Component` | hook target |
  | `PlayerInfo#getProfile() → GameProfile` | UUID source (GameProfile is authlib, never obfuscated) |
  | `Component#literal(String) → MutableComponent` (static) | badge text |
  | `MutableComponent#append(Component) → MutableComponent` | join |

  Chain: Mojang `client_mappings` (from the version JSON, cached in `libraries/`) maps Mojang names → obfuscated. Then:
  - Vanilla: obfuscated names are the runtime names.
  - Fabric/Quilt: Fabric `intermediary-<mc>-v2.jar` (maven.fabricmc.net) maps obfuscated → intermediary.
  - Forge 1.19–1.20.x: Mojang class names + SRG member names from `mcp_config` `joined.tsrg` (already downloaded by the Forge installer).
  - NeoForge 1.20.5+: Mojang names as-is. NeoForge 1.20.1–1.20.4: same as Forge.

  If anything can't be resolved, the session file omits the names and the agent skips the tab hook (title branding still works).
- **Badge resource pack** `Reality Launcher Badge.zip` written to the instance's `resourcepacks/` and appended to `resourcePacks` in `options.txt` if missing. It adds a font provider to `minecraft:default` mapping private-use char `U+E2A0` to an 8×8 Reality logo bitmap (ascent 7). Pack format chosen per Minecraft version.

## 3. Agent (Java)

- Reads `reality.session` at premain. Hook `getNameForDisplay` (runtime class/method names from the session file): before each `ARETURN`, with the result `Component c` on the stack:

  ```
  prefix = ((Function<UUID,String>) System.getProperties().get("reality.badge")).apply(playerInfo.getProfile().getId())
  return Component.literal(prefix).append(c)
  ```

  Same constraints as the title hooks: no branches, java.base-only types for the agent call (the `Function` lives in a system property, so Forge's module layers never need to read the agent jar).
- `prefix` is `" "` for known Reality players, else `""`; an empty literal renders nothing.
- **Badge cache:** a background daemon thread. Unknown UUIDs go into a queue; at most one `lookup` per 2 s with up to 100 UUIDs. Results are cached for 60 s, and the cache drops on server change, detected when a new batch shares no UUIDs with the previous one. `HttpURLConnection` only (Java 8 compatible). The render thread never blocks or does network I/O.

## Error handling

Every failure degrades to "no badge": API down, token expired, mapping missing, pack disabled by the user (the glyph would show as a box, so the agent only returns the prefix while the pack is active, checked via `options.txt` at launch and noted in the session file). The game never crashes because of the badge.

## Testing

- Backend: unit tests for presence freshness, lookup filtering, token checks, limits.
- Launcher: mapping-chain tests against the real 1.20.1 Mojang/SRG/intermediary files (fixtures trimmed to the needed entries); session-file and pack generation tests.
- Agent: harness like the title tests — verify the transformed real `PlayerTabOverlay` from 1.20.1 vanilla / Fabric 1.20.4 / Forge 1.20.1 with ASM's verifier; run the injected logic on a stand-in class.
- Manual: two accounts on a test server (one Reality, one not) → badge only on the Reality player, gone ~5 min after their game is killed.

## Rollout

1. Backend migration + routes, deployed first (unused until launchers ship).
2. Launcher + agent in the next release.
3. Deploy needs `bun run db:migrate:prod` and `wrangler deploy` on `ml-api`, both run by a maintainer.
