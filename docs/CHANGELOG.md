## [4.2.1] — 2026-08-23

### Security
- Replaced the native OpenSSL TLS backend with rustls (`reqwest` `default-features = false` + `rustls-tls`), removing the `openssl` crate from the dependency tree entirely — clears all eight tracked rust-openssl advisories (heap buffer overflows, out-of-bounds reads/writes, undefined behavior)
- Bumped Vite to 5.4.21, patching the Windows `server.fs.deny` bypass, the optimized-deps path traversal, and the launch-editor NTLMv2 hash disclosure (dev-dependency only)
- Updated transitive Rust dependencies across the board (`cargo update`: bytes, time, rand, serde_with, rustls-webpki, and others) to pick up patched releases
- Replaced URL substring matching (`url.includes("discord.gg")`) in ServerDetailView social-link handling with parsed-hostname checks — closes both CodeQL `incomplete-url-substring-sanitization` alerts

### Fixed
- CurseForge/Modrinth modpacks using NeoForge were installed as Vanilla — the CurseForge manifest loader detection only knew "forge"/"fabric" and the mrpack dependency check had no "neoforge" case; both now detect NeoForge (and CurseForge Quilt) and extract the loader version correctly (`neoforge-21.1.77` → `21.1.77`, legacy `neoforge-1.20.1-47.1.104` → `1.20.1-47.1.104`)
- NeoForge instances launched against the vanilla client jar: the patched-client-jar lookup used the bare loader version while the Maven layout uses `{mc}-{loader}` (e.g. `1.21.1-21.1.77`), so the NeoForge client jar was never found on the classpath; install-time verification, classpath building, and native fingerprinting now all use the same resolved version, and legacy MC-prefixed version strings no longer get the MC version duplicated
- Forge/NeoForge installs could leave missing loader libraries and cryptic launch failures: the installer download had no HTTP-status or integrity check (a Maven error page could be saved as the installer JAR), and the library list produced by the installed loader was never ensured by the launcher — installers are now verified (HTTP status, JAR signature, published Maven SHA-1) and the loader's libraries are downloaded through the retrying download engine after install, including on later launches so partial installs self-repair

## [4.2.0] — 2026-08-19

### Added
- `cancel_migrate` command + `migrate-progress` / `migrate-cancelled` events — the Settings > Game Data Folder flow now shows live progress with a cancel button
- `check_dir_empty` command — picking a non-empty folder prompts to create a `RealityLauncher` subfolder instead of silently failing
- Free-space check before copy (destination must have room for the current folder size)
- Rename fast-path: same-volume moves use `fs::rename` and finish instantly instead of copying
- `install_update` now copies `config.json`/`session.json` to `*.pre-update` before launching the installer; on next start, a missing or unreadable data file is automatically restored from that backup, so even a destructive installer (e.g. an NSIS package that installs or uninstalls into the data folder) can no longer wipe the user's game folder choice and account
- Config and session persistence hardening: writes are atomic (temp file + rename, same pattern as the download engine), unreadable files are kept as `*.bak-<timestamp>` before anything overwrites them, and `minecraft_dir`/`java_path` are salvaged even when the rest of the config file is unparseable
- Open-source README rework with screenshots and unified branding, plus macOS Gatekeeper troubleshooting notes for unsigned builds (#1)
- i18n keys `clearing_cache`, `clearing`, `select_all` (en + th) and `install_as_new_instance`, `loading_versions`, `downloads` (en)

### Changed
- Settings labels corrected: "Select .minecraft folder" / "Game Folder (.minecraft)" → "Select launcher data folder" / "Game Data Folder" (layout is not vanilla-compatible)
- `modpack_cancel_install` now cancels all active per-operation tokens (`cancel_all_active`) instead of flipping a global flag

### Removed
- Dead pre-install wiring and the never-implemented instance export feature: `instancesPreInstall` / `instancesExport` / `instancesExportCancel` / `instanceCancelAction` removed from the `api.ts` bridge and `env.d.ts`, the export tab and its progress toasts deleted, and `progressStore` no longer carries export state (#9, #1)

### Fixed
- Full builds (`tauri build` / CI) failed with 22 `cannot find op_guard in the crate root` errors — the module was declared in `lib.rs` but missing from `main.rs`'s module list
- macOS update check requested the server's `downloads.macos` key, but the server publishes `downloads.mac` — the in-app updater on macOS silently found no download; the platform key now matches (`mac`)
- Downloaded update installers were saved with the URL's percent-escaped filename literally (e.g. `reality-update-Reality%20Launcher_4.1.0_…`) — the name is now URL-decoded before writing to disk
- A `config.json` missing one optional key (e.g. `ramMB`, `closeLauncherOnGameStart`, `discordRpcEnabled`, `autoUpdateEnabled`, `theme` — written by an older build or truncated by a crash) no longer makes the entire file unreadable and silently resets the launcher to defaults, which made the app "forget" the user's game folder after an update; missing keys now deserialize to safe defaults (`ramMB` → 4096) and `minecraft_dir` survives
- Launcher folder migration is failure-safe: on any error mid-copy (or cancelled), the partially-created destination is deleted and the config is rolled back, so the migration can be retried instead of leaving a broken half-copied folder that blocks future attempts
- Migration save-failure no longer deletes the moved folder on the rename path (the new location was the only copy) — the move is kept and the user is told the config is stale; a copy-path migration still rolls back safely when persisting fails (#1)
- Migration now emits `instances-updated` so the instance list refreshes after the move — previously it kept showing paths under the old folder until app restart
- Install/sync operations and game launch are blocked while a folder migration runs (and vice versa) with a shared exclusive operation guard, preventing two processes writing the same instance folders concurrently
- Skip copying the stale `config.json` during migration — the launcher re-writes its own config on next start, so the migrated instance would otherwise inherit the old launcher's settings
- `config_set` rejects a `minecraft_dir` that isn't an absolute existing path; `reset_config` preserves `minecraft_dir`, `java_path`, and `java_paths` (#13, #14)
- Instance ids like `..`, `.`, empty, or containing path separators can no longer escape the instances folder — unsafe ids are clamped to a `__invalid__…` sub-folder and unique-id generation sanitizes/falls back (#2)
- Mod/resourcepack/datapack filenames are sanitized before toggle/delete so `../` or absolute paths can't target files outside the instance dir (#3)
- Launch arguments printed to stdout no longer leak the Microsoft access token (`[REDACTED]`) (#4)
- Killing a game bumps a launch generation counter; a stale launch whose sync phase outlived a kill/relaunch aborts instead of registering an orphaned, unstoppable process, and `kill_game` now emits `game-stopped` (#5, #16)
- Installs/syncs/repairs now guard against overlapping with migrations and each other (`instance_check_integrity`, `instance_install_content`, `content_download_to_instance`, `instances_delete`, `instances_duplicate`); deleting a running instance is rejected (#6, #17)
- Cancel is per-operation: a Cancel request marks only currently-registered operations, and starting a new install no longer wipes a cancel the user already pressed (#7)
- All-failed modpack/cloud installs now emit a terminal error event and delete the broken instance instead of leaving the UI stuck at 99% (#8)
- Global install-progress handler no longer hijacks the UI during a launch's server-mod sync (sync-* events are ignored unless an install/repair is actually in flight), and sync events no longer trigger a fake "complete" at 100% mid-operation (#2, #3)
- Cancel handler resets install state even when the cancel command rejects (modal can no longer stick), and repair no longer shows a contradictory error toast after a user cancel (#4, #9)
- ServerMenu launch now has the same 120s timeout as ModPack, so a stalled backend launch can't lock all play buttons forever (#5)
- LiveLog pause no longer clears the log view or resets the tail offset — pause state is tracked via a ref so the poll loop keeps its position (#6)
- JoinInstanceDialog success timeout no longer fires after the user closed the dialog (#11)
- `link_catid` timestamp was interpreted as seconds instead of milliseconds, producing a 1970-01-01 expiry sent to the server — now `from_timestamp_millis` (#10)
- `login_catid` no longer panics on a response missing `token` (#11)
- Concurrent `auth_refresh` calls coalesce behind a single-flight lock; a second caller re-checks expiry instead of double-refreshing (#15)
- Asset-index verified markers are keyed by index id + sha1 of the index file, so a re-downloaded index invalidates the stale marker and assets are re-verified (#12)
- Fixed double-encoded Thai mojibake fallback strings in Explore/ModPack toasts

## [4.1.1] — 2026-08-02


### Fixed
- Auto Update toggle now actually auto-downloads updates in the background when enabled, matching its stated description (install still requires the manual "Install & Restart" button)
- `download_update` now streams to a `.tmp` file and only renames it onto the final path after a full, error-free download, so a dropped connection can no longer leave a truncated installer marked as successfully downloaded
- Guard `download_update` against concurrent invocations (e.g. auto-update firing while the user also clicks Download) with an in-flight flag, preventing two writers racing on the same installer file
- Remove a duplicate, unconditional `onUpdateAvailable`/`onUpdateDownloaded` listener block in `LauncherApp.tsx` left over from the Electron migration — it fired alongside the auto-update listener on every event, producing conflicting duplicate toasts
- Skip re-triggering `downloadUpdate()` for a version already being/been auto-downloaded — `check_latest_version` re-emits `update-available` on every re-check (app launch, opening Settings > Update, manual check), which was restarting the download each time
- `download_update` now short-circuits and re-announces the existing file when the requested version was already downloaded and is still on disk, instead of re-fetching the whole installer

## [4.1.0] — 2026-07-23

### Fixed
- Add `-XstartOnFirstThread` for macOS M1 — LWJGL/GLFW was crashing on launch with `ExceptionInInitializerError`
- Wire `instance.java_arguments` into `build_jvm_args` — custom JVM args set in the UI were being silently ignored
- Fix mod list cache: replace `dir_mtime` comparison with `file_count` to avoid stale cache on macOS where directory mtime may not update when .jar files are added

## [4.0.3] — 2026-07-23

### Fixed
- Remove 30s total request timeout from HTTP_CLIENT which killed large modpack/JAR downloads exceeding 30 seconds (#1)
- Forward cancel flag to retry loop so mid-download cancellation actually works (#2)
- Replace stale one-time cancel snapshot with dynamic AtomicBool check through the full download lifecycle (#3)
- Fix race condition between kill_game and game launch that could orphan a spawned child process (#4)
- Remove phantom `instanceId` parameter sent from TypeScript to parameterless Rust `kill_game` (#5)
- Replace `.unwrap()` on semaphore acquire with proper error propagation in modpack.rs and launcher.rs (#6)
- Replace `.unwrap()` on JSON serialization with `?` propagation in launcher.rs (#7)
- Use `CANCELLED_SENTINEL` constant instead of hardcoded `"Cancelled"` string in cloud.rs (#8)
- Log warning for panicked download tasks instead of silent discard (#9)
- Add `console.warn` fallback when RAM prefetch fails instead of empty `catch {}` (#10)
