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

### Perf
- Create global `http_client.rs` with connection pooling, HTTP/2, gzip/brotli compression
- Replace all 72 `reqwest::Client::new()` and `reqwest::get()` calls across 15 source files with the pooled global client
- Wire frontend `maxConcurrentDownloads` config setting → Rust semaphore values
- Stream response bodies directly to disk (`resp.bytes_stream()`) with incremental hash verification — eliminates full in-memory buffering
- Replace 100ms polling loop with `mpsc::unbounded_channel` for instant download progress updates
- Clean up orphaned `.tmp` files per-download and via `cleanup_temp_files` command

### Removed
- Remove superseded dead methods from api.ts: authLogin, authLogout, authGetAccount, instancesGet, instanceGetMods, instanceGetResourcePacks, instanceGetShaders, instanceGetDatapacks, instanceInstallContent, openUrl

### Added
- 28 Rust unit tests across download.rs, config.rs, mod_meta.rs (HTTP classification, hash selection, clean_search_name, cache_key, link_for, builder methods)
- `log` + `env_logger` crates for structured logging; initialized in main.rs with `warn`-by-default filter

### Fixed
- Add `-XstartOnFirstThread` for macOS M1 — LWJGL/GLFW was crashing on launch with `ExceptionInInitializerError`
- Wire `instance.java_arguments` into `build_jvm_args` — custom JVM args set in the UI were being silently ignored
- Fix mod list cache: replace `dir_mtime` comparison with `file_count` to avoid stale cache on macOS where directory mtime may not update when .jar files are added

### Changed
- Replace all 22 `eprintln!` calls with `log::{error, warn, info, debug}` throughout cloud.rs, download.rs, instances.rs, launcher.rs, mod_meta.rs, modpack.rs, telemetry.rs
