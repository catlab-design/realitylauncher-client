# GitLab CI/CD Runbook (CI + Auto Deploy)

This runbook is for `ml-client/.gitlab-ci.yml`.

It covers:

- GitLab external repository setup
- Runner setup for each OS
- CI/CD variable setup
- CI behavior for merge requests and `main`
- Tag/manual deploy flow
- Verification and quick troubleshooting

## Pipeline Design

CI job:

- `ci:checks` runs for merge requests and `main` (uses `windows` shell runner)
- validates:
  - `check-no-app-asar-writes`
  - app build
  - Rust `cargo check`

Build jobs:

- `build:linux` runs for release pipelines only
- `build:windows` runs only when `ENABLE_WINDOWS_RELEASE=true`
- `build:macos` runs only when `ENABLE_MACOS_RELEASE=true`

Deploy job:

- `deploy:r2` downloads artifacts from all available build jobs
- Uploads files to `R2_BUCKET/client/<version>/...`
- Updates:
  - `client/latest.yml` (Windows, if available)
  - `client/latest-mac.yml` (macOS, if available)
  - `client/latest-linux.yml` (required)
  - `client/latest.json` (combined download metadata)

## Step 1: Create GitLab Project for External Repository

From `Run CI/CD for external repository` page:

1. Prefer `GitHub` connection button.
2. If using `Repository by URL`:
   - Public repo: URL only
   - Private repo:
     - Username: GitHub username or `x-access-token`
     - Password: GitHub PAT with repo read permission
3. Create project after connection test succeeds.

## Step 2: Add Required CI/CD Variables

Path:

- `Project -> Settings -> CI/CD -> Variables`

Required:

- `CLOUDFLARE_API_TOKEN` (Masked, Protected)
- `CLOUDFLARE_ACCOUNT_ID` (Masked, Protected)

Optional:

- `R2_BUCKET` default `realitystorage`
- `CDN_URL` default `https://cdn.reality.catlabdesign.space`
- `ENABLE_FLATPAK_RELEASE` set `true` to publish flatpak
- `ENABLE_WINDOWS_RELEASE` set `true` to enable Windows build job
- `ENABLE_MACOS_RELEASE` set `true` to enable macOS build job
- `WINDOWS_LOW_RESOURCE_MODE` default `true`, tune Windows build for low-RAM runners
- `WINDOWS_NODE_MAX_OLD_SPACE_MB` default `768`, Node memory cap for Windows low-resource mode
- `DEPLOY_ON_MAIN` set `true` to deploy from `main` pushes
- `MANUAL_DEPLOY` set `true` when starting deploy from UI
- `MANUAL_RELEASE` alternative flag for manual release from UI
- `RUN_CI_ONLY` set `true` to run CI checks from UI without release
- `RELEASE_VERSION` force deploy version in manual runs
- `CHANGELOG` string written into `latest.json`

Recommended:

- Protect tag pattern `v*`
- Keep Cloudflare secrets protected

## Step 3: Configure Runners

Linux self-hosted:

1. Install GitLab Runner
2. Register runner with `shell` executor
3. Assign tag `linux`
4. Install tools on runner host:
   - Node.js + npm
   - Bun
   - Rust toolchain (`rustc`, `cargo`)
   - Build toolchain: `make`, `gcc`, `g++`, `python3`
   - `g++` must support C++20 (`-std=gnu++20`) for Electron native rebuild
   - `jq`, `sed`, `find`
   - `flatpak`, `flatpak-builder`, `elfutils` (only if `ENABLE_FLATPAK_RELEASE=true`)

Windows self-hosted:

1. Install GitLab Runner
2. Register runner with `shell` executor
3. Assign tag `windows`
4. Install tools on runner host:
   - Git
   - Node.js 20+ (with `corepack`) or preinstalled `pnpm`
   - pnpm (pipeline will try `corepack` auto-setup)
   - Rust toolchain (`rustc`, `cargo`)
5. For very small runners (e.g. 1 GB RAM), keep:
   - `WINDOWS_LOW_RESOURCE_MODE=true`
   - `WINDOWS_NODE_MAX_OLD_SPACE_MB=768` (adjust 512-1024 if needed)

macOS self-hosted:

1. Install GitLab Runner
2. Register runner with `shell` executor
3. Assign tag `macos`
4. Install tools on runner host:
   - Bun
   - Rust toolchain (`rustc`, `cargo`)

Register example:

```bash
gitlab-runner register \
  --url "https://gitlab.com/" \
  --token "<PROJECT_RUNNER_TOKEN>" \
  --executor "shell" \
  --shell "powershell" \
  --description "windows-runner"
```

Linux example:

```bash
gitlab-runner register \
  --url "https://gitlab.com/" \
  --token "<PROJECT_RUNNER_TOKEN>" \
  --executor "shell" \
  --shell "bash" \
  --description "linux-runner"
```

After registration, set runner tags on GitLab UI:

- `Project -> Settings -> CI/CD -> Runners -> Edit runner`
- Set tag to `windows` or `linux` or `macos`
- Set `Run untagged jobs` to `off`
- Keep `Locked to current project` as needed

## Step 4: Enable Platforms

If you want all 3 platforms:

- set `ENABLE_WINDOWS_RELEASE=true`
- set `ENABLE_MACOS_RELEASE=true`

If not set, pipeline will still work with Linux only.

## Step 5: Trigger Deploy

Release by tag (recommended):

```bash
git tag v2.2.1
git push origin v2.2.1
```

Manual deploy from UI:

1. `Build -> Pipelines -> Run pipeline`
2. Branch: usually `main`
3. Add one of:
   - `MANUAL_DEPLOY=true`
   - `MANUAL_RELEASE=true`
4. Optional:
   - `RELEASE_VERSION=2.2.1`
   - `CHANGELOG=...`
5. Run

Run CI-only from UI:

1. `Build -> Pipelines -> Run pipeline`
2. Branch: `main` or feature branch
3. Add variable `RUN_CI_ONLY=true`
4. Run

Main branch auto deploy:

- set `DEPLOY_ON_MAIN=true`

## Step 6: Verify Result

After `deploy:r2` success, verify:

- `https://cdn.reality.catlabdesign.space/client/latest.json`
- `https://cdn.reality.catlabdesign.space/client/latest-linux.yml`
- `https://cdn.reality.catlabdesign.space/client/latest.yml` (when Windows enabled)
- `https://cdn.reality.catlabdesign.space/client/latest-mac.yml` (when macOS enabled)
- `https://cdn.reality.catlabdesign.space/client/<version>/`

## Troubleshooting

`ci:checks` or `build:linux` stuck pending:

- check there is an online runner tagged `linux`

`build:windows` stuck pending:

- check there is an online runner tagged `windows`

`build:macos` stuck pending:

- check there is an online runner tagged `macos`

`deploy:r2` fails with auth error:

- verify `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`

`latest-linux.yml not found`:

- check `build:linux` succeeded and artifact includes `release-build/latest-linux.yml`

Linux job fails with `bun/rustc/cargo/jq/sed/find not found`:

- install missing tools on the Linux host runner and rerun pipeline

Linux fails early: `prepare environment: exit status 1`:

- this is runner host shell/profile issue (fails before CI script starts)
- check as runner user:
  - `sudo -u gitlab-runner -H bash -lc 'echo PROFILE_OK'`
- if command fails, fix `~gitlab-runner/.bashrc`, `~gitlab-runner/.profile`, `~gitlab-runner/.bash_profile`:
  - remove `exit`, failing commands, or strict commands that break non-interactive shell
  - keep interactive-only commands behind guard:
    - `case $- in *i*) ;; *) return ;; esac`
- restart runner service and retry pipeline

Linux fails with `sh: 1: eval: Running on ...nrm: not found`:

- this is a known Runner eval issue pattern with `sh`
- set runner shell to `bash` and enable feature flag `FF_USE_NEW_BASH_EVAL_STRATEGY`
- in `/etc/gitlab-runner/config.toml` under your `[[runners]]`:
  - `shell = "bash"`
  - add:
    - `[runners.feature_flags]`
    - `FF_USE_NEW_BASH_EVAL_STRATEGY = true`
- restart runner:
  - `sudo systemctl restart gitlab-runner`

Windows fails with `git is not recognized`:

- install Git on runner host and restart `gitlab-runner` service
- if `winget` and `choco` are unavailable, download installer from `https://git-scm.com/download/win`
- ensure `git.exe` is in system `PATH` for the service account

Windows fails with `rustup not found`:

- current pipeline no longer hard-fails if `rustup` is missing
- but `rustc` and `cargo` still must exist on the runner
- make sure tools are installed for the same account that runs `gitlab-runner` service
- if using rustup-based install, set default toolchain once:
  - `rustup default stable`
  - `rustc --version`

Linux fails in electron-builder with `JSON Parse error: Unexpected EOF`:

- usually caused by inconsistent package manager state in `node_modules`
- use `npm ci` (same lock manager as `package-lock.json`) before packaging
- clear stale modules first:
  - `rm -rf node_modules native/node_modules`
- validate npm dependency tree JSON once:
  - `npm list -a --include=prod --include=optional --omit=dev --json --long --silent > .tmp-npm-list.json || true`
  - `node -e "JSON.parse(require('fs').readFileSync('.tmp-npm-list.json','utf8')); console.log('ok')"`

Linux fails with `Cannot find module @rollup/rollup-linux-x64-gnu`:

- this is npm optional dependency bug in some environments
- ensure runner installs optional deps with clean install:
  - `rm -rf node_modules native/node_modules`
  - `npm ci --no-audit --fund=false --prefer-offline`
- if still missing, install it explicitly (no lockfile change):
  - `npm install --no-save @rollup/rollup-linux-x64-gnu`

Linux fails with `Cannot find module '../lightningcss.linux-x64-gnu.node'`:

- same root cause (missing optional native dependency)
- install explicit fallback (no lockfile change):
  - `npm install --no-save lightningcss-linux-x64-gnu`
