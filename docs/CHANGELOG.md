## [Unreleased] — 2026-10-22

### Added
- In-game branding: the game window title is now `Reality Launcher (<game version>-<launcher version>)`, and "Reality Launcher" shows on the title screen and the F3 debug screen. Done with a small bundled Java agent (`agent/`) that patches LWJGL's window title and Forge/NeoForge's title-screen branding; vanilla/Fabric/Quilt show it through `--versionType`.

### Fixed
- Forge/NeoForge install failed on Linux distros that ship zlib-ng (Arch, CachyOS, Fedora 40+) with `Processor failed, invalid outputs` / checksum mismatches. The bundled Corretto JDK compresses through the system zlib-ng, which produces different jar bytes than Forge expects. The loader installer now runs with an installed JDK that bundles its own zlib (same or newer major) when one is available; otherwise the error explains the cause.
- Game Logs: lines were split into two entries when a poll landed mid-line; only complete lines are read now.
- Game Logs: a non-UTF-8 byte or a read starting mid-character dropped a whole chunk of log silently; logs are now decoded lossily.
- Game Logs: Forge logs (`[22Oct2026 13:50:53.856] …`) showed no timestamps.
- Game Logs: stack-trace lines were labelled INFO and hidden by the ERROR/WARN filters; untimestamped lines now inherit the level of the line above.
- Game Logs: Reload rendered the full log uncapped and kept tailing from the old offset (duplicate lines); it now restarts the tail.
- Loader installer failures no longer dump the installer's entire output (~20k lines) into the error; only the last 40 lines are kept.

## [5.0.2] — 2026-10-20

### Fixed
- Game install/launch could fail with `Rename error: …\assets\objects\xx\<hash> - The system cannot find the file specified (os error 2)`. Asset names that share a hash were downloaded twice at once into the same temp file; assets are now de-duplicated and each download uses its own temp file.

## [5.0.1] — 2026-10-18

### Perf
- **Snappier while installing or syncing:**
  - Components subscribe to only the store fields they use, instead of whole stores.
  - The install-progress toast subscribes to progress on its own.
  - The shell, overlays and tabs are memoized, with stable callbacks (`useStableCallback`).
  - Result: progress ticks no longer re-render the whole app (app renders during a 3s progress burst: 26 → 3).
- **Smoother scrolling on Servers:** scrolling no longer re-renders the app on every scroll event (renders 125 → 11 per scroll pass).
- **Faster tab switching for Library and Install:** they stay mounted after the first visit and are hidden instead of torn down, so going back keeps their view and data without rebuilding. Their full-bleed/immersive layout and scroll effects pause while hidden (`src/lib/tabKeepAlive.ts`).
- **Less work while the window is hidden:** looping animations, the rainbow-mode timer and the Home news autoplay pause (`src/lib/pageVisibility.ts`).
- **Faster startup:** startup loads 696 KB of JS instead of 1,998 KB (−65%):
  - tabs other than Home load on demand (`React.lazy`) and are prefetched once the app is idle;
  - vendor code is split into `vendor-react` / `motion` / `gsap` / `markdown` / `skinview3d` chunks;
  - the changelog modal and its markdown stack load on first open.
- **Smaller assets:**
  - The datapack badge icon shrank from a 1.47 MB PNG to a 1 KB WebP.
  - The unused Prompt 300 font weight was dropped.
- **Rust release profile:** thin LTO, `codegen-units = 16`, stripped symbols, `opt-level = 3`.

### Fixed
- Servers › Explore was always empty: the public server list built its request from `window.API_URL`, an Electron-era global that nothing sets under Tauri, so the URL threw and the error was swallowed. The list and the post-update "What's new" changelog now use a shared API base (`src/lib/apiBase.ts`).
- Library and Install, which now stay mounted, reload their instance lists every time you return to them, so instances created or installed elsewhere show up right away.

### Added
- **Performance mode** (Settings › Appearance, off by default) for slower PCs:
  - turns off backdrop blur, page/tab transitions and hover motion (`MotionConfig reducedMotion="always"`), and decorative looping animations;
  - suspends Rainbow Mode while on, without changing the saved choice;
  - loading spinners and skeletons keep running (`src/lib/performanceMode.ts`, `:root[data-perf-lite]`).
- Dev-only performance bench:
  - Run `VITE_PERF_BENCH=1 VITE_PERF_BENCH_EXIT=1 bun run tauri dev`.
  - It cycles tabs, scrolls Install/Servers, fakes a progress burst and runs behavior checks.
  - It prints `PERF_REPORT <json>` via the debug-only `dev_perf_report` command.
  - It is not included in production builds.

## [5.0.0] — 2026-10-18

### Added
- Mirror GitLab releases to GitHub Releases (`mirror:github`, opt-in via `MIRROR_GITHUB_RELEASE`)
- Launcher self-update: re-checks every 30 minutes while open, auto-downloads, then restarts into the new version after a 15-second countdown ("Restart now" / "Later"); while a game is running, or after "Later", the update installs silently when the launcher closes (`set_install_update_on_exit`)
- Windows runs the NSIS installer passively (`/P /R /UPDATE`, progress bar only, relaunches when done); macOS swaps the `.app` out of the downloaded `.dmg` after exit (old bundle kept until the copy succeeds, quarantine flag cleared); Linux replaces the running AppImage in place — falls back to opening the package when the app can't replace itself (deb/rpm installs, read-only locations)
- Server gallery: images uploaded in the Portal show under the server description and in a landscape "Read more" story modal with a 16:9 viewer, thumbnails and lightbox
- Official / Partner verification badges on servers and the instance page
- Server status cards (IP, favicon, live MOTD) and arrow-scrolled rails (`ScrollStrip`) for server carousels and the hero thumbnail rail
- Library "continue playing" hero and Home quick-link tiles inside the news hero
- Skin Manager 3D preview room (white tiles and light tubes, MineDevice-style pixel art) behind the skin model
- Shared motion presets (`src/lib/motion.ts`) with reduced-motion support: page and panel transitions, showcase hero entrances, cascading mod-list rows
- RAM slider presets shared between Settings › Game and the instance Java tab (`RamSlider`, `RamPresetChips`)
- Pack v2 sync: installs server packs from their manifest and layers

### Changed
- About links to the GitLab project (GitLab icon and label)
- CI moved from GitHub Actions to GitLab CI (`.gitlab-ci.yml`): MR/main build check, tag- or manually-triggered multi-platform build, R2 upload and GitLab Release
- Full v5 redesign: title-bar text navigation, Home news billboard, Steam-style Server List, redesigned settings, Install (Explore), instance page, server detail page, Skin Manager, login/CatID/Microsoft modals and toasts with a step log
- Navigation renamed: Modpacks → Library (ไลบรารี), Explore → Install (ติดตั้ง)
- The instance "add content" browser is now the same UI as the Install page (toolbar, list, preview)
- Library cards show the icon beside the name at the top; the auto-update badge is a switch
- Discord Rich Presence (crate 1.x) shows the server / instance name as the activity name while playing
- CatSkinC follows the current mod API and takes its default host from the published `servers.json` (`globalIp`, cached hourly), falling back to `storage-skin.catlabdesign.space`
- Caches with stale-while-revalidate for the server list and images, Install search results and project details, and Home news (with a loading skeleton)

### Fixed
- Saved accounts no longer disappear after login or on a cloud auth error; "Invalid Minecraft access token" on CatID link/refresh fixed by sending a Mojang player-certificate proof (the API can't reach Mojang from Workers)
- Fabric/Quilt instances failed to launch with no main class: the loader profile libraries (loader, intermediary, mixin, asm) were never downloaded
- The progress toast stayed open after a launch's mod sync completed
- The custom background image was never saved: the persisted store exceeded the localStorage quota before the disk save ran
- CatSkinC sync failed with `error sending request for url (https://storage-api.catskin.space/auth/session)`: saved hosts on the retired `catskin.space` domain are migrated to the current default (and rewritten in the instance's `catskinc.json` so the mod follows)
- `default_catskinc_url()` recursed forever when the default host was the built-in one
- Opening an instance from the Library kept the Library's scroll position instead of starting at the top
- Tab indicator pills could land misaligned during page transitions
- The update toast claimed the update "will install on next launch" although nothing installed it

## [4.2.1] — 2026-08-23

### Security
- Replaced the native OpenSSL TLS backend with rustls (`reqwest` `default-features = false` + `rustls-tls`), removing the `openssl` crate from the dependency tree entirely — clears all eight tracked rust-openssl advisories (heap buffer overflows, out-of-bounds reads/writes, undefined behavior)
- Upgraded Vite 5 → 6.4.3, clearing every tracked Vite advisory: the Windows `server.fs.deny` bypass, the optimized-deps path traversal, the launch-editor NTLMv2 hash disclosure (dev-only), and the `.map` handling path traversal
- Updated transitive Rust dependencies across the board (`cargo update`: bytes, time, rand, serde_with, rustls-webpki, and others) to pick up patched releases
- Replaced URL substring matching (`url.includes("discord.gg")`) in ServerDetailView social-link handling with parsed-hostname checks — closes both CodeQL `incomplete-url-substring-sanitization` alerts

### Fixed
- Cloud/server features no longer fail with stale-session errors: every authenticated cloud request (joined servers, join/leave, cloud install/sync, integrity check, invitations, notifications) now detects a 401, transparently force-refreshes the session's API token once (Microsoft chain re-mints it server-side), and retries with the fresh token — a 401 is always rejected before execution, so the retry can never duplicate work; only if the retry also fails does the user see the session-expired prompt
- Cloud manifest/metadata/mod-list fetches used during installs and syncs self-heal the same way, including their ETag-cached revalidation paths
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
