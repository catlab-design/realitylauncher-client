# CLAUDE.md — Reality Launcher Client

## 1. Project Overview

| Property | Value |
|---|---|
| **Name** | Reality Launcher (package: `ml-tauri-poc`) |
| **Version** | 5.4.0 |
| **License** | GPL-3.0-only |
| **Description** | ML-Launcher POC with Tauri + Rust — Minecraft launcher |
| **Copyright** | 2026 CatLab Design <hi@catlabdesign.space> |
| **Stack** | **Frontend**: React 19 + TypeScript + Vite 5 &nbsp;·&nbsp; **Backend**: Rust + Tauri v2 &nbsp;·&nbsp; **State**: Zustand 5 &nbsp;·&nbsp; **Styling**: Tailwind CSS v4 &nbsp;·&nbsp; **Animations**: Framer Motion 12 + GSAP &nbsp;·&nbsp; **Package Mgr**: Bun |
| **Origin** | Electron-to-Tauri migration (see `docs/plans/`) |

---

## 2. Project Structure

### Top-level
```
.
├── docs/
│   ├── gap-analysis-2026-06-30.md
│   └── plans/2026-06-29-electron-to-tauri-migration.md
├── agent/                             # Java agent for in-game branding (Maven; built jar is committed to src-tauri/resources/)
├── scripts/fix-asset-src.mjs          # Astro → Vite asset codemod
├── src/                                # React frontend source
├── src-tauri/                          # Rust + Tauri backend
├── index.html                          # Entry HTML (lang="th")
├── package.json
├── vite.config.ts                      # Vite build config
├── tsconfig.json / tsconfig.node.json / tsconfig.bridge.json
├── bun.lock
├── .gitlab-ci.yml                     # GitLab CI: check + build/release pipeline
├── LICENSE (GPL-3.0)
└── CONTRIBUTING.md / CODE_OF_CONDUCT.md / SECURITY.md
```

### Frontend (`src/`)
```
src/
├── main.tsx                          # React entry point
├── api.ts                            # Tauri IPC bridge (invoke proxy)
├── api.test.ts                       # Bridge parity tests (bun:test)
├── env.d.ts                          # Global type declarations
├── components/
│   ├── LauncherApp.tsx               # Root component
│   ├── LauncherAppLazyTabs.tsx       # React.lazy tab chunks (memoized) + idle preloadTabs()
│   ├── LauncherAppOverlays.tsx        # All modal dialogs
│   ├── LauncherAppShell.tsx           # Shell (titlebar + sidebar + content)
│   ├── LauncherAppTitleBar.tsx        # Custom title bar
│   ├── PerfTab.tsx                    # React.Profiler wrapper (dev only)
│   ├── SettingsDialog.tsx             # Settings overlay
│   ├── launcherTheme.ts               # Theme color generation
│   ├── auth/                         # Auth modals
│   │   ├── CatIDLoginModal.tsx
│   │   ├── LoginModal.tsx
│   │   └── MicrosoftVerificationModal.tsx
│   ├── dialogs/
│   │   └── JoinInstanceDialog.tsx
│   ├── layout/
│   │   └── Sidebar.tsx               # Navigation sidebar
│   ├── tabs/
│   │   ├── index.ts                   # Barrel re-export
│   │   ├── Home.tsx                   # Dashboard (default tab)
│   │   ├── ServerMenu.tsx / ServerDetailView.tsx / ServerItem.tsx
│   │   ├── ModPack.tsx                # Modpack instance management
│   │   ├── Explore.tsx                # Modrinth/CurseForge browser
│   │   ├── InstanceDetail.tsx / InstanceContentBrowser.tsx
│   │   ├── LiveLog.tsx / Wardrobe.tsx / About.tsx
│   │   ├── AdminPanel.tsx / UserManagement.tsx
│   │   ├── Settings.tsx
│   │   ├── ExploreTabs/               # (16 files) ProjectCard, FilterMenu, etc.
│   │   ├── ModPackTabs/               # (16 files) CreateInstanceModal, etc.
│   │   ├── settingsTabs/              # (10 files) Account, Java, Game, etc.
│   │   └── wardrobe/SkinPreview3D.tsx
│   └── ui/                            # Reusable UI primitives (19 components)
│       ├── AnimatedGradientText.tsx
│       ├── AppVersionBadge.tsx
│       ├── BannerImage.tsx
│       ├── BannerVideo.tsx            # Muted looping server banner video over its poster image
│       ├── CalendarWidget.tsx
│       ├── ChangelogModal.tsx
│       ├── ConfirmDialog.tsx
│       ├── ErrorBoundary.tsx
│       ├── Icons.tsx
│       ├── LoadingScreen.tsx
│       ├── Marquee.tsx
│       ├── MCHead.tsx
│       ├── Meteors.tsx
│       ├── Notification.tsx
│       ├── NotificationInbox.tsx
│       ├── Portal.tsx
│       ├── ShimmerButton.tsx
│       ├── Skeleton.tsx
│       ├── SimpleMarkdown.tsx
│       └── SmartImage.tsx
├── hooks/
│   ├── useGameEvents.ts              # Game lifecycle event hook
│   ├── useInstances.ts               # Instance fetching/mutation
│   ├── useStableCallback.ts          # Stable-identity callback that always calls the latest closure
│   └── useTranslation.ts             # i18n hook
├── i18n/
│   ├── translations.ts               # Barrel export
│   ├── translations-en.ts            # English (1111 keys)
│   └── translations-th.ts            # Thai (732+ keys, default fallback)
├── lib/
│   ├── apiBase.ts                    # API_BASE_URL + apiUrl(path, params) for frontend fetches (+ test)
│   ├── bulkDelete.ts
│   ├── constants.ts                  # COLOR_THEMES map
│   ├── externalUrl.ts                # getSafeExternalUrl(): only http(s) links reach openExternal (+ test)
│   ├── firstRunOnboarding.ts
│   ├── installLock.ts
│   ├── launchPolicy.ts
│   ├── launchWatchdog.ts             # Play-button stall watchdog: trips after 5 min without launch/install progress (+ test)
│   ├── microsoftLoginFlow.ts         # MS device code flow
│   ├── performanceMode.ts            # effectiveVisuals(config): Performance mode → lite CSS, reduced motion, rainbow suspended (+ test)
│   ├── pageVisibility.ts             # data-hidden on <html> while the window is hidden; isPageHidden() (+ test)
│   ├── perfStats.ts                  # Pure frame/long-task summaries (+ perfStats.test.ts)
│   ├── perfProbe.ts                  # Dev-only render/frame/long-task collector
│   ├── perfBench.ts                  # Dev-only scripted bench (VITE_PERF_BENCH=1)
│   ├── sounds.ts                     # Sound effects manager
│   ├── tabKeepAlive.ts               # KEEP_ALIVE_TABS, nextMountedTabs, TabActiveContext/useTabActive (+ test)
│   └── utils.ts                      # cn(), getContrastColor()
├── store/
│   ├── authStore.ts                  # Auth state (persisted)
│   ├── configStore.ts                # Config state (persisted, v1, migrated)
│   ├── launchStore.ts                # Launching state
│   ├── progressStore.ts              # Install progress
│   └── uiStore.ts                    # UI state (activeTab, modals, etc.)
├── styles/
│   └── global.css                    # Tailwind import + custom CSS + animations (587 lines)
├── types/
│   ├── bun-test.d.ts
│   └── launcher.ts                   # All shared TS types
└── assets/                           # Static assets (icons, sounds, images)
```

### Rust Backend (`src-tauri/`)
```
src-tauri/
├── Cargo.toml                        # Rust dependencies (tauri 2, serde, reqwest, sha, zip, discord-rp, etc.)
├── tauri.conf.json                   # App name, window config (360×380 fixed), bundle
├── resources/reality-agent.jar       # Built branding agent, embedded with include_bytes! (rebuild: bun run build:agent)
├── resources/badge.png               # 8×8 pixel-art Reality cube used as the tab-list badge glyph
├── build.rs
├── capabilities/default.json         # Security permissions
├── config/                           # Minecraft optimization configs
│   ├── debugify.json, entityculling.json, lithium.properties
│   ├── modernfix-mixins.properties, rrp.properties, sodium-mixins.properties
├── icons/                            # All platform icon formats
└── src/
    ├── main.rs                       # Entry point, 93+ command registrations
    ├── lib.rs                        # Module declarations
    ├── hotswap.rs                    # Experimental hotswap: pure gate (`enabled_tiers`), `Tier`, `classify`/`change_kind`, bundled allowlist (`resources/hotswap-allowlist.json`)
    ├── hotswap_channel.rs            # Hotswap launcher<->agent channel files (offer/apply/status/result.json, schema 1, temp+rename `write_json`/`read_json`)
    ├── hotswap_watch.rs              # Hotswap in-game: 60 s manifest poll with `If-None-Match` (backoff x2 to 600 s, injectable `Backend`), stages + writes `offer.json`, emits `hotswap-offer`/`hotswap-result`, crash lock (`crash-lock.json`), session dirs
    ├── hotswap_telemetry.rs          # Hotswap telemetry payload builders (loader, mcVersion, launcherVersion, counts; no paths)
    ├── hotswap_staging.rs            # Hotswap staging: `stage` downloads changed pack files to `.reality/staging/<v>/` (plan.json last), `apply_staged` verifies sha256 + moves them at next launch before `pack_v2::sync`; reuses cloud.rs removal rules (never player/locked mods)
    ├── http_client.rs                # Global shared reqwest::Client (pooled, HTTP/2, gzip, brotli); `reality_api()` / `.reality_api()` adds `X-Launcher-Version` to Reality API requests only
    ├── download.rs                   # (315 lines) Shared concurrent download engine
    ├── launch_log.rs                 # Per-launch launcher log (<instance>/logs/launcher.log) + redact() used by every log read
    ├── launcher.rs                   # (2127 lines) Game launch — largest module
    ├── auth.rs                       # Microsoft OAuth + CatID auth
    ├── config.rs                     # (335 lines) Config + RAM detection + folder migration (cancel/progress/rollback)
    ├── instances.rs                  # Instance CRUD + copy_dir_recursive_with_progress
    ├── op_guard.rs                   # Exclusive/shared operation guard (migration vs install/sync/launch)
    ├── perf_tools.rs                 # Linux game wrappers: mangohud --dlsym / gamemoderun (+ linux_perf_tools command)
    ├── wayland.rs                    # Wayland sessions: XWayland by default for launcher (GDK_BACKEND) and game (no WAYLAND_DISPLAY)
    ├── java.rs                       # Java detection/installation
    ├── modrinth.rs                   # Modrinth API
    ├── curseforge.rs                 # CurseForge API
    ├── modpack.rs                    # Modpack install: .mrpack, CurseForge .zip, Prism/MultiMC instance .zip (mmc-pack.json)
    ├── keybinds.rs                   # Pack keybinds (reality/keybinds.json): apply `key_` lines to options.txt on first install / Repair
    ├── keybind_backups.rs            # Keybind backups (<app data>/keybind-backups/<instance id>/) + list/create/restore/delete commands
    ├── content.rs                    # Mod/resourcepack management
    ├── cloud.rs                      # Cloud sync, server instances, invitations
    ├── admin.rs                      # Admin commands (10)
    ├── update.rs                     # App update check/download/install
    ├── fs_utils.rs                   # FS utilities (open, browse, clear cache) + safe_file_name() for every network-supplied file name
    ├── game_window.rs                # Game window title + icon file (instance icon / Reality logo) + default-icon fingerprints for the agent
    ├── window.rs                     # Window management
    ├── discord.rs                    # Discord Rich Presence (line 2 = agent game status, line 3 = "By <team>"; "Picking a Server" with the on-screen server logo)
    ├── social.rs                     # Server ping
    ├── telemetry.rs                  # Telemetry logging
    ├── wardrobe.rs                   # Minecraft + CatSkinC skin management
    ├── mod_meta.rs                   # Mod metadata helpers
    ├── mappings.rs                   # Runtime names of tab-list members per version/loader (Mojang + intermediary/SRG mappings; also `resolve_hotswap_names` (Minecraft class, getInstance/getConnection, level field, reloadResourcePacks for the hotswap agent)
    └── tab_badge.rs                  # Tab-list badge: resource pack, agent session file, /presence heartbeat
```

---

## 3. Frontend Architecture

### 3.1 Entry Point (`src/main.tsx`)
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import LauncherApp from './components/LauncherApp';
import './styles/global.css';
import './api';                                // side-effect: sets window.api proxy

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <LauncherApp />
    </React.StrictMode>
);
```

### 3.2 Component Tree
```
LauncherApp
└── <ErrorBoundary>
    └── LauncherAppContent
        ├── LauncherAppOverlays       (all modals: login, register, forgot-pw, link, changelog, confirm)
        ├── LauncherAppShell
        │   ├── LauncherAppTitleBar   (custom title bar with min/max/close)
        │   ├── Sidebar              (navigation — icons + active tab highlight)
        │   └── Tab content           (rendered based on uiStore.activeTab)
        └── ChangelogModal
```

### 3.3 Tab System (SPA — no router)
| Tab ID | Component | Description |
|---|---|---|
| `home` | `Home` | Dashboard: greeting, recently played, news |
| `servers` | `ServerMenu` / `ServerDetailView` | Community server browser |
| `modpack` | `ModPack` + `ModPackTabs/*` | Game instance management |
| `explore` | `Explore` + `ExploreTabs/*` | Modrinth + CurseForge content browser |
| `wardrobe` | `Wardrobe` + `SkinPreview3D` | Skin management (3D preview) |
| `admin` | `AdminPanel` | Admin panel (conditional) |
| `about` | `About` | Credits |
| `settings` | `SettingsDialog` (overlay) | App settings (Account, Appearance, Game, Java, etc.) |

### 3.4 State Management (Zustand)

| Store | File | Persisted? | Key State |
|---|---|---|---|
| `authStore` | `store/authStore.ts` | Yes (`reality_auth_store`) | `session`, `accounts[]`, add/remove/update, logout |
| `configStore` | `store/configStore.ts` | Yes (`reality_config`, v1) | All `LauncherConfig` fields, setConfig, resetConfig, setTheme, setLanguage |
| `uiStore` | `store/uiStore.ts` | No | `activeTab`, `lastContentTab`, `wardrobeMode`, `settingsTab`, `pickedServer` (Discord "Picking a Server"), 9 modal booleans |
| `launchStore` | `store/launchStore.ts` | No | `launchingId` |
| `progressStore` | `store/progressStore.ts` | No | `isInstalling`, `installProgress`, `operationType`, `installingInstanceId` |

ConfigStore migration (v0→v1): `closeOnLaunch` changed from `boolean` to `'keep-open' | 'hide-reopen' | 'close'`.

`javaArguments` defaults to `DEFAULT_JAVA_ARGUMENTS` (`configStore.ts`): `LauncherApp` writes it to config.json at startup when the key is absent (the game launch reads config.json, not the store). Every flag in it must be accepted by Java 8–25.

### 3.5 i18n
- English: `translations-en.ts` — 1111 keys
- Thai: `translations-th.ts` — 732+ keys (default fallback)
- Hook: `useTranslation()` reads `configStore.language`, supports parameter interpolation (`{{param}}`)
- Usage: `const { t } = useTranslation(); t('settings.general')`

### 3.6 Styling
- **Tailwind CSS v4** via `@tailwindcss/vite` plugin (no config file)
- **Global CSS** (`styles/global.css`, 587 lines): `@import "tailwindcss"`, self-hosted fonts (Prompt + Inter Variable), custom CSS vars (`--color-bg`, `--color-card`, `--secondary-color`), custom animations (pulse-glow, float, shimmer, gradient-shift, comet-streak, leaf-fall, skeleton-wave, fade-in-up, status-breath, toast-countdown), glass effect, rainbow mode (`@property --secondary-color`)
- **Component styling**: Tailwind classes inline; no CSS modules or styled-components

### 3.7 Key UI Patterns
- `cn()` utility (from `lib/utils.ts`) for conditional class merging
- `SmartImage` for lazy-loaded, fallback-aware images
- `Skeleton` for loading placeholders
- `ErrorBoundary` wraps the entire app
- `Portal` for modal overlays
- `AnimatedGradientText`, `ShimmerButton`, `Meteors` for decorative effects
- Sound effects via `lib/sounds.ts` (click.mp3, notification.mp3, succeed.mp3)

---

## 4. Bridge Architecture (IPC)

### 4.1 Frontend (`src/api.ts`, 497 lines)
- Wraps `@tauri-apps/api` `invoke()` via a JavaScript `Proxy`
- Auto-wires `on*` methods as Tauri event listeners via `listen()`
- Exposed globally: `window.api = apiProxy`
- Pre-fetches system RAM on init (`cachedMaxRam`, `cachedSystemRam`)
- ~95+ IPC methods across all modules

### 4.2 Rust Commands by Module
| Module | Key Commands |
|---|---|
| **auth** | `login_microsoft`, `login_catid`, `start_device_code_auth`, `poll_device_code_auth`, `get_session`, `logout`, `auth_refresh`, `register_catid`, `check_registration_status`, `forgot_password`, `reset_password`, `login_catid_token`, `link_catid`, `set_active_session`, `auth_unlink` |
| **config** | `config_get`, `config_set`, `config_get_minecraft_dir`, `config_migrate_minecraft_dir` (emits `migrate-progress`/`migrate-cancelled`/`instances-updated`), `cancel_migrate`, `reset_config` (preserves `minecraft_dir`), `get_system_ram`, `get_max_ram` |
| **instances** | `instances_list`, `instances_get`, `instances_create`, `instances_update`, `instances_delete`, `instances_duplicate`, `instances_set_icon` |
| **download** | `download_batch()`, `download_file()`, `DownloadItem`, `DownloadConfig`, `BatchResult` — shared concurrent engine used by modpack and cloud |
| **perf_tools** | `linux_perf_tools` (Linux: which of mangohud/gamemoderun are on PATH, and whether the session is Wayland) |
| **launcher** | `is_game_running`, `kill_game` (emits `game-stopped`), `cancel_launch` (abandons a launch whose game process isn't registered yet; never kills a running game), `instances_launch`, `get_playing_instance_id`, `instance_read_latest_log`, `instance_tail_log`, `instance_tail_launch_log`, `get_app_version`, `is_dev_mode`, `browse_java`, `instances_preinstall` |
| **java** | `install_java` (Corretto, or Oracle GraalVM for 21/25 when `javaProvider` = `graalvm`; dirs `java/jdk-<n>` / `java/graalvm-jdk-<n>`), `detect_java_installations`, `delete_java` (both dirs), `test_java_execution`, `auto_detect_java` |
| **admin** | `check_status`, `get_settings`, `save_setting`, `get_users`, `ban_user`, `unban_user`, `toggle_user_admin`, `create_user`, `get_user_details`, `get_system_info` |
| **content** | mod/resourcepack CRUD + toggle + delete + install + lock |
| **modrinth** | `modrinth_search`, `get_project`, `get_versions`, etc. |
| **curseforge** | `curseforge_search`, `get_project`, `get_files`, `get_description`, `clear_cache` |
| **keybinds** | `keybind_backups_list`, `keybind_backup_create` (returns `null` when unchanged / no keys), `keybind_backup_restore` (rejects `"game-running"`), `keybind_backup_delete` |
| **modpack** | `install`, `install_from_modrinth`, `install_from_curseforge`, `cancel_install`, `pre_install`, `list_files` |
| **update** | `check_latest_version`, `download_update`, `install_update` |
| **fs_utils** | `open_folder`, `open_url` (http(s) only via `validate_external_url`; Windows uses ShellExecuteExW, never `cmd`), `browse_directory`, `browse_icon`, `browse_modpack`, `launcher_clear_cache`, `check_dir_empty` |
| **hotswap_watch** | `hotswap_apply(instance_id, version)` (writes `apply.json` into the running game's session dir; rejects `"revoked"` when `offer.json` is revoked, missing or another version, `"no-session"` when no hotswap game runs for that instance), `hotswap_agent_state(instance_id)` (the agent's own `status.json` state: `idle`/`ready`/`applying`/`busy-in-world`, or `null`; independent of the tab-badge game-status file). Events: `hotswap-offer` `{instanceId, version, liveCount, restartCount, revoked?}`, `hotswap-result` (result.json + `instanceId`) |
| **window** | `window_minimize`, `window_maximize`/`unmaximize`, `window_close`, `is_maximized`, `set_main_mode` |
| **cloud** | joined servers, join/leave, cloud install/sync, invitations, notifications |
| **discord** | `discord_rpc_set_enabled`, `discord_rpc_update`, `discord_rpc_is_connected` |
| **social** | `server_ping` |
| **telemetry** | `telemetry_log_event`, `dev_perf_report` (debug builds print `PERF_REPORT <json>` to stdout; no-op in release) |
| **wardrobe** | catskinc config/skin, minecraft profile/skin, auth_update_avatar_source |

### 4.3 Known Gaps (Unported Methods)
```typescript
const KNOWN_UNPORTED = new Set(['fetchInstanceAgendas', 'fetchAllAgendas']);
```

---

## 5. Key Patterns & Conventions

### TypeScript
- `strict: true`, `noUnusedLocals`, `noUnusedParameters`
- No ESLint or Prettier configs — only TS compiler strictness
- Floating promises allowed by default (no `noUnusedLocals` catches unused vars)

### Code Style (from CONTRIBUTING.md)
- No redundant comments
- Prefer declarative operations
- Type safety first — no `any` unless absolutely necessary
- Names follow `camelCase` for variables/functions, `PascalCase` for components/types
- File names: `PascalCase.tsx` for components, `camelCase.ts` for utilities/stores

### CSS & Animations
- Prefer Tailwind utility classes over custom CSS
- Framer Motion (`motion.div`) for most UI animations
- GSAP for complex, performance-sensitive, or timeline-based animations
- Custom animations defined in `global.css` with `@keyframes`

### State
- Global app state → Zustand stores
- Server/API state → IPC bridge (not React Query/SWR)
- Local/UI-only state → `useState` / `useReducer`
- No Redux, no Context API for global state

### Custom Hooks
- `useTranslation()` — i18n with `t()` function and parameter interpolation
- `useGameEvents()` — game lifecycle events (install progress, cancel, repair)
- `useInstances()` — instance fetching with caching, running status, joined server list

---

## 6. Testing

- **Framework**: `bun:test`
- **Test files**: `src/api.test.ts` (120 lines), `src/lib/apiBase.test.ts`, `src/lib/externalUrl.test.ts`, `src/lib/launchWatchdog.test.ts`, `src/lib/perfStats.test.ts`, `src/lib/tabKeepAlive.test.ts`, `src/lib/pageVisibility.test.ts`
- **Perf bench** (dev only, real app): see §7; besides metrics it reports `checks` (install toast live, keep-alive layout/remount, rainbow CSS) — all must be `true`
- **Run tests**: `bun test` or `bun test src/api.test.ts`
- **Bridge parity validation**:
  1. Every `invoke('command_name')` in api.ts must exist as a `#[tauri::command] fn` in Rust
  2. Every `window.api.X()` call from UI components must be defined on the api.ts Proxy
  3. Tracks "known unported" allowlist — any method in the allowlist that becomes implemented must be removed
- **Typecheck**: `bun run check:bridge` (runs `tsc --noEmit -p tsconfig.bridge.json`)

---

## 7. Build & Run Commands

| Command | Purpose |
|---|---|
| `bun dev` | Start Vite dev server (:5173) |
| `bun run build` | Production Vite build |
| `bun run preview` | Preview production build |
| `bun run tauri dev` | Start Tauri dev (opens native window) |
| `bun run tauri build` | Build production Tauri native app |
| `bun test` | Run all tests |
| `bun run check:bridge` | Typecheck bridge files |
| `bun run build:agent` | Rebuild the branding Java agent (needs JDK + Maven) and copy it to `src-tauri/resources/` |
| `VITE_PERF_BENCH=1 VITE_PERF_BENCH_EXIT=1 bun run tauri dev 2>&1 \| grep PERF_REPORT` | Dev-only perf bench: cycles tabs, scrolls Explore/Servers, fakes a progress burst, prints JSON, closes the window. Reads local data only. |

---

## 8. Environment & Configuration

- No `.env` files committed (gitignored); use `.env` or `.env.local` locally
- Env var prefixes: `VITE_` (Vite) and `TAURI_` (Tauri)
- Backend API base: `https://api.reality.catlabdesign.space` (hardcoded in Rust)
- Vite dev server port: 5173 (strict, no fallback)
- Build targets: `chrome105` (Windows), `safari13` (others)
- Minecraft optimization configs in `src-tauri/config/`

### Window Configuration
- Size: 360×380 (fixed, not resizable)
- Decorations: none (custom title bar)
- Background: `#09090b`
- Centered on screen
- Linux: `WEBKIT_DISABLE_DMABUF_RENDERER` set automatically in main.rs
- Linux Wayland: `wayland::configure_launcher` sets `GDK_BACKEND=x11` (XWayland) unless the `nativeWayland` config is on or the player set it; native mode on NVIDIA sets `__NV_DISABLE_EXPLICIT_SYNC=1`

---

## 9. Important Gotchas

9. **Config & session persistence is update/crash-resistant** — `config.json`/`session.json` are written atomically (temp + rename, like `download.rs`); unreadable files are kept as `*.bak-<ts>` before any overwrite; missing config keys deserialize to safe defaults (`ramMB` → 4096); `install_update` copies both files to `*.pre-update` and a missing/unreadable data file is auto-restored from it on next launch (survives destructive installers)
10. **`#![windows_subsystem = "windows"]`** — No console on Windows even in debug; stdout still works when launched via `tauri dev`
2. **Tailwind v4 has no config file** — configured entirely via `@tailwindcss/vite` plugin and `@import "tailwindcss"` in CSS; no `tailwind.config.*` or `postcss.config.*`
3. **ConfigStore migration** — `closeOnLaunch` migrated from `boolean` to `'keep-open' | 'hide-reopen' | 'close'` (version 0→1); `javaPath` preserved on reset
4. **The `api.ts` Proxy** auto-wires `on*` methods as `listen()` event targets — don't manually call `listen()` for `window.api.on*` events
5. **Some UI code still uses `window.api.X()`** from the Electron era — these are validated by the bridge parity test
6. **Fonts are self-hosted** via `@fontsource` — works offline, no Google Fonts dependency
7. **No `public/` directory** — all assets are in `src/assets/` and imported directly
8. **No Docker** — CI lives in `.gitlab-ci.yml`: `check` job on MRs/main pushes; `v*` tags or a manual run with `PIPELINE_TYPE=release` build Linux/Windows/macOS installers and publish to R2 + a GitLab Release (assets in the generic package registry); the opt-in `mirror:github` job (`MIRROR_GITHUB_RELEASE=true` + `GITHUB_TOKEN`) copies each release to GitHub Releases. Linux packages need GStreamer "good" plugins for `<audio>` (WebKitGTK): `.deb`/`.rpm` declare them in `tauri.conf.json` `bundle.linux`, and the AppImage bundles them (`bundleMediaFramework`), so `build:linux` installs them first
9. **`src-tauri/src/download.rs`** — shared concurrent download engine using `tokio::sync::Semaphore` (default 8 concurrency). Accepts a progress callback, supports retry with backoff, SHA1/SHA256/SHA512 hash verification, atomic writes (temp + rename), JAR/ZIP validation, and per-error `missing_on_server` vs `failed` classification. Replaces old sequential loops in CurseForge modpack install (`install_cf_modpack`) and cloud sync (`sync_managed_mods`, `sync_server_mods` queue).

11. **Store subscriptions** — always select fields (`useStore((s) => s.x)` or `useStore(useShallow((s) => ({ ... })))`); a bare `useXStore()` re-renders on every `set`, e.g. every install-progress tick or `setImmersive` on scroll. Handlers passed to the memoized shell/overlays/tabs go through `useStableCallback`
12. **Library (ModPack) and Install (Explore) are kept mounted** after the first visit (`src/lib/tabKeepAlive.ts`). Effects that touch shared shell state (`setFullBleed`, `setImmersive`, listeners on the shared `<main>` scroller) must be gated on ModPack's `isActive` prop or `useTabActive()`, or they leak into other tabs
13. **Rust release profile** is thin LTO (`codegen-units = 16`, `strip`, `opt-level = 3`); full LTO took ~16 min cold on 4 cores and was rejected for build time
14. **`WEBKIT_DISABLE_DMABUF_RENDERER` is required** on the maintainer's Linux machine — never remove it as a perf fix; WebKitGTK's non-DMABuf path makes scroll repaint the main remaining cost
15. **`src/components/ui/CalendarWidget.tsx` is dead and does not parse** (not imported anywhere). Plain `tsc -p tsconfig.json` only reports its syntax errors and hides every type error; exclude it to typecheck the app
16. **Loader installers and zlib-ng** — Forge/NeoForge processors verify output jar SHA1s computed with classic zlib. Corretto on Linux links the system `libz`, which is zlib-ng on Arch/CachyOS/Fedora 40+, so installs fail. `installer_java()` in `launcher.rs` swaps in a JDK whose `lib/libzip.so` does not link `libz.so.1` (distro OpenJDKs in `/usr/lib/jvm`; with none, `java::install_installer_java` downloads a Temurin JRE — bundled zlib — once into `java/installer-jre-<major>`, hidden from game Java detection); only the installer run uses it, the game still runs on the resolved Java
17. **In-game branding agent** — every launch adds `-javaagent:<mc dir>/agent/reality-agent.jar` plus `-Dreality.title` (`<instance> | Reality Launcher (<mc>-<launcher>)`), `-Dreality.mcversion`, `-Dreality.icon` (`<mc dir>/agent/window-icon.rlic`, RGBA at 16–256 px, instance `icon.png` — often WebP — or the Reality logo), `-Dreality.vanillaIcons` (CRC32 of the default `icons/*.png` RGBA from the asset index) and `-Dreality.brand`; `${version_type}` resolves to `Reality Launcher`. The agent only replaces Minecraft's *default* title (`Minecraft[*][ Forge| NeoForge][*] <ver>[ - …]` — Forge patches its name into `createTitle`; NeoForge puts the star after its name, `Minecraft NeoForge* 1.21.1` — and `Minecraft: (Neo)Forge…`) and only icons whose every image matches a default fingerprint, so mod-set titles/icons win. Hooks: `GLFW.glfwCreateWindow`/`glfwSetWindowTitle`/`glfwSetWindowIcon`, LWJGL2 `Display.setTitle`, Forge/NeoForge `BrandingControl.getBrandings`. Injected code is branch-free and java.base-only: it calls `Hooks.*` through `reality$*` static fields filled by reflection in `<clinit>`, so Forge module layers need not read the jar. macOS ignores `glfwSetWindowIcon` (dock icon stays). CI has no Maven: after editing `agent/`, run `bun run build:agent` and commit the jar (the build is reproducible)
18. **Tab-list badge** (`tab_badge.rs`, `mappings.rs`, agent `TabBadges`/`TabScheme`) — 1.19–1.21.x only. Launch resolves runtime names (cached in `<mc dir>/mappings/<ver>/`, 60 s cap), writes `reality-badge.zip` into the instance and adds it to `options.txt`, and passes `-Dreality.session=<mc dir>/agent/session.properties` (0600; `self.uuids` = own offline + account UUIDs and `self.name` = player name, always badged because the API excludes the caller's session; lookup token added once `/presence/start` answers). `/presence/start` sends `uuids` + `name`, and `/presence/lookup` sends each row's `uuids` + `names`; a row is badged when its UUID **or** its name (lowercased) is live, because offline/proxy servers and tab plugins show other UUIDs. Presence is registered on every launch with an API token, even when this launch has no badge setup (`spawn_presence(None, …)`), so others still badge the player. The agent adds a `reality$badge` static field to the tab-list class (filled by reflection in `<clinit>`) and calls it from `getNameForDisplay`; Forge/NeoForge get both `official` and `srg` schemes and the matching one wins. Logo left of the head (1.19.3+): `HeadShiftPatch` (asm-tree) finds the head draw by shape — static void call with ≥3 int args followed by `iinc x 9`, after `info.getProfile()` — and adds `Hooks.HEADSHIFT` (10 for Reality rows: 2 px gap after the badge) right after the `ILOAD x` that feeds the call, so mixins reading the call's args see the moved x (Figura's `@ModifyArg` on the head size draws its avatar portrait at the x it gets; wrapping the call instead left the portrait over the badge); the name then gets `badge.head` = back-space U+E2A1 (−9, one badge advance), glyph U+E2A0, forward-space U+E2A2 (+10) from the pack's `space` provider. Needs the `realitylauncher-api` `/presence` routes (migration `0028_game_presence.sql`). The same launch passes `-Dreality.status=<mc dir>/agent/game-status.properties` (deleted at every launch): agent `GameStatus` reads the Minecraft and packet-listener classes and the tab-list getter off the unpatched `PlayerTabOverlay` bytecode (ctor arg 0; `GETFIELD …connection` + `()Ljava/util/Collection;` call), finds `getInstance`/`getConnection` by signature, and every 2 s writes `state=menu|singleplayer|server` + `players=N` (null connection = menu; a "Server thread" = singleplayer). `discord.rs` polls it every 5 s and shows line 3 as "By <teamName>" (owner name fallback) from `/instances/:id`
19. **Launch timeout** — Play (`ModPack.tsx`, `ServerMenu.tsx`) uses `createLaunchWatchdog` (`src/lib/launchWatchdog.ts`): every `launch-progress`/`install-progress` event restarts a 5 min timer, and on a stall the UI calls `cancel_launch`, which bumps `LAUNCH_GENERATION` under the `GAME_PROCESS` lock so `launch_game` drops its child, and refuses if a game is already registered. Each Play press is its own `{ cancelled, watchdog }` object so a stale launch can't reset a newer one. Don't reintroduce a fixed wall-clock cap: first launches (mod sync, downloads, Forge installer) legitimately take minutes. `auth_refresh` (run before every launch) is capped at 30 s. Long silent steps must report progress: `run_loader_installer` streams the Forge/NeoForge installer's output as throttled `launch-progress` events (milestones only to launcher.log; the full log is `<installer>.log`) and kills the installer when the launch generation changes
20. **Launch log and censoring** — `launch_log::start` (in `instances_launch`) recreates `<instance>/logs/launcher.log`; `emit_progress` writes each stage message there, `mark_stage` adds "took" lines for steps ≥ 1 s and prints `[Launcher] Stage <name>: N ms` to the console. Lines use Forge's layout (`[ddMMMyyyy HH:mm:ss.SSS] [Launcher/INFO] …`) so `LiveLog` parses them like game lines. Early game stderr is copied in until `latest.log` is written. `read_log_lines` passes every chunk (both logs) through `launch_log::redact`, so never log secrets anywhere expecting the viewer to hide them — but don't rely on the viewer either: keep tokens out of log messages. `LiveLog` reads launcher.log then latest.log, skips a latest.log older than the launch log's creation time, and clears when launcher.log shrinks (a new launch)
21. **Launch caches** — `game_window` keeps encoded icons in `<mc dir>/agent/icons/<crc>.rlic` (8 most recent) and default-icon fingerprints in `assets/indexes/.<index>.icon-fingerprints`; the client jar has a `.<ver>.jar.verified` size+mtime marker; `mappings::resolve_tab_schemes` caches results in `mappings/<mc>/tab-schemes-<loader>.json`, keyed by launcher version, mapping SHA-1 and mcp_config — bump nothing by hand, a new launcher version invalidates it
22. **Wayland** — on Wayland sessions with XWayland available, the launcher runs with `GDK_BACKEND=x11` and the game is spawned without `WAYLAND_DISPLAY` and with `XDG_SESSION_TYPE=x11` (GLFW 3.4 in MC 1.20.2+ otherwise picks native Wayland: no window icon/position, agent icon swap has no effect). `nativeWayland` opts out. The maintainer's machine (NVIDIA 470, XFCE X11) can't run a Wayland compositor, so Wayland changes can only be checked on another machine
24. **Banner videos** — `bannerUrl` is always an image; a server's optional video is `bannerVideoUrl` (API column `banner_video_url`, stored as `banner-video.<mp4|webm>` at the instance root, served by `/storage/assets/instance/:id/banner-video` with byte ranges, kept out of sync manifests and packs). The management site uploads a WebP still of the video as `banner`, so older launchers and every card keep working. Only the Servers hero (`ServerItem.tsx`) and `ServerDetailView` play it, through `BannerVideo` (hidden under reduced motion/Performance mode, paused while the window is hidden, poster on error). WebKitGTK plays WebM (VP8/VP9) with the bundled GStreamer "good" plugins; H.264 MP4 needs `gst-libav`, so MP4 may show only the poster on Linux
23. **Server sync never deletes player mods** — `cloud::cleanup_unmanaged_mods` (used by pack v2, `.mrpack`, managed and per-file syncs) removes a top-level `mods/*.jar[.disabled]` only if `.reality/managed-mods.json` (the previous sync's keep set, rewritten every sync) lists it and the server no longer ships it; locked mods are always kept. With no record yet it removes everything except keep, locked and mods with an Explore content link (`.reality-content-links.json`)
25. **Pack keybinds** — `reality/keybinds.json` (pack v2) is applied by `keybinds.rs` only on first install (no `.reality/pack-state.json` and no `options.txt`, checked before any file is written) and on Repair (a "before-repair" backup is taken first; keys are written only if that backup step succeeded). Only `key_` lines in `set` change. Backups live in `<app data>/keybind-backups/<instance id>/`, 30 max, automatic ones pruned first; restore is blocked while the game runs (`KeybindBackupsSection` checks `isGameRunning`, backend rejects `"game-running"`)
26. **Hotswap agent** (`agent-hotswap/`, `src-tauri/resources/reality-hotswap.jar`, built by `bun run build:agent` alongside `reality-agent.jar`; commit both) — tier 0 only, no ASM and no runtime deps, java.base-only reflection. Added to the JVM args (after the branding agent) only when hotswap is enabled for the launch, together with `-Dreality.hotswap=<session dir>`, `.tiers` and `.names`; `premain` returns at once if any is missing. Thread `Reality-Hotswap` polls the channel every 1 s: `status.json` (`idle|ready|applying|busy-in-world`), and on `apply.json` it checks the version against `offer.json` (stale or revoked -> `result.json` `refused`), waits for the main menu (`getConnection()==null && level==null`, else `busy-in-world`), verifies staged sha256s, copies tier-0 files from `<instance>/.reality/staging/<v>/` (temp + rename, paths confined to the instance; any path ending `.jar` or under `mods/` is never copied, whatever its tier; a file that is missing, mismatched or cannot be written, e.g. locked on Windows, goes to `restart` per file while the rest continues; `atMainMenu` is re-checked on the render thread right before copying, else the Apply stays parked as `busy-in-world`), runs `reloadResourcePacks` on the render thread via `Executor.execute` on the Minecraft instance if anything was applied, and writes `result.json` `applied` (other files listed in `restart`), `restart` if nothing could be applied, `failed` with the message on an unexpected exception or reload failure, then `healthy` after 10 s. Member names come from the `.names` properties file (`minecraft_class`, `get_instance`, `get_connection`, `level_field`, `reload_resource_packs`); nothing obfuscated is hard-coded. The JSON reader/writer is hand-written (`Json.java`) because the game classpath offers none. Launch wiring (`launcher.rs`, `hotswap_watch.rs`): `instances_launch` runs `apply_staged` (an `Err` is logged and treated as nothing staged) while holding its operation guard, before the normal sync; after a successful sync it takes `experimental.hotswap` from the manifest that sync already fetched (`pack_v2::record_synced_flag`/`take_synced_flag`; no extra request, and nothing runs when `disableHotswap` is true in config.json or the sync did not read a v2 manifest) and `launch_game` builds the `GateInput` (crash lock, `mappings::resolve_hotswap_names` -> `names_resolved`). Only when `enabled_tiers` is non-empty does it write `hotswap-names.properties` into a fresh session dir (`<instance>/.reality/hotswap/<ms>/`) and append the four args after the branding/badge args; otherwise nothing is written and the arg list is unchanged. `resolve_hotswap_names` is cached in `mappings/<mc>/hotswap-names-<loader>.json` and gives Forge/NeoForge the official names as the primary set and the SRG members as `alt` (written as `alt.minecraft_class`, `alt.get_instance`, `alt.get_connection`, `alt.level_field`, `alt.reload_resource_packs`); the agent (`GameAccess.Reflective`) tries the primary set, then the alt set, and the set that fully resolves wins; if neither does it stays inert (status `idle`, any Apply is `refused`). `spawn_hotswap_watch` polls `/instances/:id/pack/manifest` every 60 s (x2 on error up to 600 s, reset on success), stages a higher version, writes `offer.json` and emits `hotswap-offer`; flag turned off -> `offer.json` with `revoked:true`. A 1 s watcher emits `hotswap-result`. On game exit the watch stops, `update_crash_lock` locks hotswap for that pack version if the last `result.json` is `applied` (no `healthy`), and older session dirs are deleted. `closeOnLaunch` is stored and shown in Settings but nothing acts on it, so no code path exits the launcher while the game runs. UI (`hooks/useHotswapPrompt.tsx`, mounted in `LauncherApp`): `hotswap-offer` shows a persistent toast (id `hotswap-offer`) "Pack updated – apply now?" with Apply / Later when `liveCount > 0` (Apply is always clickable; after a click the toast polls `hotswap_agent_state` and shows "Go to the main menu to apply" while it says `busy-in-world`; the agent waits for the menu itself), or "Restart to apply" when only restart items; `revoked` dismisses it. `hotswap-result` toasts `applied` -> "Applied live", `restart` -> "Restart to apply", `failed` -> "Swap failed – will apply next launch"; `refused` dismisses the offer toast, `healthy` only logs. `hotswap_apply` finds the session dir through a registry filled by `spawn_hotswap_watch` and cleared by `WatchHandle::stop`. Settings > Game has the `disableHotswap` switch ("Disable hotswap on this PC"). `stage` verifies every downloaded file against the manifest (size when given, sha1 for mods, sha256/crc32 for files) and discards the staging on a mismatch. Telemetry (`hotswap_telemetry.rs`): `hotswap_offer` from the poll loop, `hotswap_applied`/`hotswap_restart_required`/`hotswap_failed` from the result watcher, `hotswap_crash_lock` when a lock is first written; payloads hold loader, `mcVersion`, `launcherVersion` and counts only (errors are path-redacted and capped), and the API must list the event types in `TELEMETRY_EVENT_TYPES`. Manual in-game results are tracked in `docs/superpowers/specs/2026-11-23-mod-hotswap-results.md`

---

## 10. Changelog

After every fix or feature commit, update `docs/CHANGELOG.md` with:
- **Added** — new features
- **Changed** — behavior/API changes
- **Fixed** — bug fixes (reference the bug #)
- **Perf** — performance improvements
- **Removed** — deprecated features

### Format
```markdown
## [Unreleased] — YYYY-MM-DD

### Fixed
- Description of the fix (#N)

### Perf
- Description of the perf improvement
```

### Pre-commit checklist
1. `cargo check --lib` — Rust compiles clean
2. `bun test` — JS bridge tests pass
3. `bun run check:bridge` — TypeScript typechecks
4. Update `docs/CHANGELOG.md` with the change
5. Keep `CLAUDE.md` in sync — update project structure, commands, conventions, and any other section that changed
