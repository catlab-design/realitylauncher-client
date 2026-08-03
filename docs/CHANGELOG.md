## [Unreleased] — 2026-08-03

### Fixed
- Launcher folder migration now emits `instances-updated` so the instance list refreshes after the move — previously it kept showing paths under the old folder until app restart
- Make migration failure-safe: on any error mid-copy (or cancelled), the partially-created destination is deleted and the config is rolled back, so the migration can be retried instead of leaving a broken half-copied folder that blocks future attempts
- Enforce atomicity when saving the migrated path: if the config write fails after the move, the folder is moved back to its original location
- Block install/sync operations and game launch while a folder migration runs (and vice versa) with a shared exclusive operation guard, preventing two processes writing the same instance folders concurrently
- Skip copying the stale `config.json` during migration — the launcher re-writes its own config on next start, so the migrated instance would otherwise inherit the old launcher's settings
- `reset_config` no longer wipes the user's chosen `minecraft_dir`

### Added
- `cancel_migrate` command + `migrate-progress` / `migrate-cancelled` events — the Settings > Game Data Folder flow now shows live progress with a cancel button
- `check_dir_empty` command — picking a non-empty folder prompts to create a `RealityLauncher` subfolder instead of silently failing
- Free-space check before copy (destination must have room for the current folder size)
- Rename fast-path: same-volume moves use `fs::rename` and finish instantly instead of copying

### Changed
- Settings labels corrected: "Select .minecraft folder" / "Game Folder (.minecraft)" → "Select launcher data folder" / "Game Data Folder" (layout is not vanilla-compatible)

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
