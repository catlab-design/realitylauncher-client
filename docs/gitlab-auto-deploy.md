# GitLab CI/CD Auto Deploy Setup (Linux + Windows + macOS)

This guide uses `.gitlab-ci.yml` in the `ml-client` root.

## Pipeline Summary

The pipeline now supports 3 build jobs:

- `build:linux` (always enabled)
- `build:windows` (enabled when `ENABLE_WINDOWS_RELEASE=true`)
- `build:macos` (enabled when `ENABLE_MACOS_RELEASE=true`)

Then `deploy:r2` uploads all available artifacts to Cloudflare R2/CDN and updates:

- `client/latest.yml` (Windows updater metadata, when available)
- `client/latest-mac.yml` (macOS updater metadata, when available)
- `client/latest-linux.yml`
- `client/latest.json` (combined download map)

## 1) Connect External Repository in GitLab

From GitLab page `Run CI/CD for external repository`:

1. Use `GitHub` button if possible.
2. If using `Repository by URL`:
   - Public repo: URL only.
   - Private repo:
     - Username: GitHub username (or `x-access-token`)
     - Password: GitHub PAT with repo read permission
3. Create project after connection succeeds.

## 2) Configure GitLab CI/CD Variables

Path:

- `Project -> Settings -> CI/CD -> Variables`

Required (Masked + Protected):

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Optional:

- `R2_BUCKET` (default `realitystorage`)
- `CDN_URL` (default `https://cdn.reality.catlabdesign.space`)
- `ENABLE_FLATPAK_RELEASE` (`true` to build/upload `.flatpak`)
- `ENABLE_WINDOWS_RELEASE` (`true` to run Windows build job)
- `ENABLE_MACOS_RELEASE` (`true` to run macOS build job)
- `DEPLOY_ON_MAIN` (`true` to auto-deploy on `main`)
- `MANUAL_DEPLOY` (`true` for manual deploy via Run pipeline UI)
- `RELEASE_VERSION` (override release version)
- `CHANGELOG` (insert into `latest.json`)

Recommended:

- Protect tag pattern `v*`
- Keep Cloudflare secrets as `Protected`

## 3) Runner Setup by Platform

Linux:

- GitLab shared runner is enough for `build:linux` + `deploy:r2`.

Windows (self-hosted required):

1. Install GitLab Runner on Windows host.
2. Register with `shell` executor.
3. Add tag: `windows`.
4. Install dependencies on runner machine:
   - Bun
   - Rust toolchain (`rustc`, `cargo`)

macOS (self-hosted required):

1. Install GitLab Runner on macOS host.
2. Register with `shell` executor.
3. Add tag: `macos`.
4. Install dependencies on runner machine:
   - Bun
   - Rust toolchain (`rustc`, `cargo`)

Example register command:

```bash
gitlab-runner register \
  --url "https://gitlab.com/" \
  --token "<PROJECT_RUNNER_TOKEN>" \
  --executor "shell" \
  --description "windows-runner" \
  --tag-list "windows" \
  --run-untagged="false"
```

Use the same pattern for macOS with tag `macos`.

## 4) Trigger Release Deploy

Recommended release flow:

```bash
git tag v2.2.1
git push origin v2.2.1
```

Behavior:

- On tag `v*`, pipeline builds enabled platforms and deploys automatically.
- On `main`, deploy runs only when `DEPLOY_ON_MAIN=true`.

## 5) Manual Deploy from GitLab UI

1. Open `Build -> Pipelines -> Run pipeline`
2. Choose branch (usually `main`)
3. Set variable `MANUAL_DEPLOY=true`
4. Optional variables:
   - `RELEASE_VERSION=2.2.1`
   - `CHANGELOG=...`
5. Run pipeline

## 6) Verify Outputs

After `deploy:r2` succeeds:

- `https://cdn.reality.catlabdesign.space/client/latest.json`
- `https://cdn.reality.catlabdesign.space/client/latest-linux.yml`
- `https://cdn.reality.catlabdesign.space/client/latest.yml` (if Windows build enabled)
- `https://cdn.reality.catlabdesign.space/client/latest-mac.yml` (if macOS build enabled)
- `https://cdn.reality.catlabdesign.space/client/<version>/`
