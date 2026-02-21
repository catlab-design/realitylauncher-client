# GitLab Auto Deploy Runbook (Linux + Windows + macOS)

This runbook is for `ml-client/.gitlab-ci.yml`.

It covers:

- GitLab external repository setup
- Runner setup for each OS
- CI/CD variable setup
- Tag/manual deploy flow
- Verification and quick troubleshooting

## Pipeline Design

Build jobs:

- `build:linux` runs by default
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
- `DEPLOY_ON_MAIN` set `true` to deploy from `main` pushes
- `MANUAL_DEPLOY` set `true` when starting deploy from UI
- `RELEASE_VERSION` force deploy version in manual runs
- `CHANGELOG` string written into `latest.json`

Recommended:

- Protect tag pattern `v*`
- Keep Cloudflare secrets protected

## Step 3: Configure Runners

Linux:

- GitLab shared runner is enough for `build:linux` and `deploy:r2`

Windows self-hosted:

1. Install GitLab Runner
2. Register runner with `shell` executor
3. Assign tag `windows`
4. Install tools on runner host:
   - Bun
   - Rust toolchain (`rustc`, `cargo`)

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
  --description "windows-runner" \
  --tag-list "windows" \
  --run-untagged="false"
```

Use the same command for macOS runner with tag `macos`.

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
3. Add variable `MANUAL_DEPLOY=true`
4. Optional:
   - `RELEASE_VERSION=2.2.1`
   - `CHANGELOG=...`
5. Run

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

`build:windows` stuck pending:

- check there is an online runner tagged `windows`

`build:macos` stuck pending:

- check there is an online runner tagged `macos`

`deploy:r2` fails with auth error:

- verify `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`

`latest-linux.yml not found`:

- check `build:linux` succeeded and artifact includes `release-build/latest-linux.yml`
