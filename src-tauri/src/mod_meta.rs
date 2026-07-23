use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Emitter;

const MODRINTH_API: &str = "https://api.modrinth.com/v2";
const USER_AGENT: &str = "RealityLauncher/2.0 (help@reality.catlabdesign.space)";
const METADATA_CACHE_FILE: &str = "metadata-cache.json";
const CONTENT_LINKS_FILE: &str = ".reality-content-links.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ModMeta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modrinth_icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modrinth_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modrinth_project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub curseforge_project_id: Option<String>,
}

static META_CACHE: Lazy<Mutex<HashMap<String, ModMeta>>> = Lazy::new(|| Mutex::new(load_cache()));
static PENDING: Lazy<Mutex<HashSet<String>>> = Lazy::new(|| Mutex::new(HashSet::new()));

pub fn is_pending(cache_key: &str) -> bool {
    PENDING.lock().unwrap().contains(cache_key)
}

fn cache_path() -> PathBuf {
    crate::config::default_launcher_dir().join(METADATA_CACHE_FILE)
}

fn load_cache() -> HashMap<String, ModMeta> {
    std::fs::read_to_string(cache_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_cache() {
    let json = {
        let cache = META_CACHE.lock().unwrap();
        serde_json::to_string(&*cache).unwrap_or_else(|_| "{}".to_string())
    };
    let path = cache_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(path, json);
}

pub fn cache_key(path: &Path, size: u64, mtime_iso: &str) -> String {
    let p = path.to_string_lossy();
    let clean = p.strip_suffix(".disabled").unwrap_or(&p);
    format!("{clean}|{size}|{mtime_iso}")
}

pub fn mtime_iso(path: &Path) -> String {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .map(|t| {
            chrono::DateTime::<chrono::Utc>::from(t)
                .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
        })
        .unwrap_or_default()
}

pub fn get_cached(key: &str) -> Option<ModMeta> {
    META_CACHE.lock().unwrap().get(key).cloned()
}

pub fn set_cached(key: &str, meta: &ModMeta) {
    META_CACHE.lock().unwrap().insert(key.to_string(), meta.clone());
}

pub fn flush_cache() {
    save_cache();
}

pub fn clear_meta_cache() {
    if let Ok(mut cache) = META_CACHE.lock() {
        cache.clear();
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentLink {
    pub source: String,
    pub project_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_url: Option<String>,
}

pub type ContentLinks = HashMap<String, HashMap<String, ContentLink>>;

pub fn read_content_links(game_dir: &Path) -> ContentLinks {
    std::fs::read_to_string(game_dir.join(CONTENT_LINKS_FILE))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_content_links(game_dir: &Path, links: &ContentLinks) {
    if let Ok(json) = serde_json::to_string_pretty(links) {
        let _ = std::fs::write(game_dir.join(CONTENT_LINKS_FILE), json);
    }
}

pub fn link_for<'a>(
    links: &'a ContentLinks,
    content_type: &str,
    filename: &str,
) -> Option<&'a ContentLink> {
    let by_type = links.get(content_type)?;
    by_type.get(filename).or_else(|| {
        let stripped = filename.strip_suffix(".disabled").unwrap_or(filename);
        by_type.get(stripped)
    })
}

pub fn save_content_link(game_dir: &Path, content_type: &str, filename: &str, link: ContentLink) {
    let mut links = read_content_links(game_dir);
    links
        .entry(content_type.to_string())
        .or_default()
        .insert(filename.to_string(), link);
    write_content_links(game_dir, &links);
}

pub fn delete_content_link(game_dir: &Path, content_type: &str, filename: &str) {
    let mut links = read_content_links(game_dir);
    let Some(by_type) = links.get_mut(content_type) else {
        return;
    };
    let stripped = filename.strip_suffix(".disabled").unwrap_or(filename);
    if by_type.remove(filename).is_none() && by_type.remove(stripped).is_none() {
        return;
    }
    write_content_links(game_dir, &links);
}

pub struct LookupJob {
    pub path: PathBuf,
    pub cache_key: String,
    pub slug: Option<String>,
    pub display_name: Option<String>,
    pub needs_local_meta: bool,
}

pub fn schedule_lookups(app: tauri::AppHandle, instance_id: String, jobs: Vec<LookupJob>) {
    let jobs: Vec<LookupJob> = {
        let mut pending = PENDING.lock().unwrap();
        jobs.into_iter()
            .filter(|j| pending.insert(j.cache_key.clone()))
            .collect()
    };
    if jobs.is_empty() {
        return;
    }
    log::info!(
        "[ModMeta] Scheduling {} lookup jobs for {}",
        jobs.len(),
        instance_id
    );

    tauri::async_runtime::spawn(async move {
        let _resolved_any = run_lookups(&jobs).await;
        {
            let mut pending = PENDING.lock().unwrap();
            for j in &jobs {
                pending.remove(&j.cache_key);
            }
        }
        save_cache();
        crate::content::clear_mod_list_cache();
        let _ = app.emit("mods-icons-updated", &instance_id);
    });
}

fn update_cache(key: &str, f: impl FnOnce(&mut ModMeta)) {
    let mut cache = META_CACHE.lock().unwrap();
    f(cache.entry(key.to_string()).or_default());
}

async fn run_lookups(jobs: &[LookupJob]) -> bool {
    let client = crate::http_client::HTTP_CLIENT.clone();
    let mut resolved: HashSet<String> = HashSet::new();
    log::info!("[ModMeta] Starting lookup for {} jobs", jobs.len());

    let paths: Vec<(String, PathBuf)> = jobs
        .iter()
        .map(|j| (j.cache_key.clone(), j.path.clone()))
        .collect();

    let local_meta_paths: Vec<(String, PathBuf)> = jobs
        .iter()
        .filter(|j| j.needs_local_meta)
        .map(|j| (j.cache_key.clone(), j.path.clone()))
        .collect();

    if !local_meta_paths.is_empty() {
        let local_metas = tauri::async_runtime::spawn_blocking(move || {
            let mut out = Vec::new();
            for (key, path) in local_meta_paths {
                out.push((key, crate::content::read_jar_metadata(&path)));
            }
            out
        })
        .await
        .unwrap_or_default();

        for (key, meta) in local_metas {
            update_cache(&key, |m| {
                if m.display_name.is_none() {
                    m.display_name = meta.name.clone();
                }
                if m.version.is_none() {
                    m.version = meta.version.clone();
                }
                if m.description.is_none() {
                    m.description = meta.description.clone();
                }
                if m.icon.is_none() {
                    m.icon = meta.icon.clone();
                }
            });
        }
    }

    let hashes = tauri::async_runtime::spawn_blocking(move || {
        let mut out: Vec<(String, String)> = Vec::new();
        for (key, path) in paths {
            if let Ok(bytes) = std::fs::read(&path) {
                use sha1::Digest;
                out.push((key, hex::encode(sha1::Sha1::digest(&bytes))));
            }
        }
        out
    })
    .await
    .unwrap_or_default();

    for (key, hash) in &hashes {
        update_cache(key, |m| m.hash = Some(hash.clone()));
    }

    let hash_list: Vec<String> = hashes.iter().map(|(_, h)| h.clone()).collect();
    let hash_to_project = resolve_hashes(&client, &hash_list).await;
    for (key, hash) in &hashes {
        if let Some((project_id, icon)) = hash_to_project.get(hash) {
            log::debug!("[ModMeta] Hash resolved: {} -> {}", key, project_id);
            update_cache(key, |m| {
                m.icon = icon.clone();
                m.modrinth_icon = icon.clone();
                m.modrinth_project_id = Some(project_id.clone());
                m.modrinth_id = Some("found".to_string());
            });
            resolved.insert(key.clone());
        }
    }

    let slug_jobs: Vec<(String, String)> = jobs
        .iter()
        .filter(|j| !resolved.contains(&j.cache_key))
        .filter_map(|j| {
            let latest_slug = META_CACHE
                .lock()
                .unwrap()
                .get(&j.cache_key)
                .and_then(|m| m.id.clone());
            let slug = latest_slug.or_else(|| j.slug.clone());
            slug.map(|s| (j.cache_key.clone(), s))
        })
        .collect();
    if !slug_jobs.is_empty() {
        let slugs: Vec<String> = slug_jobs.iter().map(|(_, s)| s.clone()).collect();
        let by_slug = resolve_slugs(&client, &slugs).await;
        for (key, slug) in &slug_jobs {
            if let Some((project_id, icon)) = by_slug.get(slug) {
                log::debug!("[ModMeta] Slug resolved: {} -> {}", key, project_id);
                update_cache(key, |m| {
                    m.icon = icon.clone();
                    m.modrinth_icon = icon.clone();
                    m.modrinth_project_id = Some(project_id.clone());
                    m.modrinth_id = Some("found".to_string());
                });
                resolved.insert(key.to_string());
            }
        }
    }

    let fuzzy_jobs: Vec<&LookupJob> = jobs
        .iter()
        .filter(|j| !resolved.contains(&j.cache_key))
        .collect();
    for job in fuzzy_jobs {
        let latest_display = META_CACHE
            .lock()
            .unwrap()
            .get(&job.cache_key)
            .and_then(|m| m.display_name.clone());
        let name = latest_display.or_else(|| job.display_name.clone()).or_else(|| {
            job.path
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
        });
        let Some(name) = name else { continue };
        if let Some(hit) = search_by_name(&client, &name).await {
            log::debug!(
                "[ModMeta] Fuzzy resolved: {} -> {:?}",
                job.cache_key, hit.title
            );
            update_cache(&job.cache_key, |m| {
                if hit.icon_url.is_some() {
                    m.icon = hit.icon_url.clone();
                }
                if hit.title.is_some() {
                    m.display_name = hit.title.clone();
                }
                if hit.author.is_some() {
                    m.author = hit.author.clone();
                }
                if hit.description.is_some() {
                    m.description = hit.description.clone();
                }
                m.modrinth_id = Some("found_fuzzy".to_string());
            });
            resolved.insert(job.cache_key.clone());
        }
    }

    for job in jobs.iter().filter(|j| !resolved.contains(&j.cache_key)) {
        log::debug!(
            "[ModMeta] Lookup missed (marked missing): {}",
            job.cache_key
        );
        update_cache(&job.cache_key, |m| {
            m.modrinth_id = Some("checked_missing".to_string())
        });
    }

    !resolved.is_empty()
}

async fn resolve_hashes(
    client: &reqwest::Client,
    hashes: &[String],
) -> HashMap<String, (String, Option<String>)> {
    let mut out = HashMap::new();

    for chunk in hashes.chunks(50) {
        let resp = client
            .post(format!("{MODRINTH_API}/version_files"))
            .header("User-Agent", USER_AGENT)
            .json(&serde_json::json!({ "hashes": chunk, "algorithm": "sha1" }))
            .send()
            .await;
        let Ok(resp) = resp else { continue };
        if !resp.status().is_success() {
            continue;
        }
        let Ok(versions) = resp.json::<HashMap<String, serde_json::Value>>().await else {
            continue;
        };

        let hash_to_project: HashMap<String, String> = versions
            .iter()
            .filter_map(|(hash, v)| {
                v.get("project_id")
                    .and_then(|p| p.as_str())
                    .map(|p| (hash.clone(), p.to_string()))
            })
            .collect();

        let ids: Vec<&String> = hash_to_project
            .values()
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();
        let project_icons = fetch_project_icons(client, &ids).await;

        for (hash, project_id) in hash_to_project {
            let icon = project_icons.get(&project_id).cloned().flatten();
            out.insert(hash, (project_id, icon));
        }
    }

    out
}

async fn resolve_slugs(
    client: &reqwest::Client,
    slugs: &[String],
) -> HashMap<String, (String, Option<String>)> {
    let mut out = HashMap::new();

    for chunk in slugs.chunks(50) {
        let ids_json = serde_json::to_string(chunk).unwrap_or_else(|_| "[]".to_string());
        let resp = client
            .get(format!(
                "{MODRINTH_API}/projects?ids={}",
                urlencoding::encode(&ids_json)
            ))
            .header("User-Agent", USER_AGENT)
            .send()
            .await;
        let Ok(resp) = resp else { continue };
        if !resp.status().is_success() {
            continue;
        }
        let Ok(projects) = resp.json::<Vec<serde_json::Value>>().await else {
            continue;
        };
        for proj in projects {
            let Some(id) = proj.get("id").and_then(|x| x.as_str()) else {
                continue;
            };
            let icon = proj
                .get("icon_url")
                .and_then(|x| x.as_str())
                .map(String::from);
            if let Some(slug) = proj.get("slug").and_then(|x| x.as_str()) {
                out.insert(slug.to_string(), (id.to_string(), icon.clone()));
            }
            out.insert(id.to_string(), (id.to_string(), icon));
        }
    }

    out
}

async fn fetch_project_icons(
    client: &reqwest::Client,
    ids: &[&String],
) -> HashMap<String, Option<String>> {
    let mut out = HashMap::new();
    if ids.is_empty() {
        return out;
    }
    let ids_json = serde_json::to_string(ids).unwrap_or_else(|_| "[]".to_string());
    let resp = client
        .get(format!(
            "{MODRINTH_API}/projects?ids={}",
            urlencoding::encode(&ids_json)
        ))
        .header("User-Agent", USER_AGENT)
        .send()
        .await;
    let Ok(resp) = resp else { return out };
    if !resp.status().is_success() {
        return out;
    }
    if let Ok(projects) = resp.json::<Vec<serde_json::Value>>().await {
        for proj in projects {
            if let Some(id) = proj.get("id").and_then(|x| x.as_str()) {
                let icon = proj
                    .get("icon_url")
                    .and_then(|x| x.as_str())
                    .map(String::from);
                out.insert(id.to_string(), icon);
            }
        }
    }
    out
}

pub struct FuzzyHit {
    pub icon_url: Option<String>,
    pub title: Option<String>,
    pub author: Option<String>,
    pub description: Option<String>,
}

pub fn clean_search_name(name: &str) -> String {
    static BRACKETS: Lazy<regex::Regex> =
        Lazy::new(|| regex::Regex::new(r"[\(\[\{].*?[\)\]\}]").unwrap());
    static VERSIONS: Lazy<regex::Regex> =
        Lazy::new(|| regex::Regex::new(r"v?\d+\.\d+(?:[._-][\w\d]+)*").unwrap());
    static CAMEL: Lazy<regex::Regex> = Lazy::new(|| regex::Regex::new(r"([a-z])([A-Z])").unwrap());
    static SPACES: Lazy<regex::Regex> = Lazy::new(|| regex::Regex::new(r"\s+").unwrap());

    let name = name
        .trim_end_matches(".disabled")
        .trim_end_matches(".jar")
        .trim_end_matches(".zip");
    let name = BRACKETS.replace_all(name, "");
    let name = VERSIONS.replace_all(&name, "");
    let name = CAMEL.replace_all(&name, "$1 $2");
    let name = name.replace(['-', '_'], " ");
    SPACES.replace_all(&name, " ").trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_search_name_removes_brackets() {
        let result = clean_search_name("My Mod [FORGE] {1.20} (fabric)");
        assert_eq!(result, "My Mod");
    }

    #[test]
    fn test_clean_search_name_removes_version() {
        let result = clean_search_name("MyMod v1.20.1");
        // "v1.20.1" stripped by version regex, camelCase "MyMod" → "My Mod"
        assert!(!result.contains("1.20"));
        assert!(!result.contains("v1"));
        assert_eq!(result.trim(), "My Mod");
    }

    #[test]
    fn test_clean_search_name_splits_camelcase() {
        let result = clean_search_name("BetterFps");
        assert_eq!(result, "Better Fps");
    }

    #[test]
    fn test_clean_search_name_replaces_separators() {
        let result = clean_search_name("my-cool_mod");
        assert_eq!(result, "my cool mod");
    }

    #[test]
    fn test_clean_search_name_strips_suffix() {
        assert_eq!(clean_search_name("mod.jar"), "mod");
        assert_eq!(clean_search_name("mod.zip"), "mod");
        assert_eq!(clean_search_name("mod.disabled"), "mod");
    }

    #[test]
    fn test_clean_search_name_handles_disabled_jar() {
        let result = clean_search_name("MyMod-1.20.jar.disabled");
        let clean = result;
        // .disabled then .jar stripped first, then version removed, then camelcase split
        assert!(!clean.contains(".jar"));
        assert!(!clean.contains(".disabled"));
        assert!(!clean.contains("1.20"));
    }

    #[test]
    fn test_clean_search_name_empty_variants() {
        assert_eq!(clean_search_name(""), "");
        assert_eq!(clean_search_name("   "), "");
    }

    #[test]
    fn test_clean_search_name_collapses_whitespace() {
        let result = clean_search_name("a    b");
        assert_eq!(result, "a b");
    }

    #[test]
    fn test_clean_search_name_full_example() {
        let result = clean_search_name("[Fabric] Sodium-0.6.0.jar.disabled");
        let clean = result;
        assert!(!clean.contains("Fabric"));
        assert!(!clean.contains("0.6.0"));
        assert!(!clean.contains(".jar"));
        assert!(!clean.contains(".disabled"));
        assert_eq!(clean, "Sodium");
    }

    #[test]
    fn test_is_pending_absent() {
        assert!(!is_pending("nonexistent-key"));
    }

    #[test]
    fn test_link_for_nonexistent() {
        let links: ContentLinks = std::collections::HashMap::new();
        assert!(link_for(&links, "mods", "nonexistent.jar").is_none());
    }

    #[test]
    fn test_link_for_found() {
        let mut links: ContentLinks = std::collections::HashMap::new();
        let mut type_map = std::collections::HashMap::new();
        type_map.insert(
            "test.jar".into(),
            ContentLink {
                source: "modrinth".into(),
                project_id: "abc".into(),
                version_id: Some("v1".into()),
                icon_url: None,
            },
        );
        links.insert("mods".into(), type_map);
        let result = link_for(&links, "mods", "test.jar");
        assert!(result.is_some());
        assert_eq!(result.unwrap().source, "modrinth");
    }

    #[test]
    fn test_cache_key_format() {
        let key = cache_key(Path::new("/path/to/mod.jar"), 1234, "2026-07-23T12:00:00Z");
        assert_eq!(key, "/path/to/mod.jar|1234|2026-07-23T12:00:00Z");
    }
}

async fn search_by_name(client: &reqwest::Client, name: &str) -> Option<FuzzyHit> {
    let clean = clean_search_name(name);
    if clean.len() < 3 {
        return None;
    }

    let url = format!(
        "{MODRINTH_API}/search?query={}&facets={}&limit=1",
        urlencoding::encode(&clean),
        urlencoding::encode(r#"[["project_type:mod"]]"#)
    );
    let resp = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let data: serde_json::Value = resp.json().await.ok()?;
    let hit = data.get("hits")?.as_array()?.first()?;

    let get = |k: &str| hit.get(k).and_then(|x| x.as_str()).map(String::from);
    let title = get("title");
    let icon_url = get("icon_url");
    if title.is_none() && icon_url.is_none() {
        return None;
    }
    Some(FuzzyHit {
        icon_url,
        title,
        author: get("author"),
        description: get("description"),
    })
}

