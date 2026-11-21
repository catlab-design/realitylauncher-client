# Protected Custom Mods — Design

**Date:** 2026-10-20
**Status:** Approved in brainstorming, awaiting spec review
**Repos touched:** `realitylauncher-api`, `realitylauncher-management`, `realitylauncher-client`, `reality-mini` (all under `../reality-project/` except the client)

## 1. Goal

Instance owners can switch on **"Protect custom mods"** for an instance. After that, mods the team uploaded themselves (`source: "file"` and custom jars inside pack v2) are:

1. **Useless when copied out of a player's `mods/` folder.** At rest they exist only as encrypted `.rlmod` files.
2. **Hard to rip for re-publishing.** No plain copy is served by the API, every key grant is logged, and every decrypted jar carries a per-user fingerprint.

Out of scope:
- Public Modrinth/CurseForge mods. They are never encrypted.
- Mods the player adds themselves.
- Instances with protection off. They behave exactly as today.

### Threat model (honest limits)

The JVM needs plain bytecode, so the key must reach the player's machine. A determined attacker can still:
- copy the plain jars from `mods/` while the game is running;
- dump classes from memory;
- extract keys from the launcher process.

This design stops casual copying, scraping the API, and running the pack outside Reality Launcher. It makes deliberate leaks traceable through the server-side key-grant log; the in-jar fingerprint is strippable and is secondary evidence. It is **not** unbreakable DRM.

### Current leaks this design closes (protected instances only)

Custom jar bytes are currently served **unauthenticated** by:
1. `GET /instances/:id/modpack/mods/:modId/download` (`realitylauncher-api/src/routes/modpack-mods.ts:1060`)
2. `GET /storage/modpacks/:id/latest.mrpack`, where custom jars are embedded in `overrides/` by `rebuildModpackPackage` (`lib/modpack-rebuild.ts:246+`)
3. Pack v2 `GET /pack/layers/:layerId` and `/pack/layers/:layerId/entry` (`routes/pack.ts:738,752`)
4. `GET /modpack/files/:fileId/download` (`modpack-mods.ts:1093`)

Encryption is pointless unless all four stop serving plain custom jars.

## 2. Cryptography and file format

### Keys
- **KEK (master key):** 32 random bytes in the Worker secret `MOD_KEK_<kekId>` (e.g. `MOD_KEK_1`), base64. `MOD_KEK_CURRENT` names the active `kekId`. The KEK is never stored in D1.
- **DEK (per protected file):** 32 random bytes from `crypto.getRandomValues`. It is wrapped with the KEK using AES-256-GCM (12-byte random nonce, AAD = `protected_files.id`) and stored as `wrapped_key` = nonce ‖ ciphertext ‖ tag.
- Do **not** reuse `lib/crypto.ts` `encrypt`/`decrypt`, which zero-pad string keys with no KDF.

### `.rlmod` format (version 1)

```
offset  size  field
0       4     magic "RLM1"
4       1     format version = 1
5       16    fileId (UUID bytes) — also AAD, binds ciphertext to its D1 row
21      7     base nonce (random)
28      4     chunk size, u32 BE = 1_048_576
32      ...   chunks
```

- Each chunk is AES-256-GCM over ≤1 MiB of plaintext, with a 16-byte tag. The ciphertext chunk length is `plain_len + 16`.
- Chunk nonce (12 bytes) = base nonce (7) ‖ chunk index u32 BE (4) ‖ final flag (1: `0x01` on the last chunk, else `0x00`). This is the STREAM construction, so truncating, reordering or extending the file makes decryption fail.
- Chunk AAD = the 32-byte header.
- An empty file is a single final chunk with 0 bytes of plaintext.
- Both encryption (Worker) and decryption (Rust) stream chunk by chunk; neither holds a whole jar in memory.

## 3. Data model (D1, `realitylauncher-api/src/db/schema.ts`)

`instances` gains:
- `protect_custom_mods` text enum `off | migrating | on | failed | disabling`, default `off`.
- `protect_offline_hours` integer, default `72`. `0` disables offline grace.

New table `protected_files`:

| column | type | notes |
|---|---|---|
| `id` | text PK (UUID) | also the `.rlmod` fileId |
| `instance_id` | text FK | |
| `kind` | text `mod \| pack_file` | |
| `ref_id` | text | `modpackMods.id`, or the pack v2 file path |
| `target_path` | text | relative install path, e.g. `mods/CatMenu.jar` |
| `storage_path` | text | where the `.rlmod` is stored |
| `kek_id` | text | |
| `wrapped_key` | blob | |
| `plain_sha1`, `plain_size` | text, int | |
| `cipher_sha256`, `cipher_size` | text, int | |
| `created_at` | int | |

New table `protected_key_grants`: `id`, `user_id`, `instance_id`, `file_ids` (JSON), `ip`, `user_agent`, `client_version`, `created_at`. It is append-only and is the audit trail.

## 4. API behaviour (`realitylauncher-api`)

### 4.1 Capability header
Clients that can decrypt send `X-RL-Capabilities: protected-mods/1`. The API logs the header's presence per request so the 5.2 adoption rate can be measured.

### 4.2 Existing routes, for protected instances

| Route | New behaviour |
|---|---|
| `/modpack/mods/:modId/download`, `/modpack/files/:fileId/download` | For protected files: require auth plus `checkMembership`, then 302 to a short-lived (≤1h) signed URL of the **`.rlmod`**. Unprotected files are unchanged. |
| `rebuildModpackPackage` | Skips protected files when embedding `overrides/`. |
| Pack v2 publish | Protected jars are taken out of zip/blob layers and referenced in the manifest as `{ path, protected: { fileId } }`, with no layer reference. The compat mrpack written at publish (`pack.ts:462-493`) excludes them too. |
| `/instances/:id/content` and `/modpack/mods` | Without the capability header: protected files are left out, and the response adds `protectedRequired: true` plus `protectedMessage`. With the header: protected files are listed with `protected: true`. |

### 4.3 New player endpoints (auth plus `checkMembership`; manager and site-admin also allowed)

- `GET /instances/:id/protected` returns `{ files: [{ fileId, targetPath, cipherSize, cipherSha256, plainSha1, plainSize, downloadUrl }] }`. `downloadUrl` is a short-lived signed URL of the `.rlmod`.
- `POST /instances/:id/protected/keys`:
  - Requires the capability header (426 without it).
  - Body: `{ fileIds?: string[] }`, defaulting to all files.
  - Returns `{ keys: [{ fileId, key /* base64 DEK */ }], fingerprint, serverTime, offlineUntil }`.
  - `fingerprint` = base64url(JSON `{ u: userId, i: instanceId, t: serverTime, g: grantId }`) + "." + HMAC-SHA256 with `MOD_FP_SECRET` (`calculateHMAC` from `lib/crypto.ts`).
  - `offlineUntil` = `serverTime + protect_offline_hours`, or `0`.
  - Writes one `protected_key_grants` row.
  - Rate limit: 30 requests/hour per user per instance; returns 429 beyond that.
  - Non-member: 403. Instance not protected: 404.

### 4.4 Management endpoints (manage rights via `canManageInstanceRow`)

- `POST /instances/:id/protection { enabled: boolean, offlineHours?: number }`:
  - `enabled: true` sets `migrating`.
  - `enabled: false` sets `disabling`.
  - Returns `{ state, total, remaining }`.
- `POST /instances/:id/protection/step` processes up to 3 files per call (to stay within Worker CPU/time limits) and returns `{ state, remaining, errors[] }`.
  - **Encrypt step**, per not-yet-protected custom jar:
    1. Stream the plain bytes from storage, encrypt them, and write the `.rlmod`.
    2. Read the `.rlmod` back and check `cipher_sha256`.
    3. Insert the `protected_files` row.
    4. Delete the plain object.
  - **Decrypt step** (`disabling`): the reverse. Write the plain jar, check `plain_sha1`, delete the row and the `.rlmod`.
  - When `remaining == 0`: rebuild `latest.mrpack`, republish pack v2, and set `on` (or `off`).
  - On any error: set `failed`, keep the plain object if it was not yet deleted, and return the error. Calling `/protection` again resumes.
- While `on`, new custom uploads (`/modpack/import` with `.jar`, `/modpack/mods/batch` `file` entries, `PUT /pack/draft/file` for `.jar`) are encrypted before they are stored. The plain bytes are never persisted.

## 5. Management dashboard (`realitylauncher-management`)

- On the instance files page, a **"Protect custom mods"** toggle plus an offline-grace hours input.
- Turning the toggle on or off loops `POST /protection/step` with a progress bar until the state is `on`/`off`. On `failed` it shows the errors and a Retry button.
- A lock badge on protected rows.
- Copy explains the limits: "Prevents copying and re-uploading. Players need Reality Launcher 5.2+. Reality Mini users get public mods only."

## 6. Launcher (`realitylauncher-client`)

### 6.1 New module `src-tauri/src/protected_mods.rs`

It uses `ring::aead` (AES_256_GCM, already a dependency) and `zip` 2 (already a dependency), and adds the new dependency `keyring` 3.

Responsibilities: `sync_protected`, `prepare_launch`, `cleanup_session`, and the grant cache.

On-disk layout per instance:
```
<instance>/.rl-protected/
  <fileId>.rlmod
  index.json      # [{ fileId, targetPath, cipherSha256, plainSha1 }]
  grant.bin       # offline grace cache (optional)
  session.json    # plain files currently written to disk
```

### 6.2 Sync
- Every cloud request sends `X-RL-Capabilities: protected-mods/1` (`cloud.rs`, `pack_v2.rs`).
- If the content response lists protected files, or the pack v2 manifest has `protected` entries:
  1. Call `GET /protected`.
  2. Download with `download::download_batch`, checking `cipherSha256`, into `.rl-protected/`.
  3. Rewrite `index.json`.
  4. Delete `.rlmod` files no longer listed.
- Protected `targetPath`s are **left out** of the `keep` set passed to `cleanup_unmanaged_mods`, so any old plain copy is deleted.
- Fix: the managed-mods fetch currently gets 403 for players (`assertCanManageInstance`). After this change the player path uses `/content` and `/protected`.

### 6.3 Launch (`instances_launch`, before `build_classpath`)
1. Run `cleanup_session` first, which removes any leftovers.
2. If `index.json` is empty, skip the rest.
3. Get keys:
   - Call `POST /protected/keys`.
   - On success: refresh `grant.bin` (§6.5).
   - On a network error: try `grant.bin`.
   - On 401/403: wipe the grant and abort with a "no longer a member" error.
   - On other errors: abort.
4. For each file:
   - stream-decrypt to `<targetPath>.tmp`;
   - check `plainSha1`;
   - `ZipWriter::new_append` adds `META-INF/rl-fp.json` containing `{ fingerprint }`;
   - rename to `targetPath`;
   - append the path to `session.json`, which is written after each file so a crash leaves an accurate list.
5. If any file fails: delete everything in `session.json`, then abort the launch with an error toast.
6. Key bytes are held only in `ring::aead::LessSafeKey` and dropped when the step finishes.

### 6.4 Cleanup
- `cleanup_session` deletes every path in `session.json`, then the file itself. It is skipped while `is_game_running` reports true.
- It runs:
  - after `child.wait()` (`launcher.rs:139`, before `game-stopped` is emitted);
  - at launcher startup for every instance that has `.rl-protected/session.json`;
  - at the start of every launch.

### 6.5 Offline grace
- The device key is 32 random bytes in the OS keychain, entry `reality-launcher/protected-grant`.
- `grant.bin` holds the keys, `fingerprint`, `offlineUntil` and `lastServerTime`, encrypted with AES-256-GCM under the device key.
- It is only used when the key request fails at the network level (connect, DNS or timeout).
- It is rejected if `now > offlineUntil`, if `now < lastServerTime`, or if `offlineUntil == 0`.
- No keychain available: no grace.
- 401/403 from the API: delete `grant.bin` and the keychain entry.

### 6.6 UI
- In the mod list, protected mods show a lock badge, and toggle/delete are disabled (reusing the `locked_mods` path).
- Error toasts, with keys added to both `translations-en.ts` and `translations-th.ts`:
  - not a member
  - offline with no or expired grant
  - decryption failed (corrupt file; re-sync suggested)
  - update required (426)

## 7. Reality Mini (`reality-mini`)
- It never sends the capability header and never receives `.rlmod` files or keys.
- When a response has `protectedRequired: true`, it syncs the public mods and shows `protectedMessage` with a link to download Reality Launcher. It needs new Thai/English strings in `Lang`.

## 8. Testing

**API**
- Encrypt/decrypt round-trip: 0 bytes, 1 byte, exactly 1 MiB, 1 MiB + 1, and 100 MB.
- Truncating, reordering, or flipping a bit in a chunk all fail.
- Key endpoint: non-member gets 403; missing header gets 426; rate limit gets 429; each grant writes its log row.
- After `on`, none of the four leak routes returns plain bytes of a protected file.
- A backfill interrupted after N files resumes correctly; disabling restores byte-identical jars (sha1 match).
- `.rlmod` test vectors are exported to `realitylauncher-client/src-tauri/tests/fixtures/rlmod/`.

**Launcher (`cargo test`)**
- The API's test vectors decrypt in Rust (proves the two implementations match). Tampered vectors fail.
- After the fingerprint is appended, the zip is still valid, all original entries are intact, and `rl-fp.json` is present.
- `cleanup_session` removes the listed files, and also cleans up after a simulated crash mid-write.
- Grace: expired grant rejected; clock rollback rejected; 403 wipes the grant.

**End to end (manual)**
- One Fabric and one Forge instance with one custom jar each.
- Turn protection on, sync, launch, confirm the mod loads, exit, and confirm the jar is absent from `mods/`.
- Repeat offline within the grace period and after it has expired.

## 9. Rollout (launcher first)

The launcher ships support **before** the server feature exists, so most players already run a capable version when protection goes live. The server system is "coming soon" until step 3.

1. **Launcher 5.2 (dormant support).** Sync, launch decryption, cleanup, grace, and the UI from §6.
   - It is inert against today's API: it sends the capability header (ignored today) and acts only when a response contains `protected` entries, `protectedRequired`, or a `/protected` list. With none present, every path behaves exactly like 5.1.0.
   - It is built against this spec as a frozen contract (`protected-mods/1`). The `.rlmod` reference encoder lives in Rust test code, and its test vectors are committed to `src-tauri/tests/fixtures/rlmod/`. The API's encoder must later decrypt-match these vectors. That reverses the direction stated in §8, which said the API generates the vectors.
   - It is tested end to end against a local mock API (the test helper serves `/protected`, `/protected/keys` and `.rlmod` files).
2. **Monitor adoption.** As soon as the API logs the capability header (a one-line change, deployable before anything else), track the share of 5.2+ requests.
3. **API + management dashboard.** Schema, endpoints, leak closure and backfill (§3–§5), deployed with the toggle hidden or labelled "Coming soon".
4. **Reality Mini update** (§7).
5. **Enable the toggle.** CatLab's own instances go first.

Any change to the wire format after 5.2 ships requires bumping the capability version (`protected-mods/2`), with the API serving both versions.

## 10. Phase 2 (not in this spec)
- In-memory decryption for Reality Mini through a Forge mod locator.
- KEK rotation tooling (`kek_id` already allows it).
- Requiring auth on custom jars in unprotected instances.
