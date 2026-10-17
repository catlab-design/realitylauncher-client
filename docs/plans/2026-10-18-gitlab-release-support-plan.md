# GitLab Release Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin release tooling works with GitHub and GitLab, every GitLab release is mirrored to GitHub Releases, and the website reads the version from the CDN.

**Architecture:** A provider module in `realitylauncher-api` (`src/lib/release-providers/`) normalizes GitHub and GitLab behind one `ReleaseProvider` interface. `/admin/release/ci/*` routes pick the provider from the release repo URL. The admin app calls only `/ci/*`. A `mirror:github` job in the launcher's `.gitlab-ci.yml` copies each release to GitHub.

**Tech Stack:** Hono on Cloudflare Workers, drizzle, JSZip, `bun:test` (api) · Next.js + React (admin) · Astro + React (webpage) · GitLab CI with `curl` + `jq` (client).

**Spec:** `realitylauncher-client/docs/plans/2026-10-18-gitlab-release-support-design.md`

## Global Constraints

- Four separate git repos under `/mnt/data3rd/@project/catlab/`. API, admin and webpage are on `main`: create branch `feat/gitlab-release-support` in each before the first commit. The client is already on `ci/gitlab-pipelines`: commit there.
- Provider selection: host `github.com` → `github`, any other host → `gitlab`.
- Setting keys: `RELEASE_REPO_URL: "release_repo_url"` (not secret), `GITLAB_TOKEN: "gitlab_token"` (secret). Release repo URL falls back to `cluster_update_url` when empty. `cluster_update_url` itself is not changed.
- GitLab auth header: `PRIVATE-TOKEN: <token>`. GitHub auth header: `Authorization: token <token>` + `User-Agent: ML-Launcher-API` + `Accept: application/vnd.github.v3+json` (as today).
- Error copy: `กรุณาตั้งค่า GitHub Token ก่อน` / `กรุณาตั้งค่า GitLab Token ก่อน`, `กรุณาตั้งค่า Release Repository URL`, `ยังไม่มี Release ใน repo นี้`, `<GitHub|GitLab> API Error: <status> <message>`, `Import failed: <message>`.
- R2 key format stays `client/releases/<version>/<platform>.<ext>` with public URL `https://files.reality.catlabdesign.space/<key>`.
- Never send a token to a URL whose host the server didn't choose (see `authHeadersFor`).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Client repo rule (`CLAUDE.md` §10): every feature commit updates `docs/CHANGELOG.md` under `[Unreleased]`.

## Review Focus

1. **GitLab URLs in the shapes people paste** (`/-/tree/main`, `/-/releases`, trailing `/`, `.git`, 3-level subgroups, `http://` self-hosted with port) must resolve to the same project path. Tested in Task 1.
2. **A GitLab release link on another host** (e.g. a CDN URL added by hand) must download without the GitLab token attached. Tested in Task 2 (`authHeadersFor`) and used by Task 4's `import` route.
3. **A release with no recognizable installers** (empty `assets.links`, only `latest.json`) should return `assets: []`, not throw. Tested in Tasks 2 and 3.
4. **Changelog with newlines, quotes and Thai text** must reach the pipeline variable `CHANGELOG` byte for byte. Tested in Task 2; the mirror job uses `jq --rawfile` (Task 7).
5. **Re-running `mirror:github`** after a partial upload must replace assets, not fail on "already_exists". GitHub stores `Reality Launcher Setup 4.0.0.exe` as `Reality.Launcher.Setup.4.0.0.exe`, so the existing-asset lookup must compare against the name with spaces turned into dots. Verified in Task 7.

---

## realitylauncher-api

All paths below are relative to `realitylauncher-api/`. Before Task 1, run `bun install` (node_modules is missing; `bun test` currently fails with 9 "Cannot find package" errors) and record `bun test` + `bunx tsc --noEmit` output as the baseline.

### Task 1: Provider types, repo URL parsing, platform detection

**Files:**
- Create: `src/lib/release-providers/types.ts`
- Create: `src/lib/release-providers/repo-url.ts`
- Create: `src/lib/release-providers/platform.ts`
- Test: `src/lib/release-providers/repo-url.test.ts`, `src/lib/release-providers/platform.test.ts`

**Interfaces:**
- Produces (`types.ts`): `ProviderName`, `NormalizedRelease`, `NormalizedPipeline`, `NormalizedRun`, `NormalizedArtifact`, `TriggerInput`, `ReleaseProvider`, exactly as spec §1.1 (`TriggerInput = { version?: string; changelog?: string; buildWindows?: boolean; buildMacos?: boolean }`), plus:
  - `class ProviderError extends Error { constructor(public status: number, message: string) }`
- Produces (`repo-url.ts`): `type RepoRef = { provider: ProviderName; origin: string; path: string }` and `parseRepoUrl(url: string): RepoRef | null`. `origin` = `protocol//host[:port]`; `path` = `owner/repo` (GitHub) or `group/.../project` (GitLab), no `.git`, nothing from `/-/` on. For GitHub only the first two segments are kept (`/releases/...` dropped).
- Produces (`platform.ts`): `type Platform = "windows" | "macos" | "linux"` and `detectPlatform(fileName: string): Platform | null`: `.exe`/`.msi` → windows, `.dmg`/`.pkg` → macos, `.AppImage`/`.deb`/`.rpm` → linux, case-insensitive, else `null`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("parseRepoUrl", () => {
  it.each([
    ["https://github.com/catlab-design/realitylauncher-client", "github", "https://github.com", "catlab-design/realitylauncher-client"],
    ["https://github.com/catlab-design/realitylauncher-client.git", "github", "https://github.com", "catlab-design/realitylauncher-client"],
    ["https://github.com/catlab-design/realitylauncher-client/releases/latest", "github", "https://github.com", "catlab-design/realitylauncher-client"],
    ["https://gitlab.com/catlab-design/realitylauncher/realitylauncher-client", "gitlab", "https://gitlab.com", "catlab-design/realitylauncher/realitylauncher-client"],
    ["https://gitlab.com/catlab-design/realitylauncher/realitylauncher-client.git", "gitlab", "https://gitlab.com", "catlab-design/realitylauncher/realitylauncher-client"],
    ["https://gitlab.com/catlab-design/realitylauncher/realitylauncher-client/-/releases", "gitlab", "https://gitlab.com", "catlab-design/realitylauncher/realitylauncher-client"],
    ["https://gitlab.com/a/b/c/d/-/tree/main/", "gitlab", "https://gitlab.com", "a/b/c/d"],
    ["http://git.example.lan:8080/team/app/", "gitlab", "http://git.example.lan:8080", "team/app"],
  ])("%s", (url, provider, origin, path) => {
    expect(parseRepoUrl(url)).toEqual({ provider, origin, path });
  });

  it.each(["", "not a url", "https://github.com/only-owner", "https://gitlab.com/solo", "ftp://gitlab.com/a/b"])(
    "rejects %p", (url) => expect(parseRepoUrl(url)).toBeNull(),
  );
});

describe("detectPlatform", () => {
  it.each([
    ["Reality Launcher_4.0.2_x64-setup.exe", "windows"], ["app.MSI", "windows"],
    ["Reality Launcher_4.0.2_aarch64.dmg", "macos"], ["x.pkg", "macos"],
    ["Reality Launcher_4.0.2_amd64.AppImage", "linux"], ["x.deb", "linux"], ["x.rpm", "linux"],
    ["latest.json", null], ["notes.md", null],
  ])("%s → %p", (name, platform) => expect(detectPlatform(name)).toBe(platform));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/release-providers`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `types.ts`, `parseRepoUrl` and `detectPlatform`**

`parseRepoUrl`: parse with `new URL` inside try/catch, only `http:`/`https:`, at least 2 path segments.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/release-providers`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/release-providers
git commit -m "feat(release): add release provider types and repo URL parsing"
```

### Task 2: GitLab provider

**Files:**
- Create: `src/lib/release-providers/gitlab.ts`
- Test: `src/lib/release-providers/gitlab.test.ts`

**Interfaces:**
- Consumes: Task 1 types, `RepoRef`, `detectPlatform`, `ProviderError`.
- Produces: `createGitLabProvider(ref: RepoRef, token: string): ReleaseProvider` and `mapGitLabStatus(status: string): Pick<NormalizedRun, "status" | "conclusion">`.

Endpoints and field mapping are spec §1.3. Base: `${ref.origin}/api/v4/projects/${encodeURIComponent(ref.path)}`. Any non-OK response throws `ProviderError(res.status, "GitLab API Error: <status> <message>")`, where message is the JSON `message`/`error` field or `statusText`. Exception: 404 on `releases/permalink/latest` throws `ProviderError(404, "ยังไม่มี Release ใน repo นี้")`.

Mock `globalThis.fetch` the same way as `src/lib/minecraft-verify.test.ts` (save `realFetch`, restore in `afterEach`), recording each `(url, init)`.

- [ ] **Step 1: Write the failing tests**

```ts
const ref = { provider: "gitlab", origin: "https://gitlab.com", path: "catlab-design/realitylauncher/realitylauncher-client" } as const;
const base = "https://gitlab.com/api/v4/projects/catlab-design%2Frealitylauncher%2Frealitylauncher-client";

it("mapGitLabStatus covers every GitLab status", () => {
  for (const s of ["created", "pending", "preparing", "waiting_for_resource", "scheduled"])
    expect(mapGitLabStatus(s)).toEqual({ status: "queued", conclusion: null });
  expect(mapGitLabStatus("running")).toEqual({ status: "in_progress", conclusion: null });
  expect(mapGitLabStatus("success")).toEqual({ status: "completed", conclusion: "success" });
  expect(mapGitLabStatus("failed")).toEqual({ status: "completed", conclusion: "failure" });
  expect(mapGitLabStatus("canceled")).toEqual({ status: "completed", conclusion: "cancelled" });
  expect(mapGitLabStatus("skipped")).toEqual({ status: "completed", conclusion: "skipped" });
  expect(mapGitLabStatus("manual")).toEqual({ status: "waiting", conclusion: null });
});

it("getLatestRelease normalizes links and sends PRIVATE-TOKEN", async () => {
  // respond to `${base}/releases/permalink/latest` with:
  // { tag_name: "v4.0.3", description: "notes", released_at: "2026-10-18T00:00:00Z",
  //   assets: { links: [
  //     { name: "Reality Launcher_4.0.3_x64-setup.exe", url: "u1", direct_asset_url: "d1" },
  //     { name: "Reality Launcher_4.0.3_amd64.AppImage", url: "u2" },
  //     { name: "latest.json", url: "u3" } ] } }
  const rel = await createGitLabProvider(ref, "glpat-x").getLatestRelease();
  expect(rel).toEqual({
    version: "4.0.3", changelog: "notes", releaseDate: "2026-10-18T00:00:00Z",
    assets: [
      { name: "Reality Launcher_4.0.3_x64-setup.exe", url: "d1", platform: "windows" },
      { name: "Reality Launcher_4.0.3_amd64.AppImage", url: "u2", platform: "linux" },
    ],
  });
  expect(calls[0].headers["PRIVATE-TOKEN"]).toBe("glpat-x");
});

it("getLatestRelease returns assets: [] when there are no links", /* assets: { links: [] } */);
it("getLatestRelease 404 → ProviderError(404, 'ยังไม่มี Release ใน repo นี้')", /* ... */);
it("non-OK response → ProviderError with 'GitLab API Error: 403 ...'", /* body { message: "403 Forbidden" } */);

it("listPipelines returns the single .gitlab-ci.yml entry without fetching", async () => {
  expect(await createGitLabProvider(ref, "t").listPipelines())
    .toEqual([{ id: "gitlab-ci", name: ".gitlab-ci.yml", path: ".gitlab-ci.yml" }]);
  expect(calls).toHaveLength(0);
});

it("listRuns maps pipelines", async () => {
  // `${base}/pipelines?per_page=20` → [{ id: 991, iid: 42, status: "running", source: "web",
  //   ref: "main", created_at: "2026-10-18T01:00:00Z", web_url: "https://gitlab.com/.../pipelines/991", name: null }]
  expect(await provider.listRuns()).toEqual([{
    id: "991", run_number: 42, name: "Pipeline #42", status: "in_progress", conclusion: null,
    event: "web", created_at: "2026-10-18T01:00:00Z", head_branch: "main",
    web_url: "https://gitlab.com/.../pipelines/991",
  }]);
});

it("triggerRelease posts variables on the default branch", async () => {
  // `${base}` → { default_branch: "main" }; `${base}/pipeline` → { web_url: "W" }
  const changelog = "## แก้บั๊ก\n- fix \"quotes\" & 'apostrophes'";
  const out = await provider.triggerRelease("gitlab-ci", { version: "4.0.3", changelog, buildWindows: true, buildMacos: false });
  expect(out).toEqual({ web_url: "W" });
  expect(calls[1].method).toBe("POST");
  expect(JSON.parse(calls[1].body)).toEqual({
    ref: "main",
    variables: [
      { key: "PIPELINE_TYPE", value: "release" },
      { key: "VERSION", value: "4.0.3" },
      { key: "CHANGELOG", value: changelog },
      { key: "BUILD_WINDOWS", value: "true" },
      { key: "BUILD_MACOS", value: "false" },
    ],
  });
});
it("triggerRelease omits VERSION/CHANGELOG/BUILD_* that were not given", /* only PIPELINE_TYPE */);

it("listArtifacts keeps build:* jobs that have artifacts", async () => {
  // `${base}/pipelines/991/jobs?per_page=100` → [
  //   { id: 1, name: "check", artifacts_file: null },
  //   { id: 2, name: "build:linux", artifacts_file: { size: 123 } },
  //   { id: 3, name: "build:windows", artifacts_file: null },
  //   { id: 4, name: "release", artifacts_file: { size: 9 } } ]
  expect(await provider.listArtifacts("991")).toEqual([{ id: "2", name: "build:linux", platform: "linux", size: 123 }]);
});

it("downloadArtifact fetches the job archive", async () => {
  await provider.downloadArtifact("991", "2");
  expect(calls[0].url).toBe(`${base}/jobs/2/artifacts`);
});

it("authHeadersFor only attaches the token for the repo host", () => {
  expect(provider.authHeadersFor("https://gitlab.com/api/v4/projects/1/packages/generic/x/1/a.exe")).toEqual({ "PRIVATE-TOKEN": "t" });
  expect(provider.authHeadersFor("https://cdn.reality.catlabdesign.space/client/a.exe")).toEqual({});
  expect(provider.authHeadersFor("https://gitlab.com.evil.example/a")).toEqual({});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/release-providers/gitlab.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `createGitLabProvider` and `mapGitLabStatus` in `gitlab.ts`**

`authHeadersFor`: compare `new URL(url).origin === ref.origin` (try/catch → `{}`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/release-providers`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/release-providers/gitlab.ts src/lib/release-providers/gitlab.test.ts
git commit -m "feat(release): add GitLab release provider"
```

### Task 3: GitHub provider

**Files:**
- Create: `src/lib/release-providers/github.ts`
- Test: `src/lib/release-providers/github.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: `createGitHubProvider(ref: RepoRef, token: string): ReleaseProvider`.

Behavior is the current GitHub code in `src/routes/admin.ts:1525-1800`, moved and normalized. `ref.path` is `owner/repo`; base `https://api.github.com/repos/${ref.path}`.

| Method | Request | Mapping |
|---|---|---|
| `getLatestRelease` | `GET /releases/latest` | `tag_name` minus `v`, `body`, `published_at`, `assets[]` → `{ name, url: browser_download_url, platform: detectPlatform(name) }`, drop `null` platforms. 404 → `ProviderError(404, "ยังไม่มี Release ใน repo นี้")`. |
| `listPipelines` | `GET /actions/workflows` | `{ id: String(id), name, path }` |
| `listRuns(pipelineId?)` | `GET /actions/workflows/:id/runs?per_page=10` or `/actions/runs?per_page=10` | GitHub fields pass through (ids as strings), `head_commit.message` when present, `html_url` → `web_url`. |
| `triggerRelease(id, input)` | `POST /actions/workflows/:id/dispatches` with `{ ref: "main", inputs }` | `inputs` keys: `version`, `changelog`, `build_windows`, `build_macos` (booleans as `"true"`/`"false"`), only the ones given. Returns `{}`. |
| `listArtifacts(runId)` | `GET /actions/runs/:runId/artifacts` | `{ id: String(id), name, size: size_in_bytes, platform }`, platform = first of `windows`/`macos`/`linux` contained in the lowercased name, else `null`. |
| `downloadArtifact(_, artifactId)` | `GET /actions/artifacts/:artifactId/zip` | ArrayBuffer |
| `authHeadersFor(url)` | | token headers only when host is `api.github.com`, else `{}` (release asset downloads stay anonymous, as today). |

- [ ] **Step 1: Write the failing tests**

Mirror Task 2's tests for: `getLatestRelease` (normalization + `assets: []` + 404 copy), `listRuns` with and without `pipelineId` (assert the two URLs), `triggerRelease` (assert body `{ ref: "main", inputs: { version: "4.0.3", changelog: "x", build_windows: "true" } }`), `listArtifacts` (`"reality-launcher-windows"` → `"windows"`, `"misc"` → `null`), `downloadArtifact` URL, `authHeadersFor` (`https://api.github.com/x` → token headers, `https://github.com/o/r/releases/download/v1/a.exe` → `{}`), and `GitHub API Error: 401 Bad credentials` on non-OK.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/release-providers/github.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `createGitHubProvider` in `github.ts`**

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/release-providers`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/release-providers/github.ts src/lib/release-providers/github.test.ts
git commit -m "feat(release): add GitHub release provider"
```

### Task 4: Config resolution, ZIP extraction, `/release/ci/*` routes and settings

**Files:**
- Create: `src/lib/release-providers/index.ts`
- Create: `src/lib/release-providers/artifact-zip.ts`
- Modify: `src/db/schema.ts:250-270` (`APP_SETTING_KEYS`)
- Modify: `src/routes/admin.ts`: replace `/release/github/*` routes (`:1524-1960`), add settings routes next to `/settings/github-token` (`:1477`), extend `GET /settings` response (`:1999-2003`)
- Test: `src/lib/release-providers/index.test.ts`, `src/lib/release-providers/artifact-zip.test.ts`

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces (`index.ts`):
  - `type ReleaseSettings = { releaseRepoUrl?: string | null; clusterUpdateUrl?: string | null; githubToken?: string | null; gitlabToken?: string | null }`
  - `resolveReleaseProvider(s: ReleaseSettings): { ok: true; provider: ReleaseProvider; repoUrl: string } | { ok: false; status: 400; error: string; provider?: ProviderName; repoUrl?: string }`
  - `async loadReleaseSettings(db: Database): Promise<ReleaseSettings>` (one `inArray` query over the four keys)
- Produces (`artifact-zip.ts`): `async extractInstaller(zip: ArrayBuffer, platform: Platform): Promise<{ content: ArrayBuffer; ext: string } | null>`, which keeps today's matching rules (windows `.exe`, macos `.dmg`/`.pkg`, linux `.AppImage` then `.deb`), at any depth in the ZIP.
- Produces (HTTP, consumed by Tasks 5-6): routes in spec §1.4 with these responses:
  - `GET /admin/release/ci/info` → `{ provider: ProviderName | null, repoUrl: string | null, hasToken: boolean }`
  - `GET /admin/release/ci/latest` → `NormalizedRelease`
  - `GET /admin/release/ci/pipelines` → `{ pipelines: NormalizedPipeline[] }`
  - `POST /admin/release/ci/pipelines/:id/trigger` body `TriggerInput` → `{ message: "Pipeline triggered successfully", web_url?: string }`
  - `GET /admin/release/ci/runs?pipeline_id=` → `{ runs: NormalizedRun[] }`
  - `GET /admin/release/ci/runs/:runId/artifacts` → `{ artifacts: NormalizedArtifact[] }`
  - `POST /admin/release/ci/import-artifact` body `{ runId: string; artifactId: string; platform: Platform; version: string }` → `{ message: "Imported successfully", url, platform }` (unchanged shape)
  - `POST /admin/release/ci/import` body and response unchanged from `/github/import`
  - `PUT /admin/settings/gitlab-token` body `{ token }`, `PUT /admin/settings/release-repo-url` body `{ url }` (empty string clears it, so the fallback applies again)
  - `GET /admin/settings` adds `releaseRepoUrl`, `hasGitlabToken`, `gitlabTokenUpdatedAt`

- [ ] **Step 1: Write the failing tests**

```ts
describe("resolveReleaseProvider", () => {
  const gl = "https://gitlab.com/catlab-design/realitylauncher/realitylauncher-client";
  const gh = "https://github.com/catlab-design/realitylauncher-client";
  it("prefers releaseRepoUrl", () => {
    const r = resolveReleaseProvider({ releaseRepoUrl: gl, clusterUpdateUrl: gh, gitlabToken: "t" });
    expect(r.ok && r.provider.name).toBe("gitlab");
  });
  it("falls back to clusterUpdateUrl when releaseRepoUrl is empty", () => {
    const r = resolveReleaseProvider({ releaseRepoUrl: "", clusterUpdateUrl: gh, githubToken: "t" });
    expect(r.ok && r.provider.name).toBe("github");
  });
  it("missing URL", () => expect(resolveReleaseProvider({})).toEqual({ ok: false, status: 400, error: "กรุณาตั้งค่า Release Repository URL" }));
  it("missing token names the provider", () => {
    expect(resolveReleaseProvider({ releaseRepoUrl: gl, githubToken: "t" }))
      .toEqual({ ok: false, status: 400, error: "กรุณาตั้งค่า GitLab Token ก่อน", provider: "gitlab", repoUrl: gl });
  });
  it("invalid URL gives an example", () => {
    const r = resolveReleaseProvider({ releaseRepoUrl: "nope" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("https://gitlab.com/group/project");
  });
});

describe("extractInstaller", () => {
  // build ZIPs with JSZip in the test
  it("finds a nested AppImage for linux", /* "artifacts/reality-launcher-linux/R_4.0.3_amd64.AppImage" → ext "AppImage" */);
  it("falls back to .deb for linux", /* only a .deb → ext "deb" */);
  it("returns null when nothing matches", /* only latest.json, platform "windows" → null */);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/release-providers`
Expected: FAIL in `index.test.ts` and `artifact-zip.test.ts`, module not found.

- [ ] **Step 3: Implement `resolveReleaseProvider`, `loadReleaseSettings` and `extractInstaller`**

Invalid URL error: `รูปแบบ Release Repository URL ไม่ถูกต้อง (เช่น https://github.com/owner/repo หรือ https://gitlab.com/group/project)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/release-providers`
Expected: PASS

- [ ] **Step 5: Add setting keys and settings routes**

`APP_SETTING_KEYS.RELEASE_REPO_URL = "release_repo_url"`, `GITLAB_TOKEN = "gitlab_token"`; change the `CLUSTER_UPDATE_URL` comment to `// Storage cluster update source (served to storage-api)`. `PUT /settings/gitlab-token` copies `/settings/github-token` (`isSecret: true`, admin log `{ key, note: "token updated" }`, messages `กรุณาระบุ GitLab Token` / `อัปเดต GitLab Token สำเร็จ`). `PUT /settings/release-repo-url` copies `/settings/cluster-update-url` but accepts `""`, and validates non-empty values with `parseRepoUrl` (400 on `null`).

- [ ] **Step 6: Replace the `/release/github/*` routes with `/release/ci/*`**

Each route: admin check → `resolveReleaseProvider(await loadReleaseSettings(db))` → on `!ok` return `{ error }` with its status. Wrap provider calls: `ProviderError` → `c.json({ error: e.message }, e.status)`, anything else → 500 `{ error: e.message }`. `import-artifact` calls `provider.downloadArtifact(runId, artifactId)` and then `extractInstaller`; it no longer accepts a URL. `import` downloads each asset with `fetch(asset.url, { headers: provider.authHeadersFor(asset.url) })`. Move the `import JSZip` (`:1801`) into `artifact-zip.ts`. Delete the old GitHub routes; keep `POST /release` and `PUT /settings/github-token`.

- [ ] **Step 7: Verify**

Run: `bun test && bunx tsc --noEmit`
Expected: all tests pass; tsc reports no errors beyond the recorded baseline. `grep -n "release/github" src` returns nothing.

- [ ] **Step 8: Commit**

```bash
git add src/db/schema.ts src/routes/admin.ts src/lib/release-providers
git commit -m "feat(release): provider-agnostic /admin/release/ci routes with GitLab support"
```

## realitylauncher-admin

Paths relative to `realitylauncher-admin/`. Check with `bun run lint && bun run build`.

### Task 5: Settings page: release repo URL and GitLab token

**Files:**
- Modify: `app/settings/page.tsx` (type at `:29-32`, `secretType` at `:71`, secret endpoint switch at `:264`, `openSecretModal` at `:421`, GitHub card at `:729-780`, cluster URL block at `:921-975`, secret modal copy at `:1150-1175`)

**Interfaces:**
- Consumes: Task 4's `GET /admin/settings` fields and `PUT /admin/settings/gitlab-token`, `PUT /admin/settings/release-repo-url`.

- [ ] **Step 1: Add `releaseRepoUrl`, `hasGitlabToken`, `gitlabTokenUpdatedAt` to the settings type, and `"gitlab"` to the `secretType` union and `openSecretModal`; route `"gitlab"` to `/admin/settings/gitlab-token`**
- [ ] **Step 2: Add a "GitLab Integration" card after the GitHub card, same layout, `faGitlab` icon, status from `hasGitlabToken`; modal title `ตั้งค่า GitLab Token`, hint `ใส่ GitLab Project Access Token (role: Maintainer, scope: api)`, placeholder `glpat-...`**
- [ ] **Step 3: Add a "Release Repository URL" row (same edit pattern as the cluster URL row) saving through `/admin/settings/release-repo-url`; placeholder `https://gitlab.com/group/project`; helper text `URL ของ repo launcher (GitHub หรือ GitLab) สำหรับดึง Release/Pipeline — ว่างไว้จะใช้ Cluster Update URL`**
- [ ] **Step 4: Relabel the old row to `Cluster Update URL` with helper `URL ที่ storage-api ใช้เช็คอัปเดต`**
- [ ] **Step 5: Verify**

Run: `bun run lint && bun run build`
Expected: both succeed with no new warnings in `app/settings/page.tsx`.

- [ ] **Step 6: Commit**

```bash
git add app/settings/page.tsx
git commit -m "feat(settings): release repository URL and GitLab token"
```

### Task 6: Releases page uses `/release/ci/*`

**Files:**
- Modify: `app/releases/page.tsx` (types `:28-46`, `handleImportFromGitHub` `:229-310`, `loadRuns` `:312`, workflow loading `:333`, `triggerWorkflow` `:354-410`, `importArtifacts` `:412-480`, imported runs storage `:66-69`, `:457-459`, buttons and modal `:685-930`)

**Interfaces:**
- Consumes: Task 4 HTTP routes and shapes (`NormalizedRun`, `NormalizedArtifact`, `/ci/info`).

- [ ] **Step 1: Load `/admin/release/ci/info` on mount into `ciInfo: { provider: "github" | "gitlab" | null; repoUrl: string | null; hasToken: boolean }`; derive `providerLabel` (`GitHub`/`GitLab`), `providerIcon` (`faGithub`/`faGitlab`), `pipelinesLabel` (`Workflows`/`Pipelines`)**
- [ ] **Step 2: Point every fetch at `/release/ci/*` per Task 4; `workflows` response key becomes `pipelines`; trigger posts `{ version, changelog }` to `/pipelines/:id/trigger`; on GitLab, pick the single pipeline instead of searching for `build.yml`; show `web_url` from the trigger response in the success toast when present**
- [ ] **Step 3: Rename `handleImportFromGitHub` → `handleImportFromRelease`; toast and confirm copy use `providerLabel` (e.g. `พบเวอร์ชัน v${version} จาก ${providerLabel}`), and so do the "Release via …" button, its confirm text and the modal title**
- [ ] **Step 4: `importArtifacts` iterates `artifacts.filter(a => a.platform)` and posts `{ runId: run.id, artifactId: a.id, platform: a.platform, version }`; merges `data.url` into `newDownloads[a.platform]`**
- [ ] **Step 5: localStorage key `imported_runs:${provider}` holding string ids; `WorkflowRun.id` stays `string`, drop the `Number(...)` casts**
- [ ] **Step 6: Each run row links to `run.web_url` (opens in a new tab)**
- [ ] **Step 7: Verify**

Run: `bun run lint && bun run build && grep -n "release/github\|archive_download_url" app/releases/page.tsx`
Expected: lint and build succeed; grep prints nothing.

Manual: with the API from Task 4 running locally (`bun run dev` in api, `NEXT_PUBLIC_API_URL` pointed at it), set Release Repository URL to the GitLab project and check that "ดึงจาก Release", the Pipelines modal (run list, statuses, links) and artifact import work. Then switch the URL to the GitHub repo and check the same three.

- [ ] **Step 8: Commit**

```bash
git add app/releases/page.tsx
git commit -m "feat(releases): support GitLab via /release/ci routes"
```

## realitylauncher-client

Paths relative to `realitylauncher-client/`.

### Task 7: Mirror GitLab releases to GitHub

**Files:**
- Modify: `.gitlab-ci.yml` (header comment `:1-10`, `release` job `:213-330`, new job after it)
- Modify: `src/components/tabs/About.tsx:289`
- Modify: `docs/CHANGELOG.md`, `CLAUDE.md` (§9 gotcha 8 mentions the GitHub mirror)

**Interfaces:**
- Consumes: from `release`: `release-notes.md` and `latest.json` (artifacts) and `$RELEASE_VERSION` (as `release` uses today).

- [ ] **Step 1: In `release`, write the notes to `release-notes.md` (build `NOTES` as today, then `printf '%s' "$NOTES" > release-notes.md`), build `release.json` with `--rawfile desc release-notes.md`, and add `artifacts: { paths: [release-notes.md, latest.json], expire_in: 7 days }`**
- [ ] **Step 2: Add the `mirror:github` job**

`stage: release`, `image: node:22-bookworm-slim`, `interruptible: false`, `allow_failure: true`, `needs:` as in spec §3 plus `release`, rules = `release`'s two rules each ANDed with `$MIRROR_GITHUB_RELEASE == "true" && $GITHUB_TOKEN`, variable `GITHUB_REPO: catlab-design/realitylauncher-client`. Script (`set -euo pipefail`, curl with `-H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28"`):

1. `GET releases/tags/v$VERSION`. On 404: `GET commits/$CI_COMMIT_SHA`; if 200, `TARGET=$CI_COMMIT_SHA`, else `TARGET` = the repo's `default_branch` and `echo "⚠ commit not on GitHub; tagging $TARGET"`. `POST releases` with `jq -n --arg tag "v$VERSION" --arg name "Reality Launcher v$VERSION" --arg target "$TARGET" --rawfile body release-notes.md`.
2. Keep `RELEASE_ID` and the `assets` list.
3. For each file in `artifacts/reality-launcher-*/*` and `latest.json`: `GH_NAME=$(basename "$file" | tr ' ' '.')`; delete the asset whose `.name == GH_NAME` if present; upload with `--data-binary @"$file"` and `Content-Type: application/octet-stream` to `https://uploads.github.com/repos/$GITHUB_REPO/releases/$RELEASE_ID/assets?name=$(jq -rn --arg n "$GH_NAME" '$n|@uri')`; `echo "✓ Mirrored $GH_NAME"`.
4. End with `echo "✓ GitHub release: <html_url>"`.

- [ ] **Step 3: Document `GITHUB_TOKEN` (fine-grained PAT, Contents: Read and write on catlab-design/realitylauncher-client, masked + protected) and `MIRROR_GITHUB_RELEASE` ("true" to enable) in the header comment, plus the line `Disable GitHub Actions on the GitHub repo before enabling push mirroring, or v* tags build twice.`**
- [ ] **Step 4: Change the About link to `https://gitlab.com/catlab-design/realitylauncher/realitylauncher-client`**
- [ ] **Step 5: Verify**

Run: `glab ci lint` (or paste the file into GitLab › CI/CD › Pipelines › CI lint when `glab` isn't installed); `bun test`; `bun run check:bridge`
Expected: lint "valid"; tests and typecheck pass.

Extract the `mirror:github` script into a temp file outside the repo and run `bash -n` on it (plus `shellcheck` if available). Expected: no syntax errors. The script skips missing files with `[ -f "$file" ] || continue` (as `release` does), because `latest.json` only exists when the R2 step ran.

- [ ] **Step 6: Update `docs/CHANGELOG.md` under `[Unreleased] — 2026-10-18`: `### Added` "Mirror GitLab releases to GitHub Releases (`mirror:github`, opt-in via `MIRROR_GITHUB_RELEASE`)", `### Changed` "About links to the GitLab project". Update `CLAUDE.md` §9 gotcha 8 to mention the mirror job**
- [ ] **Step 7: Commit**

```bash
git add .gitlab-ci.yml src/components/tabs/About.tsx docs/CHANGELOG.md CLAUDE.md
git commit -m "ci: mirror GitLab releases to GitHub Releases"
```

Real verification happens on the next release pipeline (after the rollout steps in spec §6): GitHub release `v<version>` exists with all installers and `latest.json`, and a retry of the job still succeeds.

## realitylauncher-webpage

### Task 8: Read the latest version from the CDN only

**Files:**
- Modify: `realitylauncher-webpage/src/hooks/useLatestVersion.ts:18-160`

- [ ] **Step 1: Delete `GITHUB_LATEST_RELEASE_URL`, `GitHubReleaseAsset`, `GitHubRelease`, `findAssetUrl`, `normalizeGitHubRelease`, `fetchGitHubLatestVersion`; `fetchNetworkLatestVersion` keeps its in-flight dedupe and calls `fetchCdnLatestVersion()` directly**
- [ ] **Step 2: `LATEST_VERSION_CACHE_KEY = "ml_web_latest_version_cache_v4"`**
- [ ] **Step 3: Verify**

Run: `bun run build && grep -n "github" src/hooks/useLatestVersion.ts`
Expected: build succeeds; grep prints nothing. `bun run dev` and the download section shows the version from `https://cdn.reality.catlabdesign.space/client/latest.json`, with one request in the network tab and none to api.github.com.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useLatestVersion.ts
git commit -m "fix(download): read latest version from CDN latest.json only"
```
