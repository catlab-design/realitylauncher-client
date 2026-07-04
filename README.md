# Reality Launcher Client (Tauri Edition)

Modern desktop client for Reality Launcher, built with Tauri v2, React 19, Vite, and Rust.

Unlike the legacy client (`ml-client-old`) which used Electron and Astro, this new client (`ml-client-new`) runs on Tauri v2. This switch yields significant performance enhancements, a much smaller installation footprint, and utilizes the system's native WebView.

---

## Tech Stack

- **Frontend:**
  - [React 19](https://react.dev/) + TypeScript
  - [Vite 5](https://vitejs.dev/) (Bundler)
  - [Tailwind CSS v4](https://tailwindcss.com/) (Styling)
  - [Zustand](https://github.com/pmndrs/zustand) (State Management)
  - [Framer Motion](https://www.framer.com/motion/) & [GSAP](https://gsap.com/) (Fluid animations)
  - [skinview3d](https://github.com/bsspirit/skinview3d) (3D Minecraft skin rendering)

- **Desktop Shell & Backend:**
  - [Tauri v2](https://v2.tauri.app/) (Rust-based desktop window runner)
  - Native operations (Minecraft instance execution, CurseForge/Modrinth API interactions, cloud sync, modpack syncing, Java installation, Telemetry, Discord Rich Presence integration)

- **Package Manager:** [Bun](https://bun.sh/) 1.x

---

## Requirements

To run and build this application locally, ensure you have the following installed:

- **Bun** 1.x
- **Node.js** 20+ (optional, primarily for additional tooling)
- **Rust** stable (via `rustup`)
- **System Webview Support:**
  - **Windows:** Microsoft Edge WebView2
  - **macOS:** WebKit (comes default)
  - **Linux:** `webkit2gtk` (see [Tauri installation guides](https://v2.tauri.app/start/prerequisites/))

---

## Quick Start

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Run in development mode:**
   ```bash
   bun run tauri dev
   ```
   This command starts the Vite dev server and spawns the Tauri native shell pointing to the local dev URL.

---

## Common Commands

```bash
# Run in development mode
bun run tauri dev

# Build the production packages (installer binaries for your current platform)
bun run tauri build

# Verify Vite build output only
bun run build

# Run typescript compilation bridge check
bun run check:bridge
```

---

## Directory Structure

```text
ml-client-new/
├── index.html                  # HTML entry point
├── package.json                # Project dependencies and scripts
├── tsconfig.json               # Frontend TypeScript configuration
├── vite.config.ts              # Vite configuration
├── src/                        # Frontend source code (React 19)
│   ├── assets/                 # Icons, backgrounds, and static media
│   ├── components/             # Reusable UI components & application tabs
│   ├── hooks/                  # Custom React hooks (localization, etc.)
│   ├── store/                  # Zustand stores (auth, config, UI states)
│   ├── styles/                 # Tailwind CSS & global styles
│   └── types/                  # TypeScript interface definitions
└── src-tauri/                  # Backend source code (Rust)
    ├── Cargo.toml              # Rust crate dependencies
    ├── tauri.conf.json         # Tauri application configuration
    ├── capabilities/           # Tauri v2 security permission policies
    └── src/                    # Rust backend modules (commands, configs, instances)
```

---

## Telemetry & API Configurations

The client communicates with the Reality Launcher backend via a preconfigured API endpoint. The backend settings are configured in the Rust backend code (`src-tauri/src/`) targeting `https://api.reality.catlabdesign.space`.

---

## Contributing

Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for details on setting up development workflows, coding standards, and commit structures.

## License

GPL-3.0-only. See [LICENSE](./LICENSE).
