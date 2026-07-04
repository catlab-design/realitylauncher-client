# Tauri Client — Feature Gap Analysis (2026-06-30)

Comparison of the shipping Electron client (`ml-client-old`) against the Tauri
client (`ml-client-new`). Derived by cross-referencing every `window.api.*` call
in the React UI against the methods defined in `src/api.ts`, the registered Rust
`#[tauri::command]`s, and the Electron `ipcMain.handle` channels.

**Why so much slips through:** `src/api.ts` wraps the command table in a `Proxy`.
Any method the UI calls that is *not* defined returns `Promise.resolve(null)`
instead of throwing — so missing or misnamed bridges fail silently. The
`api.test.ts` bridge-parity test only checks that `invoke('x')` targets map to a
Rust command; it does **not** check that every `window.api.x()` the UI calls is
actually defined. That blind spot is tracked as item C1.

Counts: 108 distinct `window.api.*` methods called by the UI; 95 defined in
`api.ts`; 93 Rust commands; 98 Electron IPC channels.

---

## Group A — Backend exists, UI can't reach it (bridge-only fixes)

These are the highest value/effort ratio: the Rust command is already written and
registered; `api.ts` either omits it or names it differently, so the UI's call
hits the null stub.

| UI calls | Should map to | Rust cmd | Status | Notes |
|---|---|---|---|---|
| `getConfig()` | `config_get` | ✅ exists (as `configGet`) | **name mismatch** | UI [LauncherApp.tsx:267](../src/components/LauncherApp.tsx#L267) loads config via `getConfig` → null → **disk config never loads on startup** |
| `setConfig()` | `config_set` | ✅ exists (as `configSet`) | **name mismatch** | [LauncherApp.tsx:757](../src/components/LauncherApp.tsx#L757) → null → **settings never persist** (RAM/lang/theme run on defaults) |
| `discordRPCSetEnabled()` | `discord_rpc_set_enabled` | ✅ registered | **not in api.ts** | Discord RPC backend complete but unreachable |
| `discordRPCUpdate()` | `discord_rpc_update` | ✅ registered | **not in api.ts** | |
| `discordRPCIsConnected()` | `discord_rpc_is_connected` | ✅ registered | **not in api.ts** | |
| `getSession()` | `get_session` | ✅ exists (as `authGetAccount`) | **name mismatch** | |
| `logout()` | `logout` | ✅ exists (as `authLogout`) | **name mismatch** | logout button |
| `instancesListFiles()` | `instances_list_files` | ✅ registered | **not in api.ts** | instance file browser / FileSelectionTree |
| `instancesPreInstall()` | `instances_pre_install` | ✅ registered | **not in api.ts** | modpack pre-install preview |
| `openExternal()` | `open_url` | ✅ exists (as `openUrl`) | **name mismatch** | external links |

**Fix:** add the missing/aliased methods to `src/api.ts`. No Rust work.

---

## Group A′ — Bridge + a small Rust command (Electron had a handler, Rust does not)

Same surface as Group A but the Rust command must be written first (the Electron
channel exists, so behavior is known).

| UI calls | Electron channel | Rust cmd | Effort |
|---|---|---|---|
| `deleteJava(major)` | `delete-java` | ❌ add to `java.rs` | small (rm `jdk-{major}` + clear config tier) |
| `testJavaExecution(path)` | `test-java-execution` | ❌ add to `java.rs` | small (probe `-version`, return major/vendor) |
| `curseforgeClearCache()` | `curseforge-clear-cache` | ❌ | small |
| `modrinthClearCache()` | `modrinth-clear-cache` | ❌ | small |
| `downloadUpdate()` / `installUpdate()` | `download-update` / `install-update` | ❌ updater only has `check_latest_version` | medium (download + run installer per-OS) |
| `windowSetMainMode()` | `window-set-main-mode` | ❌ | small (resize/recenter window) |
| `getSystemInfo()` | `admin-get-system-info` | ❌ | small (OS/arch/RAM via std + sysinfo) |

---

## Group B — No backend anywhere (real ports)

### B5 — Admin Panel + User Management
`AdminPanel.tsx` and `UserManagement.tsx` render but have **zero** backend. All of
these are authenticated ml-api passthrough calls (Electron channels in parens):

| UI method | Electron channel | ml-api (verify in admin-handlers) |
|---|---|---|
| `checkAdminStatus` | `admin-check-status` | GET admin status |
| `getAdminUsers` | `admin-get-users` | GET users |
| `getUserDetails` | `admin-get-user-details` | GET user |
| `createUser` | `admin-create-user` | POST user |
| `banUser` / `unbanUser` | `admin-ban-user` / `admin-unban-user` | POST ban/unban |
| `toggleUserAdmin` | `admin-toggle-user-admin` | POST role |
| `getAdminSettings` | `admin-get-settings` | GET settings |
| `saveAdminSetting` | `admin-save-setting` | PUT setting |
| `getSystemInfo` | `admin-get-system-info` | local |

**Approach:** one `admin.rs` module of bearer-token passthrough commands (reuse
the auth token store like `cloud.rs` does). Token must stay in Rust — never the
webview.

### B6 — CatID account registration / recovery
No backend: `registerCatID`, `checkRegistrationStatus`, `forgotPassword`,
`resetPassword`, `loginCatIDToken` (`auth-catid-login-token`), `authUnlink`,
`setActiveSession` (multi-account switching — Rust auth currently stores a single
session). These are ml-api `/auth/catid/*` passthroughs plus multi-account
storage in `auth.rs`.

---

## Group C — Process gaps

- **C1** — `api.test.ts` only validates `invoke()` → Rust command, missing the
  proxy-null mismatches above. Extend it to assert every `window.api.X()` called
  in `src/**` is either defined in `api.ts` or an `on*` listener. This single test
  would have caught the config bug.

---

## Cross-platform requirement (Windows / Linux / macOS)

All new/fixed code must work on the three desktop targets. Watch-items:

- **Java auto-install** (already `cfg!`-guarded): Windows zip + `java.exe`; Linux
  tar.gz; macOS tar.gz with the JDK under `Contents/Home/bin`. `deleteJava` must
  remove the same per-OS layout.
- **`installUpdate`**: per-OS installer invocation (nsis/msi vs dmg vs AppImage/deb)
  — likely defer to `tauri-plugin-updater` rather than hand-rolling.
- **`window_set_main_mode`** and any spawn must use `Emitter`/Tauri window APIs,
  not platform shells.
- **`open_url` / folder open**: use `tauri-plugin-opener` semantics, not
  `cmd /c start` / `open` / `xdg-open` directly.
- Prefer `cfg!(target_os = ...)` / `cfg!(target_arch = ...)` over runtime string
  checks; keep one code path that compiles on all three.

---

## Recommended order

1. **A** (bridge-only) — unblocks config persistence, Discord RPC, file browser,
   logout/session, external links. Small, high impact.
2. **C1** — extend the parity test so these can't silently regress again.
3. **A′** — small Rust commands (deleteJava/testJavaExecution/clear caches/window mode).
4. **B5** — Admin Panel passthrough (`admin.rs`).
5. **B6** — CatID registration/recovery + multi-account.
6. Updater download/install (A′ medium) — fold into migration Phase 5/8.
