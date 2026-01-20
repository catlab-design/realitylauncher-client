# Reality Launcher (Client)

The desktop client for Reality Launcher. Built with Electron, Astro, React, and a Rust core for high-performance process management.

## Tech Stack

*   **Frontend**: [Astro](https://astro.build/) + React
*   **Shell**: [Electron](https://www.electronjs.org/)
*   **Core Logic**: Rust (ml-launcher-core)
*   **Styling**: Tailwind CSS
*   **Bundler**: Vite (via Astro)

## Prerequisites

*   [Node.js](https://nodejs.org/) (v18+)
*   [Rust](https://www.rust-lang.org/tools/install) (latest stable) - Required for building `ml-launcher-core`.

## Setup

1.  Install Node dependencies:
    ```bash
    npm install
    # or
    bun install
    ```

2.  Build the Rust Core:
    The launcher relies on a Rust binary for heavy lifting (game launch, process monitoring).
    ```bash
    npm run build:rust
    ```
    *This compiles the code in `../ml-launcher-core`.*

## Development

Run the app in development mode (hot-reload enabled):

```bash
npm run dev
```

## Build & Distribute

Build the production executable (calls `build:rust` internally if configured, otherwise ensure rust is built):

```bash
# For current OS
npm run dist

# Specific platforms (requires appropriate build tools)
npm run dist:win
npm run dist:mac
npm run dist:linux
```

Output files will be in the `release` directory.

## Architecture

*   `src/electron`: Main process code (IPC, Node.js APIs).
*   `src/pages`, `src/components`: UI code (Astro/React).
*   `../ml-launcher-core`: Rust implementation for game launching logic.
