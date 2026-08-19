# CLAUDE.md — Reality Launcher Client

## 1. Project Overview

| Property | Value |
|---|---|
| **Name** | Reality Launcher (package: `ml-tauri-poc`) |
| **Version** | 4.0.2 |
| **License** | GPL-3.0-only |
| **Description** | ML-Launcher POC with Tauri + Rust — Minecraft launcher |
| **Copyright** | 2026 Q Team \| Studio <studiotne1@gmail.com> |
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
├── scripts/fix-asset-src.mjs          # Astro → Vite asset codemod
├── src/                                # React frontend source
├── src-tauri/                          # Rust + Tauri backend
├── index.html                          # Entry HTML (lang="th")
├── package.json
├── vite.config.ts                      # Vite build config
├── tsconfig.json / tsconfig.node.json / tsconfig.bridge.json
├── bun.lock
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
│   ├── LauncherAppLazyTabs.tsx       # Lazy-loaded tab re-exports
│   ├── LauncherAppOverlays.tsx        # All modal dialogs
│   ├── LauncherAppShell.tsx           # Shell (titlebar + sidebar + content)
│   ├── LauncherAppTitleBar.tsx        # Custom title bar
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
│   └── ui/                            # Reusable UI primitives (18 components)
│       ├── AnimatedGradientText.tsx
│       ├── AppVersionBadge.tsx
│       ├── BannerImage.tsx
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
│   └── useTranslation.ts             # i18n hook
├── i18n/
│   ├── translations.ts               # Barrel export
│   ├── translations-en.ts            # English (1111 keys)
│   └── translations-th.ts            # Thai (732+ keys, default fallback)
├── lib/
│   ├── bulkDelete.ts
│   ├── constants.ts                  # COLOR_THEMES map
│   ├── firstRunOnboarding.ts
│   ├── installLock.ts
│   ├── launchPolicy.ts
│   ├── microsoftLoginFlow.ts         # MS device code flow
│   ├── sounds.ts                     # Sound effects manager
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
├── build.rs
├── capabilities/default.json         # Security permissions
├── config/                           # Minecraft optimization configs
│   ├── debugify.json, entityculling.json, lithium.properties
│   ├── modernfix-mixins.properties, rrp.properties, sodium-mixins.properties
├── icons/                            # All platform icon formats
└── src/
    ├── main.rs                       # Entry point, 93+ command registrations
    ├── lib.rs                        # Module declarations
    ├── http_client.rs                # (23 lines) Global shared reqwest::Client (pooled, HTTP/2, gzip, brotli)
    ├── download.rs                   # (315 lines) Shared concurrent download engine
    ├── launcher.rs                   # (2127 lines) Game launch — largest module
    ├── auth.rs                       # Microsoft OAuth + CatID auth
    ├── config.rs                     # (335 lines) Config + RAM detection + folder migration (cancel/progress/rollback)
    ├── instances.rs                  # Instance CRUD + copy_dir_recursive_with_progress
    ├── op_guard.rs                   # Exclusive/shared operation guard (migration vs install/sync/launch)
    ├── java.rs                       # Java detection/installation
    ├── modrinth.rs                   # Modrinth API
    ├── curseforge.rs                 # CurseForge API
    ├── modpack.rs                    # Modpack install
    ├── content.rs                    # Mod/resourcepack management
    ├── cloud.rs                      # Cloud sync, server instances, invitations
    ├── admin.rs                      # Admin commands (10)
    ├── update.rs                     # App update check/download/install
    ├── fs_utils.rs                   # FS utilities (open, browse, clear cache)
    ├── window.rs                     # Window management
    ├── discord.rs                    # Discord Rich Presence
    ├── social.rs                     # Server ping
    ├── telemetry.rs                  # Telemetry logging
    ├── wardrobe.rs                   # Minecraft + CatSkinC skin management
    └── mod_meta.rs                   # Mod metadata helpers
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
| `uiStore` | `store/uiStore.ts` | No | `activeTab`, `lastContentTab`, `wardrobeMode`, `settingsTab`, 9 modal booleans |
| `launchStore` | `store/launchStore.ts` | No | `launchingId` |
| `progressStore` | `store/progressStore.ts` | No | `isInstalling`, `installProgress`, `operationType`, `installingInstanceId` |

ConfigStore migration (v0→v1): `closeOnLaunch` changed from `boolean` to `'keep-open' | 'hide-reopen' | 'close'`.

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
| **launcher** | `is_game_running`, `kill_game` (emits `game-stopped`), `instances_launch`, `get_playing_instance_id`, `instance_read_latest_log`, `instance_tail_log`, `get_app_version`, `is_dev_mode`, `browse_java`, `instances_preinstall` |
| **java** | `install_java`, `detect_java_installations`, `delete_java`, `test_java_execution`, `auto_detect_java` |
| **admin** | `check_status`, `get_settings`, `save_setting`, `get_users`, `ban_user`, `unban_user`, `toggle_user_admin`, `create_user`, `get_user_details`, `get_system_info` |
| **content** | mod/resourcepack CRUD + toggle + delete + install + lock |
| **modrinth** | `modrinth_search`, `get_project`, `get_versions`, etc. |
| **curseforge** | `curseforge_search`, `get_project`, `get_files`, `get_description`, `clear_cache` |
| **modpack** | `install`, `install_from_modrinth`, `install_from_curseforge`, `cancel_install`, `pre_install`, `list_files` |
| **update** | `check_latest_version`, `download_update`, `install_update` |
| **fs_utils** | `open_folder`, `open_url`, `browse_directory`, `browse_icon`, `browse_modpack`, `launcher_clear_cache`, `check_dir_empty` |
| **window** | `window_minimize`, `window_maximize`/`unmaximize`, `window_close`, `is_maximized`, `set_main_mode` |
| **cloud** | joined servers, join/leave, cloud install/sync, invitations, notifications |
| **discord** | `discord_rpc_set_enabled`, `discord_rpc_update`, `discord_rpc_is_connected` |
| **social** | `server_ping` |
| **telemetry** | `telemetry_log_event` |
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
- **Test file**: `src/api.test.ts` (120 lines)
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

---

## 9. Important Gotchas

1. **`#![windows_subsystem = "windows"]`** — No console on Windows even in debug; stdout still works when launched via `tauri dev`
2. **Tailwind v4 has no config file** — configured entirely via `@tailwindcss/vite` plugin and `@import "tailwindcss"` in CSS; no `tailwind.config.*` or `postcss.config.*`
3. **ConfigStore migration** — `closeOnLaunch` migrated from `boolean` to `'keep-open' | 'hide-reopen' | 'close'` (version 0→1); `javaPath` preserved on reset
4. **The `api.ts` Proxy** auto-wires `on*` methods as `listen()` event targets — don't manually call `listen()` for `window.api.on*` events
5. **Some UI code still uses `window.api.X()`** from the Electron era — these are validated by the bridge parity test
6. **Fonts are self-hosted** via `@fontsource` — works offline, no Google Fonts dependency
7. **No `public/` directory** — all assets are in `src/assets/` and imported directly
8. **No CI/CD or Docker** — `.github/` is empty
9. **`src-tauri/src/download.rs`** — shared concurrent download engine using `tokio::sync::Semaphore` (default 8 concurrency). Accepts a progress callback, supports retry with backoff, SHA1/SHA256/SHA512 hash verification, atomic writes (temp + rename), JAR/ZIP validation, and per-error `missing_on_server` vs `failed` classification. Replaces old sequential loops in CurseForge modpack install (`install_cf_modpack`) and cloud sync (`sync_managed_mods`, `sync_server_mods` queue).

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
