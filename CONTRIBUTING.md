# Contributing to Reality Launcher Client (Very Fast & Lightweight)

Thank you for your interest in contributing to the Reality Launcher Client! This document details the setup steps, development workflow, and coding guidelines to help you contribute effectively.

---

## Prerequisites

Ensure you have the following installed on your machine:

1. [Bun](https://bun.sh/) 1.x (as the primary package manager and runtime)
2. [Rust Stable](https://www.rust-lang.org/tools/install) (via `rustup`)
3. OS-Specific WebView requirements (refer to [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/))

---

## Local Setup

1. **Clone the repository and enter the directory:**
   ```bash
   cd ml-client-new
   ```

2. **Install frontend dependencies:**
   ```bash
   bun install
   ```

---

## Development Workflow

### Running in Development

To start the development environment:
```bash
bun run tauri dev
```
This runs the frontend Vite development server (with HMR) and compiles the Rust backend, spawning the Tauri app window. 

- Modifying files in `src/` will hot-reload the UI.
- Modifying files in `src-tauri/src/` will cause Tauri to recompile the backend and relaunch the window automatically.

---

## Code Quality & Styling Guidelines

To keep the codebase clean and robust, please adhere to the following rules:

### Commenting Standards
We follow strict guidelines regarding comments in the codebase:
- **No Redundant Comments:** Avoid adding obvious AI-style comments (e.g. comments explaining simple loops, variable assignments, standard React states, or basic Tauri command definitions).
- **Keep Complex Annotations:** Write comments *only* when explaining complex business logic, unexpected quirks, third-party library workarounds (e.g. React Toast stacking or canvas skin calculations), or telemetry synchronization rules.
- Maintain a Boy Scout rule: when editing a file, clean up any pre-existing redundant comments or dead code.

### TypeScript and React Guidelines
- Prefer declarative operations (like `.map()`, `.filter()`, and `.reduce()`) over verbose loops where appropriate.
- Ensure type safety. Use clean TypeScript types/interfaces and avoid generic `any` types unless absolutely necessary.
- Run type checks prior to pushing code:
  ```bash
  bun run check:bridge
  bun run build
  ```

---

## Preparing a Pull Request

1. **Test Compilation:**
   Ensure everything compiles correctly without compiler warnings or errors:
   - Frontend check: `bun run build`
   - Backend check: Run `cargo check` in the `src-tauri` folder.
2. **Submit clear PRs:**
   - Keep PRs small and focused on a single feature or bug fix.
   - Provide a concise description of the changes, reproducing steps for bugs, and screenshots/videos for UI-level changes.
   - Reference corresponding issues (e.g. `Fixes #123`).
