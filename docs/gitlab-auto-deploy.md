# GitLab CI/CD Auto Deploy Setup (External Repository)

This guide uses `.gitlab-ci.yml` in the `ml-client` root.

What this pipeline does:

- Build Linux release artifacts (`AppImage`, `deb`, `rpm`, optional `flatpak`)
- Upload artifacts to Cloudflare R2 under `client/<version>/...`
- Update:
  - `client/latest-linux.yml`
  - `client/latest.json`

Current scope:

- Works out of the box on GitLab Linux runners
- Windows/macOS builds need self-hosted runners and separate jobs

## 1) Connect External Repository in GitLab

From the page in your screenshot (`Run CI/CD for external repository`):

1. Use `GitHub` button if possible (recommended).
2. If you use `Repository by URL`:
   - Public repo: URL only is enough.
   - Private repo: fill credentials:
     - Username: your GitHub username (or `x-access-token`)
     - Password: GitHub Personal Access Token with repo read access
3. Create the project after connection succeeds.

## 2) Add CI/CD Variables in GitLab

Go to:

- `Project -> Settings -> CI/CD -> Variables`

Required variables:

- `CLOUDFLARE_API_TOKEN` (Masked + Protected)
- `CLOUDFLARE_ACCOUNT_ID` (Masked + Protected)

Optional variables:

- `R2_BUCKET` (default: `realitystorage`)
- `CDN_URL` (default: `https://cdn.reality.catlabdesign.space`)
- `ENABLE_FLATPAK_RELEASE` (`true` to also build/upload `.flatpak`)
- `DEPLOY_ON_MAIN` (`true` to auto-deploy on every push to `main`)
- `RELEASE_VERSION` (force version for manual deploy run)
- `CHANGELOG` (used in `latest.json` for manual deploy run)

Important:

- If variables are `Protected`, deploy from protected tags/branches only.
- Recommended: protect tags with pattern `v*`.

## 3) Trigger Auto Deploy

Default behavior:

- Build runs on `main`, tags, and manual web pipelines.
- Deploy runs automatically on tags that start with `v` (example: `v2.2.1`).

Release by tag:

```bash
git tag v2.2.1
git push origin v2.2.1
```

Main branch auto deploy (optional):

- Set `DEPLOY_ON_MAIN=true` in CI variables.

## 4) Manual Deploy in GitLab UI

1. Open `Build -> Pipelines -> Run pipeline`
2. Branch: `main`
3. Set variables if needed:
   - `RELEASE_VERSION=2.2.1`
   - `CHANGELOG=...`
4. Run pipeline

## 5) Verify Deploy

After deploy job success, check:

- `https://cdn.reality.catlabdesign.space/client/latest-linux.yml`
- `https://cdn.reality.catlabdesign.space/client/latest.json`
- `https://cdn.reality.catlabdesign.space/client/<version>/`

## Notes for Windows/macOS

GitLab shared runners are usually Linux only.
If you want Windows/macOS artifacts in GitLab CI:

- register self-hosted Windows/macOS runners
- add dedicated jobs with matching runner tags
