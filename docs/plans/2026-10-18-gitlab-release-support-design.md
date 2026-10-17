# GitLab Release Support — Design

Date: 2026-10-18
Status: Draft (awaiting review)

## Background

`realitylauncher-client` moved to GitLab (`gitlab.com/catlab-design/realitylauncher/realitylauncher-client`).
`.gitlab-ci.yml` already builds, uploads installers + `latest.json` to R2, and creates a GitLab Release.

Everything around it still assumes GitHub:

- **Admin Releases page** (`realitylauncher-admin/app/releases/page.tsx`) and its API routes
  (`realitylauncher-api/src/routes/admin.ts`, `/admin/release/github/*`) only talk to GitHub.
- **Webpage** (`realitylauncher-webpage/src/hooks/useLatestVersion.ts`) reads the GitHub
  latest release first. The GitHub repo still exists, so the site shows a stale version.
- **GitHub Releases** no longer receive new builds.

The launcher's self-update does **not** depend on either host: `update.rs` → API
`/launcher/latest` → R2 `client/latest.json`. It needs no change.

## Goals

1. Admin Releases page works with **both** GitHub and GitLab (full parity: latest release
   import, trigger build, list runs, import run artifacts). Provider is chosen by repo URL.
2. Every GitLab release is **mirrored to GitHub Releases** with all files.
3. Webpage shows the real latest version regardless of host.

## Non-goals

- Streaming large artifact ZIPs (Workers 128 MB memory limit). Existing limitation, kept;
  failures must surface a readable error.
- Changing the launcher update mechanism.
- Changing `cluster_update_url` semantics for storage-api.

## Decisions

| Topic | Decision |
|---|---|
| Provider selection | Host of the release repo URL: `github.com` → GitHub, anything else → GitLab (covers self-hosted). |
| Repo URL setting | New `release_repo_url`; falls back to `cluster_update_url` when empty. `cluster_update_url` is also served publicly to storage-api via `/admin/settings/cluster-info`, so it must not be repurposed. |
| GitLab token | New secret setting `gitlab_token`. Recommended: Project Access Token, role Maintainer, scope `api` (pipelines on protected `main` need it). |
| API shape | Replace `/admin/release/github/*` with provider-agnostic `/admin/release/ci/*`. Only consumer is the admin app, deployed together. |
| Webpage source | CDN `latest.json` only. Written by GitLab CI and by the admin "Save" action. |
| GitHub mirror | New `mirror:github` job in `.gitlab-ci.yml`, `allow_failure: true`. |

## 1. API — `realitylauncher-api`

### 1.1 Provider module

New `src/lib/release-providers/`:

- `types.ts` — normalized types and the `ReleaseProvider` interface.
- `github.ts` — current GitHub logic moved out of `admin.ts`.
- `gitlab.ts` — GitLab implementation.
- `index.ts` — `parseRepoUrl(url)` and `resolveProvider(url, tokens)`.

```ts
type ProviderName = "github" | "gitlab";

interface NormalizedRelease {
  version: string;          // tag without leading "v"
  changelog: string;
  releaseDate: string;
  assets: { name: string; url: string; platform: "windows" | "macos" | "linux" }[];
}

interface NormalizedPipeline { id: string; name: string; path: string }

interface NormalizedRun {
  id: string;
  run_number: number;
  name: string;
  status: "queued" | "in_progress" | "completed" | "waiting";
  conclusion: "success" | "failure" | "cancelled" | "skipped" | null;
  event: string;
  created_at: string;
  head_branch: string;
  head_commit?: { message: string };
  web_url: string;
}

interface NormalizedArtifact { id: string; name: string; platform: string | null; size: number }

interface ReleaseProvider {
  name: ProviderName;
  getLatestRelease(): Promise<NormalizedRelease>;
  listPipelines(): Promise<NormalizedPipeline[]>;
  listRuns(pipelineId?: string): Promise<NormalizedRun[]>;
  triggerRelease(pipelineId: string, input: {
    version?: string; changelog?: string; buildWindows?: boolean; buildMacos?: boolean;
  }): Promise<{ web_url?: string }>;
  listArtifacts(runId: string): Promise<NormalizedArtifact[]>;
  downloadArtifact(runId: string, artifactId: string): Promise<ArrayBuffer>;   // ZIP
  authHeadersFor(url: string): Record<string, string>;  // token only when host matches repo host
}
```

The admin page keeps its current field names (`run_number`, `head_branch`, …), so the
GitHub normalization is close to a pass-through.

### 1.2 Repo URL parsing

- GitHub: `https://github.com/<owner>/<repo>[.git][/...]`.
- GitLab: `https://<host>/<group>[/<subgroup>...]/<project>[.git][/-/...]`.
  Strip `.git` and anything from `/-/` on. `apiBase = https://<host>/api/v4/projects/<encodeURIComponent(path)>`.
- Anything else → `400` with an example URL.

### 1.3 GitLab mapping

Auth header: `PRIVATE-TOKEN: <gitlab_token>`.

| Method | GitLab endpoint | Notes |
|---|---|---|
| `getLatestRelease` | `GET /releases/permalink/latest` | Assets from `assets.links[]` (`direct_asset_url` ?? `url`). Platform from extension (same rules as GitHub: `.exe`/`.msi` windows, `.dmg`/`.pkg` macos, `.AppImage`/`.deb`/`.rpm` linux). `404` → `"ยังไม่มี Release ใน repo นี้"`. |
| `listPipelines` | — | Returns one entry: `{ id: "gitlab-ci", name: ".gitlab-ci.yml", path: ".gitlab-ci.yml" }`. |
| `listRuns` | `GET /pipelines?per_page=20` | `iid` → `run_number`, `source` → `event`, `ref` → `head_branch`, `name` → `name` ?? `Pipeline #<iid>`. No commit message (UI already treats it as optional). |
| `triggerRelease` | `GET /` (for `default_branch`) then `POST /pipeline` | `ref` = default branch; variables `PIPELINE_TYPE=release`, `VERSION`, `CHANGELOG`, and `BUILD_WINDOWS`/`BUILD_MACOS` when provided. Returns `web_url`. |
| `listArtifacts` | `GET /pipelines/:id/jobs?per_page=100` | Keep jobs named `build:*` with `artifacts_file`. `id` = job id, platform = suffix after `build:`. |
| `downloadArtifact` | `GET /jobs/:jobId/artifacts` | ZIP; existing unzip-by-extension logic works with nested `artifacts/reality-launcher-*/` paths. |

Status mapping:

| GitLab | `status` | `conclusion` |
|---|---|---|
| `created`, `pending`, `preparing`, `waiting_for_resource`, `scheduled` | `queued` | `null` |
| `running` | `in_progress` | `null` |
| `success` | `completed` | `success` |
| `failed` | `completed` | `failure` |
| `canceled` | `completed` | `cancelled` |
| `skipped` | `completed` | `skipped` |
| `manual` | `waiting` | `null` |

GitHub `triggerRelease` sends `inputs: { version, changelog, build_windows, ... }` to
`workflows/:id/dispatches` on `ref: main`, as today.

### 1.4 Routes

All require admin, as today. Each resolves the provider from settings first.

| Route | Replaces | Body / query |
|---|---|---|
| `GET /admin/release/ci/info` | — (new) | Returns `{ provider, repoUrl, hasToken }` for the UI. |
| `GET /admin/release/ci/latest` | `/github/latest` | — |
| `GET /admin/release/ci/pipelines` | `/github/workflows` | Response key `pipelines`. |
| `POST /admin/release/ci/pipelines/:id/trigger` | `/github/workflows/:id/dispatch` | `{ version?, changelog?, buildWindows?, buildMacos? }` |
| `GET /admin/release/ci/runs` | `/github/runs` | `?pipeline_id=` |
| `GET /admin/release/ci/runs/:runId/artifacts` | `/github/runs/:runId/artifacts` | — |
| `POST /admin/release/ci/import-artifact` | `/github/import-artifact` | `{ runId, artifactId, platform, version }` — **no URL from the client** |
| `POST /admin/release/ci/import` | `/github/import` | `{ version, changelog, assets }`; token attached only when the asset host equals the repo host |
| `PUT /admin/settings/gitlab-token` | — (new) | Mirrors `github-token`. |
| `PUT /admin/settings/release-repo-url` | — (new) | Mirrors `cluster-url`. |

`GET /admin/settings` adds `releaseRepoUrl`, `hasGitlabToken`, `gitlabTokenUpdatedAt`.
`APP_SETTING_KEYS` adds `RELEASE_REPO_URL` and `GITLAB_TOKEN` (key/value table, no migration).

Security fix included: today `import-artifact` forwards the GitHub token to any
`artifactUrl` the browser sends. The server now builds the URL itself.

R2 upload code (`client/releases/<version>/<platform>.<ext>`) is shared by both providers.

### 1.5 Errors

- Missing token → `400 "กรุณาตั้งค่า <GitHub|GitLab> Token ก่อน"`.
- Missing repo URL → `400 "กรุณาตั้งค่า Release Repository URL"`.
- Provider HTTP error → same status, `{ error: "<GitHub|GitLab> API Error: <status> <message>" }`.
- Artifact ZIP without a matching installer → `400`, as today.
- Exceptions (incl. out-of-memory on large ZIPs) → `500 "Import failed: <message>"`.

## 2. Admin — `realitylauncher-admin`

### Settings page (`app/settings/page.tsx`)

- New field **Release Repository URL** (placeholder shows GitHub and GitLab examples), with
  note that empty falls back to Cluster Update URL.
- New card **GitLab Integration** next to GitHub, same secret modal flow (`secretType: "gitlab"`),
  hint: "Project Access Token, role Maintainer, scope api".
- Relabel the cluster URL field to "Cluster Update URL" (it's no longer the release repo).

### Releases page (`app/releases/page.tsx`)

- On load call `/admin/release/ci/info`; store `provider`.
- Swap all `/release/github/*` calls for `/release/ci/*`.
- Labels/icons by provider: `faGithub`/`faGitlab`; "Workflows" ↔ "Pipelines";
  "Release via GitHub" ↔ "Release via GitLab"; confirm dialog text names the provider.
- Trigger button: GitHub keeps the `build.yml` lookup; GitLab uses the single `gitlab-ci` pipeline.
- Runs list shows a link to `web_url`.
- `importArtifacts` sends `{ runId, artifactId, platform, version }`.
- `imported_runs` localStorage key becomes per provider (`imported_runs:<provider>`), since
  run ids collide across hosts.

## 3. Launcher CI — `realitylauncher-client/.gitlab-ci.yml`

New job `mirror:github`:

- `stage: release`, `needs: [prepare, build:linux, build:windows (optional), build:macos (optional), release]`.
- Same rules as `release`, plus `$MIRROR_GITHUB_RELEASE == "true"` and `$GITHUB_TOKEN`.
- `allow_failure: true`, `interruptible: false`, image `node:22-bookworm-slim` + `curl jq`.
- Steps:
  1. `GET /repos/catlab-design/realitylauncher-client/releases/tags/v$VERSION`.
     If missing: check `GET /repos/.../commits/$CI_COMMIT_SHA`; use it as `target_commitish`
     if found, else the default branch with a warning in the log. `POST /releases` with
     `tag_name`, `name: "Reality Launcher v$VERSION"`, `body` = same notes as the GitLab release.
  2. For each file in `artifacts/reality-launcher-*/*` and `latest.json`: delete an existing
     asset of the same name, then upload to `uploads.github.com/.../releases/:id/assets?name=...`.
- GitHub renames spaces to dots in asset names; consumers match by extension, so this is fine.
- Header comment documents the new variables: `GITHUB_TOKEN` (fine-grained PAT, Contents R/W
  on `realitylauncher-client`, masked + protected) and `MIRROR_GITHUB_RELEASE`.
- `release` is changed to write its notes to `release-notes.md` and to expose
  `release-notes.md` and `latest.json` as job artifacts (`expire_in: 7 days`, `latest.json`
  only exists when the R2 step ran). `mirror:github` reads both from there, so the notes text
  lives in one place.

### GitHub Actions on the mirror

`.github/workflows/build.yml` runs on `v*` tags. If GitLab push mirroring to GitHub is
enabled, each tag would also start a GitHub build that creates its own release and races
the mirror job. **Disable Actions on the GitHub repo** (Settings › Actions › Disable) before
enabling push mirroring. This is a manual step, listed in the rollout.

### About link

`src/components/tabs/About.tsx:289` → GitLab project URL.

## 4. Webpage — `realitylauncher-webpage`

`src/hooks/useLatestVersion.ts`:

- Remove `GITHUB_LATEST_RELEASE_URL`, GitHub types, `findAssetUrl`, `normalizeGitHubRelease`,
  `fetchGitHubLatestVersion`.
- `fetchNetworkLatestVersion` calls `fetchCdnLatestVersion` only (dedupe kept).
- Bump `LATEST_VERSION_CACHE_KEY` to `ml_web_latest_version_cache_v4` so cached stale GitHub
  data is dropped.

## 5. Testing

- **API**: use `bun:test` (repo already uses bun; no new dependency), add a `test` script.
  Write unit tests first (TDD) in `src/lib/release-providers/*.test.ts` for:
  - `parseRepoUrl`: github.com, gitlab.com with subgroups, self-hosted, `.git`, `/-/releases`, invalid.
  - GitLab status mapping (every row above).
  - GitLab/GitHub normalization of release, runs, jobs → artifacts, with mocked `fetch`.
  - `triggerRelease` request body (variables, default branch).
  - `authHeadersFor`: token only for same host.
- **Admin / webpage**: `bun run build` (typecheck); manual check of the Releases page against
  both a GitHub and the GitLab repo URL.
- **CI**: validate with GitLab CI Lint; real verification on the next release pipeline
  (or a test version via "Run pipeline" with `PIPELINE_TYPE=release`).

## 6. Rollout

1. Deploy API (new routes) and admin together.
2. In admin Settings: set Release Repository URL to the GitLab project, set GitLab token.
3. On GitHub: disable Actions on `realitylauncher-client`; optionally enable GitLab push mirroring.
4. In GitLab CI/CD variables: add `GITHUB_TOKEN`, `MIRROR_GITHUB_RELEASE=true`.
5. Deploy webpage.

## Repos touched

| Repo | Remote | Change |
|---|---|---|
| `realitylauncher-api` | GitHub | provider module, `/release/ci/*` routes, settings, `bun:test` tests |
| `realitylauncher-admin` | GitHub | Settings + Releases pages |
| `realitylauncher-client` | GitLab | `mirror:github` job, About link, this spec |
| `realitylauncher-webpage` | GitHub | CDN-only latest version |
