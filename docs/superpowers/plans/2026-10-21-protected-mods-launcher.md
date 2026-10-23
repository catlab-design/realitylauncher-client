# Protected Mods — Launcher Support (5.2, dormant) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship launcher support for encrypted custom mods (`.rlmod`), so it is already installed on most players' machines before the server feature launches. Against today's API it must behave exactly like 5.1.0.

**Architecture:** A new Rust module directory, `src-tauri/src/protected_mods/`, owns everything protected:
- the `.rlmod` format;
- the on-disk index and session files;
- the HTTP calls;
- the offline grant;
- sync;
- launch-time decryption and cleanup.

Existing sync code only (a) sends the capability header, (b) skips entries marked protected, and (c) reports whether it saw any. The launcher then calls into the module. Everything is gated on server markers that today's API never sends.

**Tech Stack:** Rust (Tauri 2). `ring` 0.17 (`aead::AES_256_GCM`, `rand::SystemRandom`), `zip` 2, `sha1`/`sha2`, `reqwest`, plus the new crate `keyring` 3. Dev-only: `wiremock` 0.6 and `tempfile` 3. React/TS for the badge and error strings.

**Spec:** `docs/superpowers/specs/2026-10-20-protected-custom-mods-design.md` (§2, §6, §8 launcher part, §9 step 1)

## Global Constraints

- **Capability header:** `X-RL-Capabilities: protected-mods/1`, on every request to `https://api.reality.catlabdesign.space` made by `cloud.rs`, `pack_v2.rs` and `protected_mods`.
- **`.rlmod` v1 header (32 bytes, exact):**
  - `"RLM1"`
  - version `0x01`
  - 16-byte fileId (UUID bytes)
  - 7-byte base nonce
  - u32 BE chunk size = `1_048_576`
- **Chunks:**
  - AES-256-GCM, plaintext of at most 1 MiB, 16-byte tag.
  - Nonce = base(7) ‖ index u32 BE(4) ‖ final(1: `0x01` on the last chunk, else `0x00`).
  - AAD = the 32-byte header.
  - An empty file is one final chunk with an empty plaintext.
- **On-disk layout:** `<instance>/.rl-protected/{<fileId>.rlmod, index.json, grant.bin, session.json}`.
- **Keychain entry:** service `reality-launcher`, user `protected-grant`.
- **Fingerprint entry:** `META-INF/rl-fp.json` with content `{"fingerprint":"<token>"}`.
- **Times:** `serverTime` and `offlineUntil` are Unix **seconds**. `offlineUntil == 0` means no grace.
- **Wire field names are camelCase:**
  - `fileId`, `targetPath`, `cipherSize`, `cipherSha256`, `plainSha1`, `plainSize`, `downloadUrl`
  - `keys[{fileId,key}]` (key is base64 standard), `fingerprint`, `serverTime`, `offlineUntil`
  - `protectedRequired`, `protectedMessage`
  - `protected` (bool on content mods; `{fileId}` on pack v2 files)
- **Endpoints:** `GET {base}/instances/{cloudId}/protected` and `POST {base}/instances/{cloudId}/protected/keys`. The POST body is `{}`.
- **Launch error strings are machine codes** `protected:<code>`, where `<code>` ∈ `not_member | offline | decrypt_failed | update_required | rate_limited | unavailable`. The UI maps them to i18n keys `protected_error_<code>`.
- **Dormant:** with no protected markers in any response, the code makes no extra network requests and touches no `.rl-protected/` files, except purging a stale `.rl-protected/` (Task 6).
- Never remove `WEBKIT_DISABLE_DMABUF_RENDERER` (CLAUDE.md gotcha 14).
- **Never log key bytes, the bearer token or the fingerprint.** That covers `println!`, `emit_progress` and `launch_log` (CLAUDE.md gotcha 20). Log file counts and fileIds only.

## Review Focus

1. **Launcher killed or PC crash while the game runs.** Plain jars must be gone after the next launcher start, and never deleted while that instance's game is still running. Test: Task 3 `cleanup_skips_running_instance` and `cleanup_after_partial_session`.
2. **The player has their own jar with the same filename as a protected target.** Cleanup must delete only paths recorded in `session.json`, never a file it did not write. Test: Task 3 `cleanup_only_removes_listed_paths`.
3. **Disk full or interrupted decrypt.** No `.tmp` and no half-written jar may survive a failed `prepare_launch`. Test: Task 7 `failed_file_rolls_back_all_written`.
4. **The server turns protection off.** The next sync must purge `.rl-protected/` so stale encrypted mods are never launched. Test: Task 6 `purges_when_not_seen`.
5. **A hostile `targetPath` from the server** (`../`, absolute, outside `mods/`). It must be rejected, not written. Test: Task 6 `rejects_unsafe_target_path`.

---

### Task 1: `.rlmod` format (decrypt + reference encoder + vectors)

**Files:**
- Create: `src-tauri/src/protected_mods/mod.rs` (declares `pub mod format; pub mod fingerprint; pub mod store; pub mod api; pub mod grant; pub mod sync; pub mod launch;`). Each later task adds its file.
- Create: `src-tauri/src/protected_mods/format.rs`
- Create: `src-tauri/tests/fixtures/rlmod/` (`vectors.json` plus `*.rlmod`)
- Modify: `src-tauri/src/lib.rs` (add `pub mod protected_mods;`)
- Modify: `src-tauri/Cargo.toml`: add `[dev-dependencies] tempfile = "3"`

**Interfaces:**
- Produces:
  - `pub const CHUNK_SIZE: usize = 1_048_576;`
  - `pub enum RlmodError { BadHeader, UnsupportedVersion(u8), FileIdMismatch, Decrypt { chunk: u32 }, Truncated, TrailingData, Io(std::io::Error) }`, which implements `Display`.
  - `pub fn decrypt_stream<R: Read, W: Write>(src: R, dst: W, key: &[u8; 32], expected_file_id: &[u8; 16]) -> Result<u64, RlmodError>`. It returns the number of plaintext bytes written and streams one chunk at a time.
  - `#[cfg(test)] pub fn encrypt_stream<R: Read, W: Write>(src: R, dst: W, key: &[u8;32], file_id: &[u8;16], base_nonce: &[u8;7]) -> io::Result<()>`. This is the reference encoder, test-only.

- [ ] **Step 1: Write failing tests in `format.rs` `mod tests`**
  - `roundtrip_sizes`: for each length in `[0, 1, CHUNK_SIZE-1, CHUNK_SIZE, CHUNK_SIZE+1, 3*CHUNK_SIZE+5]`, encrypt then `decrypt_stream` gives identical bytes and a returned length equal to the input length.
  - `truncated_last_chunk_fails`: drop the final chunk, giving `Err(Truncated)` or `Err(Decrypt{..})`. Neither can be `Ok`.
  - `reordered_chunks_fail`: swap chunks 0 and 1 of a 3-chunk file, giving `Err(Decrypt{chunk:0})`.
  - `bitflip_fails`: flip one byte in chunk 1, giving `Err(Decrypt{chunk:1})`.
  - `appended_data_fails`: append 20 random bytes after the final chunk, giving `Err(TrailingData)`.
  - `wrong_file_id_fails`: giving `Err(FileIdMismatch)`.
  - `bad_magic` / `bad_version`: giving `BadHeader` / `UnsupportedVersion(2)`.
  - `fixture_vectors_decrypt`: read `tests/fixtures/rlmod/vectors.json` (`[{name, keyB64, fileIdHex, plainSha1, file}]`) and assert that the sha1 of the decrypted output equals `plainSha1`.
- [ ] **Step 2:** Run `cargo test --lib protected_mods::format`. Expected: compile failure, because nothing is defined yet.
- [ ] **Step 3: Implement.**
  - The decoder reads the header, then reads up to `CHUNK_SIZE + 16` bytes per chunk.
  - It knows a chunk is final by peeking one byte ahead. EOF after the chunk means final; then any further data is `TrailingData`.
  - Open each chunk with `LessSafeKey::open_in_place` using `Aad::from(header)`.
  - The test encoder mirrors this.
  - Add an `#[ignore]` test `regen_fixtures` that writes three vectors (0 B, 10 B, `CHUNK_SIZE+7` B, using deterministic plaintext `i as u8`) plus `vectors.json`. Run it once with `cargo test --lib regen_fixtures -- --ignored` and commit the output. These vectors are the frozen contract the API must match.
- [ ] **Step 4:** Run `cargo test --lib protected_mods::format`. Expected: all pass.
- [ ] **Step 5: Commit**: `feat(protected): .rlmod v1 stream decoder + frozen test vectors`

### Task 2: Fingerprint append

**Files:** Create `src-tauri/src/protected_mods/fingerprint.rs`

**Interfaces:**
- Produces: `pub fn append_fingerprint(jar: &Path, fingerprint: &str) -> Result<(), String>`. It opens the file read+write and uses `zip::ZipWriter::new_append`. If `META-INF/rl-fp.json` already exists, it leaves the jar unchanged and returns `Ok`, so duplicate zip entries never happen.

- [ ] **Step 1: Failing tests**
  - `appends_entry_and_keeps_originals`: build a jar in a tempdir with entries `a.class` and `META-INF/MANIFEST.MF`. After appending, `ZipArchive` lists all 3 entries, the original bytes are equal, and `rl-fp.json` parses to `{"fingerprint":"tok"}`.
  - `existing_entry_is_left_alone`: a jar that already has `META-INF/rl-fp.json` comes out byte-identical.
  - `not_a_zip_errors`: gives `Err`.
- [ ] **Step 2:** Run `cargo test --lib protected_mods::fingerprint`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(protected): per-user fingerprint entry`

### Task 3: Index and session store, cleanup

**Files:** Create `src-tauri/src/protected_mods/store.rs`

**Interfaces:**
- Produces:
  - `pub const DIR: &str = ".rl-protected";`
  - `#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)] #[serde(rename_all="camelCase")] pub struct IndexEntry { pub file_id: String, pub target_path: String, pub cipher_sha256: String, pub plain_sha1: String }`
  - `pub fn read_index(instance_dir: &Path) -> Vec<IndexEntry>` (a missing or corrupt file gives an empty vec)
  - `pub fn write_index(instance_dir: &Path, entries: &[IndexEntry]) -> io::Result<()>` (atomic: temp file + rename)
  - `pub fn session_add(instance_dir: &Path, written: &Path) -> io::Result<()>` (rewrites `session.json` atomically each call; holds absolute paths)
  - `pub fn cleanup_session(instance_dir: &Path, instance_id: &str) -> io::Result<usize>`:
    - Returns `Ok(0)` without touching anything if `crate::launcher::is_game_running(Some(instance_id.into()))`.
    - Otherwise deletes every listed path that is inside `instance_dir`, plus its sibling `<path>.tmp`, then deletes `session.json`.
    - Returns the count deleted.
  - `pub fn purge(instance_dir: &Path) -> io::Result<()>`: runs `cleanup_session` semantics, then removes the whole `DIR`.

- [ ] **Step 1: Failing tests (tempdir)**
  - `index_roundtrip`
  - `corrupt_index_is_empty`
  - `cleanup_only_removes_listed_paths`: `mods/a.jar` is in the session and `mods/b.jar` is not. Only `a` is removed.
  - `cleanup_after_partial_session`: the session lists 1 file and `mods/x.jar.tmp` also exists. Both are removed.
  - `cleanup_ignores_paths_outside_instance`: a session entry `/etc/passwd` is not touched and is not counted.
  - `cleanup_skips_running_instance`: set `PLAYING_INSTANCE_ID` to the id (it may need a `pub(crate)` test setter on `launcher.rs`). The files stay.
- [ ] **Step 2:** Run `cargo test --lib protected_mods::store`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(protected): index/session store with safe cleanup`

### Task 4: API client

**Files:**
- Create: `src-tauri/src/protected_mods/api.rs`
- Modify: `Cargo.toml` `[dev-dependencies] wiremock = "0.6"`

**Interfaces:**
- Produces:
  - `pub const CAPABILITY: (&str, &str) = ("X-RL-Capabilities", "protected-mods/1");`
  - `pub enum ApiError { Network(String), Unauthorized, Forbidden, NotProtected, UpgradeRequired, RateLimited, Other(String) }`. These map from a reqwest connect/timeout error and from 401, 403, 404, 426 and 429.
  - `pub struct ProtectedFile { file_id, target_path, cipher_size: u64, cipher_sha256, plain_sha1, plain_size: u64, download_url }` (serde camelCase)
  - `pub struct KeyGrant { pub keys: Vec<FileKey>, pub fingerprint: String, pub server_time: i64, pub offline_until: i64 }` and `pub struct FileKey { pub file_id: String, pub key: String }`
  - `pub async fn fetch_list(base: &str, cloud_id: &str, token: &str) -> Result<Vec<ProtectedFile>, ApiError>`, which reads `{files:[…]}`
  - `pub async fn fetch_keys(base: &str, cloud_id: &str, token: &str) -> Result<KeyGrant, ApiError>`
  - Both send `Authorization: Bearer` plus `CAPABILITY` and use `crate::http_client::HTTP_CLIENT`. `base` is a parameter so tests can point it at a mock server.

- [ ] **Step 1: Failing tests (`#[tokio::test]`, wiremock)**
  - `list_parses_and_sends_headers`: the mock matches `header("X-RL-Capabilities","protected-mods/1")` and the bearer token.
  - `status_mapping`: 401, 403, 404, 426 and 429 each give the matching variant.
  - `connection_refused_is_network`: base `http://127.0.0.1:1` gives `Network(_)`.
- [ ] **Step 2:** Run `cargo test --lib protected_mods::api`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(protected): API client for list/keys`

### Task 5: Offline grant cache

**Files:**
- Create: `src-tauri/src/protected_mods/grant.rs`
- Modify: `Cargo.toml` `keyring = { version = "3", features = ["apple-native", "windows-native", "sync-secret-service", "crypto-rust"] }`

**Interfaces:**
- Consumes: `api::KeyGrant`
- Produces:
  - `pub trait SecretStore { fn get(&self) -> Option<[u8;32]>; fn set(&self, k: &[u8;32]) -> bool; fn delete(&self); }`
  - `pub struct OsKeychain;` (uses `keyring::Entry::new("reality-launcher","protected-grant")`; any error counts as unavailable)
  - `#[cfg(test)] pub struct MemStore`
  - `pub fn save(instance_dir: &Path, grant: &KeyGrant, store: &dyn SecretStore) -> bool`:
    - Does nothing and returns `false` if `offline_until == 0` or the keychain is unavailable.
    - Otherwise serializes `{grant, lastServerTime: grant.server_time}` as JSON.
    - Seals it with AES-256-GCM under the device key, which is created with `SystemRandom` if absent.
    - Writes `grant.bin` = nonce ‖ ciphertext.
  - `pub fn load(instance_dir: &Path, now: i64, store: &dyn SecretStore) -> Option<KeyGrant>`. Returns `None` if any of these hold: the file or key is missing, decryption fails, `offline_until == 0`, `now > offline_until`, or `now < last_server_time`.
  - `pub fn wipe(instance_dir: &Path, store: &dyn SecretStore)` deletes `grant.bin` and calls `store.delete()`.

- [ ] **Step 1: Failing tests (MemStore, tempdir)**
  - `save_then_load_within_window`
  - `expired_rejected`: `now = offline_until + 1`
  - `clock_rollback_rejected`: `now = server_time - 1`
  - `zero_offline_not_saved`
  - `wipe_removes_both`
  - `no_keychain_means_no_grace`: a store whose `set` returns `false` makes `save` return `false` and writes no file.
- [ ] **Step 2:** Run `cargo test --lib protected_mods::grant`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(protected): offline grace grant cache`

### Task 6: Protected sync

**Files:** Create `src-tauri/src/protected_mods/sync.rs`

**Interfaces:**
- Consumes: `api::fetch_list`, `store::{read_index, write_index, purge, DIR}`, `crate::cloud::safe_join`, `crate::download::{download_batch, DownloadItem, DownloadConfig}`
- Produces: `pub async fn sync_protected(base: &str, instance_dir: &Path, cloud_id: &str, token: &str, seen: bool) -> Result<Vec<(String, String)>, String>`. It returns failures as `(targetPath, reason)`.
  - `seen == false`: if `DIR` exists, call `purge`, then return `Ok(vec![])` with no network call.
  - `seen == true`, in order:
    1. Call `fetch_list`. `NotProtected` means purge and return `Ok(vec![])`.
    2. Reject any entry whose `target_path` is not inside `instance_dir` via `safe_join`, or does not start with `mods/` or end with `.jar`. Each rejected entry goes into failures as `"Unsafe path"`.
    3. Download missing or changed `<fileId>.rlmod` files. Each `DownloadItem` gets `hashes["sha256"] = cipher_sha256`. Skip files whose existing sha256 already matches.
    4. Delete `.rlmod` files that are no longer listed.
    5. Write the index from the accepted entries that downloaded successfully.
    6. Delete a stale plain jar at each `target_path` if it exists and is not listed in `session.json`, because that is the pre-protection copy.
  - Other `ApiError`s become `Err("protected:<code>")`: `Network` → `unavailable`, `Forbidden` → `not_member`, `UpgradeRequired` → `update_required`, `RateLimited` → `rate_limited`.

- [ ] **Step 1: Failing tests (wiremock serves the list and the `.rlmod` bytes from the Task 1 fixtures)**
  - `downloads_and_indexes`
  - `skips_unchanged`: the second run makes no GET to the file URL (`expect(1)` on the mock)
  - `removes_unlisted_rlmod`
  - `purges_when_not_seen`: no request is made (the mock has `expect(0)`)
  - `not_protected_404_purges`
  - `rejects_unsafe_target_path`: inputs `../evil.jar`, `/abs.jar`, `config/x.jar`
  - `deletes_stale_plain_copy`
  - `hash_mismatch_is_failure`
- [ ] **Step 2:** Run `cargo test --lib protected_mods::sync`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(protected): sync encrypted mods into .rl-protected`

### Task 7: Launch-time decryption

**Files:** Create `src-tauri/src/protected_mods/launch.rs`

**Interfaces:**
- Consumes: Tasks 1–5
- Produces: `pub async fn prepare_launch(base: &str, instance_dir: &Path, instance_id: &str, cloud_id: &str, token: &str, store: &dyn SecretStore, now: i64) -> Result<usize, String>`. It returns the number of jars written.
  1. Run `store::cleanup_session`. If `read_index` is empty, return `Ok(0)` with no network call.
  2. Call `fetch_keys`.
     - `Ok`: run `grant::save`.
     - `Network`: run `grant::load`, and if that gives `None`, return `Err("protected:offline")`.
     - `Unauthorized`/`Forbidden`: run `grant::wipe` and return `Err("protected:not_member")`.
     - Other errors map as in Task 6.
  3. For each index entry:
     - A missing key gives `decrypt_failed`.
     - Decode the base64 key into `[u8;32]` and parse `file_id` with `uuid`-free hex parsing (strip dashes, 32 hex chars into 16 bytes).
     - Call `session_add(<target>)` **before** writing.
     - `decrypt_stream` into `<target>.tmp`.
     - Check `plain_sha1`, then `append_fingerprint`, then rename to the target.
  4. On any error: run `cleanup_session` and return `Err("protected:decrypt_failed")`, or the API code from step 2.
- Also produces `pub fn cleanup_all_instances()`. It iterates `crate::instances::instances_list_sync()` and calls `cleanup_session` for every instance directory that has `DIR/session.json`.

- [ ] **Step 1: Failing tests (wiremock keys plus fixture `.rlmod` placed in a temp instance with an index)**
  - `writes_fingerprinted_jars`
  - `empty_index_makes_no_request`: `expect(0)`
  - `offline_uses_grant`: first an online run saves a grant into MemStore; then base `http://127.0.0.1:1` succeeds
  - `offline_without_grant_errors`: gives `protected:offline`
  - `forbidden_wipes_grant`: gives `protected:not_member`, and a later `grant::load` returns `None`
  - `failed_file_rolls_back_all_written`: the second entry's sha1 is wrong. Afterwards no target jar, no `.tmp` and no `session.json` remain
- [ ] **Step 2:** Run `cargo test --lib protected_mods::launch`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(protected): decrypt protected mods at launch with rollback`

### Task 8: Wire into existing sync (header, skip markers, report `seen`)

**Files:**
- Modify: `src-tauri/src/pack_v2.rs`:
  - `fetch_manifest` (line 348): add `CAPABILITY`.
  - `FileEntry` (line 55): `url` and `layer` become `Option`/`#[serde(default)]`, and add `#[serde(default)] protected: Option<ProtectedRef>` where `struct ProtectedRef { file_id: String }`.
  - `wants_from`: skip protected files.
  - `Outcome::Synced` becomes `Synced { failed: Vec<(String,String)>, protected_seen: bool }`.
- Modify: `src-tauri/src/cloud.rs`:
  - `ServerMod` (line 19) and `ManagedMod` (line 78) get `#[serde(default)] pub protected: bool`.
  - `ServerContentPayload` gets `#[serde(default)] protected_required: bool`.
  - Add `CAPABILITY` to the content (lines 471–473), managed (`fetch_managed_mods`, line 675) and pack fetches.
  - In `sync_managed_mods` and the `/content` path, protected entries are neither downloaded nor added to `keep`.
  - `sync_server_mods` returns `Result<(Vec<(String,String)>, bool), String>`, where the bool is `protected_seen` (any protected marker, or `protected_required`).
  - `sync_instance_for_launch` and `cloud_instance_sync_managed`, plus every other caller of `sync_server_mods`/`sync_managed_mods` (find them with `grep -n "sync_server_mods(\|sync_managed_mods(" src-tauri/src`), call `crate::protected_mods::sync::sync_protected(API_URL, dir, cloud_id, &token, seen)` after the existing sync and append its failures.

- Modify: `src-tauri/src/protected_mods/mod.rs`: add `pub fn api_base() -> String`. It returns `std::env::var("RL_API_BASE")` when `cfg!(debug_assertions)` and the variable is set; otherwise it returns `"https://api.reality.catlabdesign.space"`. The pack manifest, content, managed-mods and protected calls use it instead of the `API_URL` const. Release builds ignore the variable.

**Interfaces:**
- Consumes: `sync_protected` (Task 6) and `api::CAPABILITY` (Task 4).
- Produces:
  - `protected_mods::api_base()`.
  - `sync_instance_for_launch` keeps its signature `Result<Vec<(String,String)>, String>`.

- [ ] **Step 1: Failing tests**
  - In `pack_v2.rs` tests: `wants_from_skips_protected` (a manifest JSON with `files:[{path:"mods/x.jar",protected:{fileId:"…"}}]` gives no Want and reports seen).
  - In `cloud.rs` tests: `server_mod_protected_parses` and `content_without_protected_fields_parses` (a 5.1.0-era JSON still parses with `protected == false`).
- [ ] **Step 2:** Run `cargo test --lib pack_v2 cloud`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `cargo test --lib` and `cargo check --lib`. Expected: PASS and clean.
- [ ] **Step 5: Commit**: `feat(protected): capability header and protected markers in cloud sync`

### Task 9: Wire into launch and lifecycle

**Files:**
- Modify: `src-tauri/src/launcher.rs`:
  - In `launch_game`, before the "classpath" `emit_progress` (line 630): if `instance.cloud_id` is set, `emit_progress(&app,"protected","Preparing protected mods...",0.84)`, then `prepare_launch(API_URL, &instance_dir, &instance.id, cloud_id, &token, &OsKeychain, chrono::Utc::now().timestamp())` and propagate `Err`. Get the token the way `cloud::get_api_token` does; make it `pub(crate)`.
  - In the monitor `PollResult::Stopped` branch (line 891, before the `game-stopped` emit) and in `kill_game` (line 137) after the child is cleared: clear `PLAYING_INSTANCE_ID` first, then `protected_mods::store::cleanup_session(&dir, &id)`. `cleanup_session` refuses to run while the instance counts as playing, so the order matters.
  - **Abandoned or failed launch:** when `launch_game` returns `Err` after `prepare_launch` succeeded, or drops its child because `cancel_launch` bumped `LAUNCH_GENERATION` (CLAUDE.md gotcha 19), call `cleanup_session` before returning. Decrypted jars must never outlive a launch that didn't start a game.
- Modify: `src-tauri/src/main.rs` `.setup` (line 220): `std::thread::spawn(protected_mods::launch::cleanup_all_instances);`

- [ ] **Step 1:** Implement. These are glue-only edits and are covered by the Task 3 and Task 7 tests.
- [ ] **Step 2:** Run `cargo check --lib && cargo test --lib`. Expected: clean, all pass.
- [ ] **Step 3: Manual dormant check.** `bun run tauri dev`. Launch an existing cloud instance and a local instance. Both launch exactly as before, and no `.rl-protected/` directory is created.
- [ ] **Step 4: Manual protected check against a mock.** Also press Play, then cancel while "Preparing protected mods..." shows, and confirm `mods/` has no protected jar.
  - Run a wiremock-based example `src-tauri/examples/mock_protected_api.rs` for cloud id `mock`. It serves:
    - `/instances/mock/pack/manifest` → 404
    - `/instances/mock/content` → `{mods:[{filename:"mods/fixture.jar",protected:true}]}`
    - `/protected` and `/protected/keys`
    - the fixture `.rlmod`
  - Set a test instance's `cloudId` to `mock` and run `RL_API_BASE=http://127.0.0.1:<port> bun run tauri dev`.
  - Sync, launch, and confirm the jar is in `mods/` with `META-INF/rl-fp.json`. Quit the game and confirm the jar is gone.
  - Kill the launcher mid-game, relaunch the launcher after the game exits, and confirm the jar is gone.
- [ ] **Step 5: Commit**: `feat(protected): decrypt before classpath, clean up on exit and startup`

### Task 10: Mod list, guards, UI strings

**Files:**
- Modify: `src-tauri/src/content.rs`:
  - `instance_list_mods` (line 422): append one row per `read_index` entry whose target jar is not on disk (filename = the target basename, enabled, `protected: true`). Mark on-disk rows `protected` too when they match an index target.
  - Add `protected` to the row JSON. Invalidate `MOD_LIST_CACHE` after a protected sync.
  - `instance_toggle_mod` (84), `instance_delete_mod` (89) and `instance_toggle_lock` (1232) return an error for protected filenames.
- Modify: `src/types/launcher.ts` (`ModInfo.protected?: boolean`)
- Modify: `src/components/tabs/ModPackTabs/LazyModItem.tsx`: badge `t('protected_badge')` next to the locked badge (line 256); toggle, delete and lock are disabled when `mod.protected`.
- Modify: `src/components/tabs/ModPack.tsx:318` and `src/components/tabs/ServerMenu.tsx:373`: if `errorMessage.startsWith('protected:')`, show `t('protected_error_' + code)`.
- Modify: `src/i18n/translations-en.ts` and `src/i18n/translations-th.ts`. Add the keys `protected_badge` and `protected_error_{not_member,offline,decrypt_failed,update_required,rate_limited,unavailable}` with this English copy:
  - **Protected**
  - You're no longer a member of this server.
  - Can't reach the server and offline access has expired. Connect to the internet and try again.
  - A protected mod is damaged. Sync the instance and try again.
  - Please update Reality Launcher to play this server.
  - Too many launches in a short time. Wait a few minutes and try again.
  - The server is unavailable right now. Try again later.

  Write natural Thai equivalents.

- [ ] **Step 1: Failing test (`content.rs`)** `list_includes_protected_virtual_rows` (a temp instance with an index and no jar gives a row with `protected: true`).
- [ ] **Step 2:** Run `cargo test --lib content`. Expected: FAIL.
- [ ] **Step 3:** Implement the Rust and TS changes.
- [ ] **Step 4:** Run `cargo test --lib && bun test && bun run check:bridge`. Expected: all pass.
- [ ] **Step 5: Commit**: `feat(protected): show protected mods as locked, localized launch errors`

### Task 11: Docs

**Files:** `docs/CHANGELOG.md`, `CLAUDE.md`

- [ ] **Step 1:** In CHANGELOG `[Unreleased]`, under **Added**, add: "Launcher support for protected (encrypted) server mods. Inactive until servers enable it."
- [ ] **Step 2:** In `CLAUDE.md`:
  - §2 Rust tree: add `protected_mods/` with a one-line description of each file.
  - §6: list the new test modules and the fixtures dir.
  - §9: add a gotcha. The `.rlmod` vectors in `src-tauri/tests/fixtures/rlmod/` are a frozen wire contract; changing the format requires `protected-mods/2`.
- [ ] **Step 3:** Run the pre-commit checklist: `cargo check --lib`, `bun test`, `bun run check:bridge`. Expected: all clean.
- [ ] **Step 4: Commit**: `docs: protected mods launcher support`
