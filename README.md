# Reality Launcher Client

Desktop client for Reality Launcher, built with Electron + Astro/React and a Rust native module.

## Stack
- Frontend: [Astro](https://astro.build/) + React
- Desktop shell: [Electron](https://www.electronjs.org/)
- Native module: Rust (`native/`, napi-rs)
- Styling: Tailwind CSS

## Requirements
- [Bun](https://bun.sh/) 1.x
- [Node.js](https://nodejs.org/) 20+ (for tooling/scripts)
- [Rust](https://www.rust-lang.org/tools/install) stable

## Quick Start
```bash
bun install
cd native && bun install && bun run build && cd ..
bun run dev
```

## Common Commands
```bash
# Build web + electron bundles
bun run build

# Build native module only
bun run build:rust

# Package installers
bun run dist
bun run dist:win
bun run dist:mac
bun run dist:linux
```

Build artifacts are generated in `release-build/`.

## Environment
Copy `.env.example` to `.env.local` and adjust only what you need.

Main optional runtime env vars:
- `ML_API_URL`
- `AUTH_URL`
- `ML_CURSEFORGE_DOWNLOAD_CONCURRENCY`
- `ML_MODPACK_DOWNLOAD_CONCURRENCY`

Windows Store release helpers:
- `MS_STORE_PRODUCT_ID`
- `MS_STORE_MSIX_ARCH`
- `MS_STORE_TENANT_ID`
- `MS_STORE_SELLER_ID`
- `MS_STORE_CLIENT_ID`
- `MS_STORE_CLIENT_SECRET`
- `MSSTORE_BIN`

## CI And Release
- Public CI for PRs runs on GitHub-hosted runners (`.github/workflows/ci.yml`).
- Release pipeline uses self-hosted runners (`.github/workflows/build.yml`) and publish secrets.
- macOS self-hosted release runner is opt-in via repo variable `ENABLE_MACOS_RUNNER=true`.
- GitLab is also supported:
  - CI checks on merge requests/main (`.gitlab-ci.yml` job `ci:checks`)
  - release deploy flow (tag/manual/main with flags)
  - runs on self-hosted shell runners (`linux`, `windows`, `macos` tags)

## Contributing
See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Security
See [SECURITY.md](./SECURITY.md).

## License
GPL-3.0-only. See [LICENSE](./LICENSE).
