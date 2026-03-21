# Release Automation: Flatpak + Microsoft Store (MSIX)

This project supports:
- GitHub Release assets (including `.flatpak`, `.flatpakref`, and `.msix/.msixupload`)
- Microsoft Store publish via `msstore` CLI (MSIX flow)

Workflow file:
- `.github/workflows/build.yml`

## Quick Checklist (What You Need)

You must collect these 5 values for Store publish:
- `MS_STORE_SELLER_ID`
- `MS_STORE_PRODUCT_ID`
- `MS_STORE_TENANT_ID`
- `MS_STORE_CLIENT_ID`
- `MS_STORE_CLIENT_SECRET`

You also need these GitHub repo variables:
- `ENABLE_MS_STORE_RELEASE=true`
- `ENABLE_FLATPAK_RELEASE=true` (if you want Flatpak too)

Optional repo variables:
- `MS_STORE_MSIX_ARCH` (default: `x64`)
- `MS_STORE_NO_COMMIT` (default: `false`)

## Step-by-Step: Microsoft Store Setup (Get All IDs/Secrets)

## Step 1: Create/Reserve App in Partner Center

1. Sign in to Partner Center with an account that can manage your app submissions.
2. Create or open your app (the same app you want CI to update).
3. Do at least 1 manual submission first (required before API/CLI update flows are reliable).

## Step 2: Associate Microsoft Entra Tenant (If Not Already)

1. Go to Partner Center settings/account settings.
2. Open tenant management.
3. Associate your Microsoft Entra tenant.
4. Use an account with tenant global admin permissions if prompted.

## Step 3: Add/Create Microsoft Entra Application in Partner Center

1. In Partner Center, go to user management.
2. Open Microsoft Entra applications tab.
3. Choose either:
   - add existing Entra app, or
   - create new Entra app.
4. Assign permissions/role that can manage submissions (Manager role is the safe default).

## Step 4: Get `MS_STORE_TENANT_ID` and `MS_STORE_CLIENT_ID`

1. In that Microsoft Entra application detail page (inside Partner Center), copy:
   - Tenant ID -> `MS_STORE_TENANT_ID`
   - Client ID -> `MS_STORE_CLIENT_ID`

## Step 5: Create/Get `MS_STORE_CLIENT_SECRET`

1. In the same Entra application detail page, create a new key/secret.
2. Copy it immediately (you usually cannot view it again later).
3. Save as `MS_STORE_CLIENT_SECRET`.

## Step 6: Get `MS_STORE_SELLER_ID`

Use Partner Center account settings:
1. Open account settings.
2. Open organization/legal info section.
3. Copy Seller ID and save as `MS_STORE_SELLER_ID`.

## Step 7: Get `MS_STORE_PRODUCT_ID`

Use your target app page in Partner Center:
1. Open the app overview/identity page.
2. Copy the Store product ID / Partner Center ID for that app.
3. Save as `MS_STORE_PRODUCT_ID`.

Tip:
- If unsure, after configuring `msstore` locally, run `msstore apps list` and confirm the product ID.

## Step-by-Step: Put Values in GitHub

In GitHub repo -> `Settings` -> `Secrets and variables` -> `Actions`:

1. Add secrets:
   - `MS_STORE_SELLER_ID`
   - `MS_STORE_PRODUCT_ID`
   - `MS_STORE_TENANT_ID`
   - `MS_STORE_CLIENT_ID`
   - `MS_STORE_CLIENT_SECRET`
2. Add variables:
   - `ENABLE_MS_STORE_RELEASE=true`
   - `MS_STORE_MSIX_ARCH=x64` (optional)
   - `MS_STORE_NO_COMMIT=false` (optional)
   - `ENABLE_FLATPAK_RELEASE=true` (optional)

## How CI Publish Works

When release workflow runs:
1. Windows build creates normal installer + MSIX (`release-build/store-msix/`).
2. MSIX is uploaded as artifact and attached to GitHub Release.
3. MSIX is uploaded to R2.
4. `microsoft-store` job:
   - configures `msstore` credentials from secrets
   - finds `.msix` / `.msixupload` artifact
   - runs `msstore publish ... -id <productId>`
   - polls submission status (unless `MS_STORE_NO_COMMIT=true`)

## Safe First Run (Recommended)

For first CI test:
1. Set `MS_STORE_NO_COMMIT=true`
2. Run release once
3. Verify draft submission appears in Partner Center
4. Set back to `MS_STORE_NO_COMMIT=false` for real publish

## Local Bootstrap (If MSIX Packaging Fails in CI)

If workflow cannot package MSIX because project metadata is missing:
1. Install Microsoft Store CLI locally.
   ```powershell
   $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
   Invoke-WebRequest -Uri "https://github.com/microsoft/msstore-cli/releases/latest/download/MSStoreCLI-win-$arch.zip" -OutFile "$env:TEMP\MSStoreCLI.zip"
   Expand-Archive "$env:TEMP\MSStoreCLI.zip" "$env:USERPROFILE\msstorecli" -Force
   $env:PATH="$env:USERPROFILE\msstorecli;$env:PATH"
   msstore --version
   ```
2. Run:
   ```bash
   msstore init "E:\\mlauncher\\ml-client"
   ```
3. Commit generated config files.
4. Re-run CI.

Optional local `.env.local`:
```env
MSSTORE_BIN=C:\Users\<you>\msstorecli\msstore.exe
MS_STORE_PRODUCT_ID=<your-product-id>
MS_STORE_MSIX_ARCH=x64
MS_STORE_TENANT_ID=<tenant-id>
MS_STORE_SELLER_ID=<seller-id>
MS_STORE_CLIENT_ID=<client-id>
MS_STORE_CLIENT_SECRET=<client-secret>
```

When all 4 credential vars are present, `bun run dist:store` will run
`msstore reconfigure` automatically before `msstore package`.

## Trigger Release

Recommended:
```bash
git tag v2.1.1
git push origin v2.1.1
```

Or run `workflow_dispatch`.

## Step-by-Step: Flatpak Setup

Flatpak flow in this repo uses a bundle artifact (`.flatpak`) plus a hosted Flatpak repo and `.flatpakref`, not direct Flathub publish.

## Step 1: Enable Flatpak in GitHub

In GitHub repo -> `Settings` -> `Secrets and variables` -> `Actions` -> `Variables`:
1. Add or update `ENABLE_FLATPAK_RELEASE=true`

No extra Flatpak secrets are required for this workflow.

## Step 2: Trigger Release

Run the same release flow:
```bash
git tag v2.1.1
git push origin v2.1.1
```

When enabled, Linux job will:
1. install `flatpak` and `flatpak-builder`
2. run Electron Builder Flatpak target
3. import the bundle into a hosted Flatpak repo and generate `.flatpakref`
4. upload `.flatpak` and `.flatpakref` as artifacts
5. attach `.flatpak` and `.flatpakref` to GitHub Release
6. upload `.flatpak`, `.flatpakref`, and the Flatpak repo to R2/CDN

## Step 3: Validate Flatpak Artifact

After workflow completes, verify:
1. GitHub Actions artifact `reality-launcher-linux` contains `.flatpak` and `.flatpakref`
2. GitHub Release assets include `.flatpak` and `.flatpakref`
3. CDN path exists: `https://cdn.reality.catlabdesign.space/client/<version>/<file>.flatpak`
4. CDN path exists: `https://cdn.reality.catlabdesign.space/client/<version>/<file>.flatpakref`
5. CDN Flatpak repo exists under `https://cdn.reality.catlabdesign.space/client/flatpak-repo/`
6. `latest.json` includes `downloads.flatpak` and `downloads.flatpakref` for that release (when generated)

## Step 4: Install/Test Flatpak Locally

On a Linux machine with Flatpak installed:
```bash
flatpak install --user --from ./Reality\ Launcher.flatpakref
flatpak run net.catlab.reality_launcher
```

Or install the bundle directly:
```bash
flatpak install --user ./Reality-Launcher-<version>.flatpak
flatpak run net.catlab.reality_launcher
```

If app ID differs in your generated bundle, use:
```bash
flatpak list | grep -i reality
```
then run with the listed app ID.

## Step 5: Flathub (If Needed)

This workflow does not auto-publish to Flathub.

If you want Flathub listing:
1. create and maintain Flathub manifest/repo metadata
2. submit updates via Flathub pull request process
3. keep this CI workflow for build + release artifacts only
