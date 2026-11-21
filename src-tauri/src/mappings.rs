//! Runtime name resolution for the agent's tab-list hook.
//!
//! The agent hooks `PlayerTabOverlay#getNameForDisplay` and calls three more members.
//! Their runtime names depend on the loader: obfuscated (vanilla), intermediary
//! (Fabric/Quilt), official Mojang names, or official classes + SRG members (Forge
//! 1.19–1.20.x, NeoForge 1.20.1). Forge/NeoForge get both an "official" and an "srg"
//! scheme; the agent picks the one whose classes exist at runtime.

use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha1::Digest;

use crate::instances::LoaderType;

const OVERLAY: &str = "net.minecraft.client.gui.components.PlayerTabOverlay";
const PLAYER_INFO: &str = "net.minecraft.client.multiplayer.PlayerInfo";
const COMPONENT: &str = "net.minecraft.network.chat.Component";
const MUTABLE: &str = "net.minecraft.network.chat.MutableComponent";
const GAME_PROFILE_DESC: &str = "Lcom/mojang/authlib/GameProfile;";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabScheme {
    pub name: String,
    pub overlay_class: String,
    pub overlay_method: String,
    pub overlay_desc: String,
    pub player_info_class: String,
    pub get_profile: String,
    pub component_class: String,
    pub literal: String,
    pub literal_desc: String,
    pub mutable_class: String,
    pub append: String,
    pub append_desc: String,
}

/// The eight runtime names of one namespace; class names are JVM internal names.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct TabNames {
    pub overlay_class: String,
    pub player_info_class: String,
    pub component_class: String,
    pub mutable_class: String,
    pub overlay_method: String,
    pub get_profile: String,
    pub literal: String,
    pub append: String,
}

impl TabNames {
    pub fn official() -> Self {
        Self {
            overlay_class: internal(OVERLAY),
            player_info_class: internal(PLAYER_INFO),
            component_class: internal(COMPONENT),
            mutable_class: internal(MUTABLE),
            overlay_method: "getNameForDisplay".into(),
            get_profile: "getProfile".into(),
            literal: "literal".into(),
            append: "append".into(),
        }
    }

    fn overlay_desc(&self) -> String {
        format!("(L{};)L{};", self.player_info_class, self.component_class)
    }

    fn get_profile_desc(&self) -> String {
        format!("(){GAME_PROFILE_DESC}")
    }

    fn literal_desc(&self) -> String {
        format!("(Ljava/lang/String;)L{};", self.mutable_class)
    }

    fn append_desc(&self) -> String {
        format!("(L{};)L{};", self.component_class, self.mutable_class)
    }
}

fn internal(dotted: &str) -> String {
    dotted.replace('.', "/")
}

pub fn build_scheme(name: &str, n: &TabNames) -> TabScheme {
    TabScheme {
        name: name.into(),
        overlay_class: n.overlay_class.clone(),
        overlay_method: n.overlay_method.clone(),
        overlay_desc: n.overlay_desc(),
        player_info_class: n.player_info_class.clone(),
        get_profile: n.get_profile.clone(),
        component_class: n.component_class.clone(),
        literal: n.literal.clone(),
        literal_desc: n.literal_desc(),
        mutable_class: n.mutable_class.clone(),
        append: n.append.clone(),
        append_desc: n.append_desc(),
    }
}

/// Splits a Mojang member line (`    [a:b:]ret name(args)[:c:d] -> obf`) into
/// (`ret name(args)`, `obf`). Fields come back too; callers match full signatures.
fn mojang_member(line: &str) -> Option<(&str, &str)> {
    let (left, obf) = line.trim_start().split_once(" -> ")?;
    let close = left.rfind(')').map(|i| i + 1).unwrap_or(left.len());
    let left = &left[..close];
    let sig = match left.split_once(':') {
        Some((a, rest)) if a.bytes().all(|b| b.is_ascii_digit()) => {
            rest.split_once(':').map(|(_, sig)| sig).unwrap_or(rest)
        }
        _ => left,
    };
    Some((sig, obf.trim()))
}

/// Streams a Mojang `client_mappings` file (official → obf) and returns the
/// obfuscated names, or `None` if any of the eight is missing.
pub fn parse_mojang<R: BufRead>(reader: R) -> std::io::Result<Option<TabNames>> {
    let overlay_sig = format!("{COMPONENT} getNameForDisplay({PLAYER_INFO})");
    let profile_sig = "com.mojang.authlib.GameProfile getProfile()";
    let literal_sig = format!("{MUTABLE} literal(java.lang.String)");
    let append_sig = format!("{MUTABLE} append({COMPONENT})");

    let mut names: [Option<String>; 8] = Default::default();
    let mut current: Option<usize> = None;

    for line in reader.lines() {
        let line = line?;
        if line.starts_with('#') || line.is_empty() {
            continue;
        }
        if !line.starts_with(' ') {
            current = None;
            let Some((official, obf)) = line.split_once(" -> ") else {
                continue;
            };
            let idx = match official {
                OVERLAY => 0,
                PLAYER_INFO => 1,
                COMPONENT => 2,
                MUTABLE => 3,
                _ => continue,
            };
            names[idx] = Some(obf.trim_end_matches(':').trim().replace('.', "/"));
            current = Some(idx);
            continue;
        }
        let Some(class) = current else { continue };
        let Some((sig, obf)) = mojang_member(&line) else {
            continue;
        };
        let slot = match class {
            0 if sig == overlay_sig => 4,
            1 if sig == profile_sig => 5,
            2 if sig == literal_sig => 6,
            3 if sig == append_sig => 7,
            _ => continue,
        };
        names[slot].get_or_insert_with(|| obf.to_string());
    }

    Ok(collect(names))
}

fn collect(names: [Option<String>; 8]) -> Option<TabNames> {
    let [a, b, c, d, e, f, g, h] = names;
    Some(TabNames {
        overlay_class: a?,
        player_info_class: b?,
        component_class: c?,
        mutable_class: d?,
        overlay_method: e?,
        get_profile: f?,
        literal: g?,
        append: h?,
    })
}

/// Class index (0..4) and expected (obf name, obf desc) per member slot (4..8).
fn obf_targets(obf: &TabNames) -> [(String, String, String); 4] {
    [
        (
            obf.overlay_class.clone(),
            obf.overlay_method.clone(),
            obf.overlay_desc(),
        ),
        (
            obf.player_info_class.clone(),
            obf.get_profile.clone(),
            obf.get_profile_desc(),
        ),
        (
            obf.component_class.clone(),
            obf.literal.clone(),
            obf.literal_desc(),
        ),
        (
            obf.mutable_class.clone(),
            obf.append.clone(),
            obf.append_desc(),
        ),
    ]
}

/// Streams a tiny v2 file and maps the obfuscated names to the `target` namespace
/// (e.g. "intermediary").
pub fn parse_tiny_v2<R: BufRead>(
    reader: R,
    obf: &TabNames,
    target: &str,
) -> std::io::Result<Option<TabNames>> {
    let mut lines = reader.lines();
    let Some(header) = lines.next().transpose()? else {
        return Ok(None);
    };
    let cols: Vec<&str> = header.split('\t').collect();
    if cols.len() < 5 || cols[0] != "tiny" || cols[1] != "2" {
        return Ok(None);
    }
    let namespaces = &cols[3..];
    let (Some(src), Some(dst)) = (
        namespaces.iter().position(|n| *n == "official"),
        namespaces.iter().position(|n| *n == target),
    ) else {
        return Ok(None);
    };
    // Method descriptors are written in the first namespace, which must be obf.
    if src != 0 {
        return Ok(None);
    }

    let targets = obf_targets(obf);
    let mut names: [Option<String>; 8] = Default::default();
    let mut current: Option<usize> = None;

    for line in lines {
        let line = line?;
        if let Some(rest) = line.strip_prefix("c\t") {
            let parts: Vec<&str> = rest.split('\t').collect();
            current = parts
                .get(src)
                .and_then(|o| targets.iter().position(|(class, _, _)| class == o));
            if let (Some(idx), Some(n)) = (current, parts.get(dst)) {
                names[idx] = Some(n.to_string());
            }
            continue;
        }
        let Some(idx) = current else { continue };
        let Some(rest) = line.strip_prefix("\tm\t") else {
            continue;
        };
        let parts: Vec<&str> = rest.split('\t').collect();
        let (_, name, desc) = &targets[idx];
        if parts.first() == Some(&desc.as_str()) && parts.get(1) == Some(&name.as_str()) {
            if let Some(n) = parts.get(1 + dst) {
                names[4 + idx].get_or_insert_with(|| n.to_string());
            }
        }
    }

    Ok(collect(names))
}

/// Streams a tsrg2 file (`tsrg2 obf srg id`) and returns the SRG member names for
/// the four obfuscated members as (overlay_method, get_profile, literal, append).
pub fn parse_tsrg2<R: BufRead>(reader: R, obf: &TabNames) -> std::io::Result<Option<[String; 4]>> {
    let mut lines = reader.lines();
    let Some(header) = lines.next().transpose()? else {
        return Ok(None);
    };
    let cols: Vec<&str> = header.split(' ').collect();
    if cols.first() != Some(&"tsrg2") {
        return Ok(None);
    }
    let Some(dst) = cols[1..].iter().position(|n| *n == "srg") else {
        return Ok(None);
    };
    if dst == 0 {
        return Ok(None);
    }

    let targets = obf_targets(obf);
    let mut members: [Option<String>; 4] = Default::default();
    let mut current: Option<usize> = None;

    for line in lines {
        let line = line?;
        if !line.starts_with('\t') {
            current = line
                .split(' ')
                .next()
                .and_then(|o| targets.iter().position(|(class, _, _)| class == o));
            continue;
        }
        let Some(idx) = current else { continue };
        if line.starts_with("\t\t") {
            continue;
        }
        let parts: Vec<&str> = line[1..].split(' ').collect();
        // Method lines: obfName obfDesc name1 name2...
        if parts.len() < 3 || !parts[1].starts_with('(') {
            continue;
        }
        let (_, name, desc) = &targets[idx];
        if parts[0] == name && parts[1] == desc {
            if let Some(n) = parts.get(1 + dst) {
                members[idx].get_or_insert_with(|| n.to_string());
            }
        }
    }

    let [a, b, c, d] = members;
    Ok((|| Some([a?, b?, c?, d?]))())
}

pub fn srg_names(members: [String; 4]) -> TabNames {
    let [overlay_method, get_profile, literal, append] = members;
    TabNames {
        overlay_method,
        get_profile,
        literal,
        append,
        ..TabNames::official()
    }
}

/// 1.19 through 1.21.x release versions.
pub fn is_supported_version(mc: &str) -> bool {
    let parts: Option<Vec<u32>> = mc.split('.').map(|p| p.parse().ok()).collect();
    matches!(parts.as_deref(), Some([1, minor, ..]) if (19..=21).contains(minor))
        && mc.split('.').count() <= 3
}

fn sha1_file(path: &Path) -> std::io::Result<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = sha1::Sha1::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn matches_sha1(path: &Path, sha1: Option<&str>) -> bool {
    path.is_file()
        && match sha1 {
            Some(expected) => sha1_file(path).is_ok_and(|h| h.eq_ignore_ascii_case(expected)),
            None => true,
        }
}

/// Finds `<libraries>/<group>/<artifact>/<mc>-<ts>/<file>` for the given version.
fn find_versioned_lib(dir: &Path, mc: &str, file: impl Fn(&str) -> String) -> Option<PathBuf> {
    let prefix = format!("{mc}-");
    let mut dirs: Vec<String> = std::fs::read_dir(dir)
        .ok()?
        .filter_map(|e| e.ok()?.file_name().into_string().ok())
        .filter(|n| {
            n.strip_prefix(&prefix)
                .is_some_and(|ts| ts.starts_with(|c: char| c.is_ascii_digit()))
        })
        .collect();
    dirs.sort();
    dirs.into_iter()
        .rev()
        .map(|d| dir.join(&d).join(file(&d)))
        .find(|p| p.is_file())
}

pub fn find_mcp_config(libraries_dir: &Path, mc: &str) -> Option<PathBuf> {
    find_versioned_lib(
        &libraries_dir.join("de/oceanlabs/mcp/mcp_config"),
        mc,
        |d| format!("mcp_config-{d}.zip"),
    )
}

fn client_mappings_info(
    minecraft_dir: &Path,
    version_json: &serde_json::Value,
) -> Option<(String, Option<String>)> {
    let read = |v: &serde_json::Value| {
        let m = v.get("downloads")?.get("client_mappings")?;
        Some((
            m.get("url")?.as_str()?.to_string(),
            m.get("sha1").and_then(|s| s.as_str()).map(str::to_string),
        ))
    };
    if let Some(info) = read(version_json) {
        return Some(info);
    }
    let parent = version_json.get("inheritsFrom")?.as_str()?;
    let path = minecraft_dir
        .join("versions")
        .join(parent)
        .join(format!("{parent}.json"));
    let parent_json: serde_json::Value = serde_json::from_slice(&std::fs::read(path).ok()?).ok()?;
    read(&parent_json)
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| format!("mappings task failed: {e}"))?
}

/// Locates (cache, Forge's copy in libraries) or downloads the Mojang mappings and
/// parses the obfuscated names. `Ok(None)` when the version has no client mappings.
async fn mojang_obf_names(
    minecraft_dir: &Path,
    libraries_dir: &Path,
    mc: &str,
    version_json: &serde_json::Value,
) -> Result<Option<TabNames>, String> {
    let info = client_mappings_info(minecraft_dir, version_json);
    let sha1 = info.as_ref().and_then(|(_, s)| s.clone());
    let cached = minecraft_dir
        .join("mappings")
        .join(mc)
        .join("client_mappings.txt");
    let forge_copy = find_versioned_lib(&libraries_dir.join("net/minecraft/client"), mc, |d| {
        format!("client-{d}-mappings.txt")
    });

    let local = {
        let (cached, sha1) = (cached.clone(), sha1.clone());
        blocking(move || {
            Ok([Some(cached), forge_copy]
                .into_iter()
                .flatten()
                .find(|p| matches_sha1(p, sha1.as_deref())))
        })
        .await?
    };

    let path = match local {
        Some(p) => p,
        None => {
            let Some((url, sha1)) = info else {
                return Ok(None);
            };
            crate::download::download_file(
                &crate::http_client::HTTP_CLIENT,
                &url,
                &cached,
                sha1.as_deref(),
            )
            .await
            .map_err(|e| format!("Mojang mappings download failed: {e}"))?;
            cached
        }
    };

    blocking(move || {
        let file = std::fs::File::open(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        parse_mojang(BufReader::new(file)).map_err(|e| format!("{}: {e}", path.display()))
    })
    .await
}

fn read_zip_entry<T>(
    zip_path: &Path,
    entry: &str,
    f: impl FnOnce(BufReader<zip::read::ZipFile<'_>>) -> std::io::Result<T>,
) -> Result<T, String> {
    let file = std::fs::File::open(zip_path).map_err(|e| format!("{}: {e}", zip_path.display()))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("{}: {e}", zip_path.display()))?;
    let entry = archive
        .by_name(entry)
        .map_err(|e| format!("{}!{entry}: {e}", zip_path.display()))?;
    f(BufReader::new(entry)).map_err(|e| format!("{}: {e}", zip_path.display()))
}

async fn intermediary_names(
    minecraft_dir: &Path,
    mc: &str,
    obf: TabNames,
) -> Result<Option<TabNames>, String> {
    let jar = minecraft_dir
        .join("mappings")
        .join(mc)
        .join("intermediary-v2.jar");
    let parse = {
        let jar = jar.clone();
        move || {
            read_zip_entry(&jar, "mappings/mappings.tiny", |r| {
                parse_tiny_v2(r, &obf, "intermediary")
            })
        }
    };
    let check = jar.clone();
    let usable = blocking(move || {
        Ok(check.is_file() && read_zip_entry(&check, "mappings/mappings.tiny", |_| Ok(())).is_ok())
    })
    .await?;
    if !usable {
        let url = format!(
            "https://maven.fabricmc.net/net/fabricmc/intermediary/{mc}/intermediary-{mc}-v2.jar"
        );
        match crate::download::download_file(&crate::http_client::HTTP_CLIENT, &url, &jar, None)
            .await
        {
            Ok(_) => {}
            Err(e) if e.starts_with("HTTP_STATUS:404") => return Ok(None),
            Err(e) => return Err(format!("Intermediary download failed: {e}")),
        }
    }
    blocking(parse).await
}

/// Resolves runtime names for the tab hook.
///
/// Vanilla → `obf`; Fabric/Quilt → `intermediary`; Forge/NeoForge → `official`, plus
/// `srg` when the MCP config zip is in `libraries_dir`. Mojang mappings and the
/// intermediary jar are cached under `<minecraft_dir>/mappings/<mc>/`.
/// `version_json` may be a loader profile; `inheritsFrom` is followed for
/// `client_mappings`. Returns `Ok(vec![])` for unsupported versions or when names
/// can't be found; `Err` only for I/O / network failures. For Forge/NeoForge a
/// failure resolving `srg` is logged and only `official` is returned.
#[derive(Serialize, Deserialize)]
struct SchemesCache {
    key: String,
    schemes: Vec<TabScheme>,
}

/// What the resolved names depend on. The launcher version is part of it so a
/// release that changes the resolution never reads an older result.
fn schemes_cache_key(
    minecraft_dir: &Path,
    libraries_dir: &Path,
    mc_version: &str,
    loader: &LoaderType,
    version_json: &serde_json::Value,
) -> String {
    let mappings_sha1 = client_mappings_info(minecraft_dir, version_json).and_then(|(_, s)| s);
    let mcp = find_mcp_config(libraries_dir, mc_version).map(|p| {
        let len = std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
        format!("{}:{len}", p.display())
    });
    format!(
        "{}|{mc_version}|{loader:?}|{}|{}",
        env!("CARGO_PKG_VERSION"),
        mappings_sha1.unwrap_or_default(),
        mcp.unwrap_or_default()
    )
}

/// Resolving hashes and parses ~10 MB of mappings for a dozen names that only
/// change with the mapping files, so the result is kept next to them.
pub async fn resolve_tab_schemes(
    minecraft_dir: &Path,
    libraries_dir: &Path,
    mc_version: &str,
    loader: &LoaderType,
    version_json: &serde_json::Value,
) -> Result<Vec<TabScheme>, String> {
    if !is_supported_version(mc_version) {
        return Ok(vec![]);
    }
    let key = schemes_cache_key(minecraft_dir, libraries_dir, mc_version, loader, version_json);
    let cache_path = minecraft_dir
        .join("mappings")
        .join(mc_version)
        .join(format!("tab-schemes-{loader:?}.json").to_lowercase());
    let cached = std::fs::read(&cache_path)
        .ok()
        .and_then(|b| serde_json::from_slice::<SchemesCache>(&b).ok())
        .filter(|c| c.key == key && !c.schemes.is_empty());
    if let Some(cache) = cached {
        return Ok(cache.schemes);
    }

    let schemes =
        resolve_tab_schemes_uncached(minecraft_dir, libraries_dir, mc_version, loader, version_json)
            .await?;
    if !schemes.is_empty() {
        let cache = SchemesCache { key, schemes: schemes.clone() };
        if let (Some(parent), Ok(bytes)) = (cache_path.parent(), serde_json::to_vec(&cache)) {
            let tmp = cache_path.with_extension(format!("{}.tmp", std::process::id()));
            let _ = std::fs::create_dir_all(parent)
                .and_then(|_| std::fs::write(&tmp, bytes))
                .and_then(|_| std::fs::rename(&tmp, &cache_path));
        }
    }
    Ok(schemes)
}

async fn resolve_tab_schemes_uncached(
    minecraft_dir: &Path,
    libraries_dir: &Path,
    mc_version: &str,
    loader: &LoaderType,
    version_json: &serde_json::Value,
) -> Result<Vec<TabScheme>, String> {

    match loader {
        LoaderType::Forge | LoaderType::Neoforge => {
            let mut schemes = vec![build_scheme("official", &TabNames::official())];
            if let Some(zip) = find_mcp_config(libraries_dir, mc_version) {
                let srg = async {
                    let Some(obf) =
                        mojang_obf_names(minecraft_dir, libraries_dir, mc_version, version_json)
                            .await?
                    else {
                        return Ok(None);
                    };
                    blocking(move || {
                        read_zip_entry(&zip, "config/joined.tsrg", |r| parse_tsrg2(r, &obf))
                    })
                    .await
                };
                match srg.await {
                    Ok(Some(members)) => schemes.push(build_scheme("srg", &srg_names(members))),
                    Ok(None) => log::warn!("[Mappings] SRG names not found for {mc_version}"),
                    Err(e) => log::warn!("[Mappings] SRG resolution failed for {mc_version}: {e}"),
                }
            }
            Ok(schemes)
        }
        LoaderType::Vanilla | LoaderType::Fabric | LoaderType::Quilt => {
            let Some(obf) =
                mojang_obf_names(minecraft_dir, libraries_dir, mc_version, version_json).await?
            else {
                return Ok(vec![]);
            };
            if *loader == LoaderType::Vanilla {
                return Ok(vec![build_scheme("obf", &obf)]);
            }
            Ok(intermediary_names(minecraft_dir, mc_version, obf)
                .await?
                .map(|n| vec![build_scheme("intermediary", &n)])
                .unwrap_or_default())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MOJANG: &str = "\
# (c) 2020 Microsoft Corporation.
com.mojang.blaze3d.Blaze3D -> ega:
    10:10:void <init>() -> <init>
net.minecraft.client.gui.components.PlayerTabOverlay -> eqg:
    int MAX_ROWS_PER_COL -> a
    72:75:net.minecraft.network.chat.Component getNameForDisplay(net.minecraft.client.multiplayer.PlayerInfo) -> a
    80:85:net.minecraft.network.chat.Component decorateName(net.minecraft.client.multiplayer.PlayerInfo,net.minecraft.network.chat.MutableComponent) -> a
net.minecraft.client.gui.components.PlayerTabOverlay$HealthState -> eqg$a:
    10:10:net.minecraft.network.chat.Component getNameForDisplay(net.minecraft.client.multiplayer.PlayerInfo) -> zz
net.minecraft.client.multiplayer.PlayerInfo -> ffb:
    com.mojang.authlib.GameProfile profile -> a
    39:39:com.mojang.authlib.GameProfile getProfile() -> a
net.minecraft.network.chat.Component -> sw:
    440:440:net.minecraft.network.chat.MutableComponent literal(java.lang.String) -> b
    1:1:net.minecraft.network.chat.MutableComponent literal(java.lang.String):12:13 -> b
net.minecraft.network.chat.MutableComponent -> tj:
    53:53:net.minecraft.network.chat.MutableComponent append(java.lang.String) -> f
    57:58:net.minecraft.network.chat.MutableComponent append(net.minecraft.network.chat.Component) -> b
net.minecraft.network.chat.MutableComponentX -> zzz:
    1:1:net.minecraft.network.chat.MutableComponent append(net.minecraft.network.chat.Component) -> q
";

    const TINY: &str = "\
tiny\t2\t0\tofficial\tintermediary
c\teqg\tnet/minecraft/class_355
\tf\tI\ta\tfield_1
\tm\t(Lffb;Ltj;)Lsw;\ta\tmethod_wrong
\tm\t(Lffb;)Lsw;\ta\tmethod_1918
\t\tp\t1\t\targ
c\tffb\tnet/minecraft/class_640
\tm\t()Lcom/mojang/authlib/GameProfile;\ta\tmethod_2966
c\tsw\tnet/minecraft/class_2561
\tm\t(Ljava/lang/String;Ljava/lang/String;)Ltj;\tb\tmethod_wrong
\tm\t(Ljava/lang/String;)Ltj;\tb\tmethod_43470
c\ttj\tnet/minecraft/class_5250
\tm\t(Ljava/lang/String;)Ltj;\tf\tmethod_27693
\tm\t(Lsw;)Ltj;\tb\tmethod_10852
";

    const TSRG: &str = "\
tsrg2 obf srg id
eqg net/minecraft/src/C_3479_ 3479
\ta f_169049_ 169049
\ta (Lffb;Ltj;)Lsw; m_94551_ 94551
\ta (Lffb;)Lsw; m_94549_ 94549
\t\t0 o p_94550_ 94550
ffb net/minecraft/src/C_3906_ 3906
\ta ()Lcom/mojang/authlib/GameProfile; m_105312_ 105312
sw net/minecraft/src/C_4996_ 4996
\tb (Ljava/lang/String;)Ltj; m_237113_ 237113
\t\tstatic
\t\t0 o p_237114_ 237114
tj net/minecraft/src/C_5012_ 5012
\tb (Lts;)Ltj; m_6270_ 6270
\tb (Lsw;)Ltj; m_7220_ 7220
";

    fn obf() -> TabNames {
        parse_mojang(MOJANG.as_bytes()).unwrap().unwrap()
    }

    #[test]
    fn mojang_matches_full_signatures() {
        assert_eq!(
            obf(),
            TabNames {
                overlay_class: "eqg".into(),
                player_info_class: "ffb".into(),
                component_class: "sw".into(),
                mutable_class: "tj".into(),
                overlay_method: "a".into(),
                get_profile: "a".into(),
                literal: "b".into(),
                append: "b".into(),
            }
        );
    }

    #[test]
    fn mojang_missing_member_is_none() {
        let trimmed: String = MOJANG
            .lines()
            .filter(|l| !l.contains("getProfile()"))
            .map(|l| format!("{l}\n"))
            .collect();
        assert_eq!(parse_mojang(trimmed.as_bytes()).unwrap(), None);
    }

    #[test]
    fn obf_scheme_descriptors() {
        let s = build_scheme("obf", &obf());
        assert_eq!(s.overlay_desc, "(Lffb;)Lsw;");
        assert_eq!(s.literal_desc, "(Ljava/lang/String;)Ltj;");
        assert_eq!(s.append_desc, "(Lsw;)Ltj;");
    }

    #[test]
    fn tiny_v2_maps_to_intermediary() {
        let n = parse_tiny_v2(TINY.as_bytes(), &obf(), "intermediary")
            .unwrap()
            .unwrap();
        let s = build_scheme("intermediary", &n);
        assert_eq!(s.overlay_class, "net/minecraft/class_355");
        assert_eq!(s.overlay_method, "method_1918");
        assert_eq!(
            s.overlay_desc,
            "(Lnet/minecraft/class_640;)Lnet/minecraft/class_2561;"
        );
        assert_eq!(s.player_info_class, "net/minecraft/class_640");
        assert_eq!(s.get_profile, "method_2966");
        assert_eq!(s.component_class, "net/minecraft/class_2561");
        assert_eq!(s.literal, "method_43470");
        assert_eq!(
            s.literal_desc,
            "(Ljava/lang/String;)Lnet/minecraft/class_5250;"
        );
        assert_eq!(s.mutable_class, "net/minecraft/class_5250");
        assert_eq!(s.append, "method_10852");
        assert_eq!(
            s.append_desc,
            "(Lnet/minecraft/class_2561;)Lnet/minecraft/class_5250;"
        );
    }

    #[test]
    fn tsrg2_maps_to_srg_with_official_classes() {
        let members = parse_tsrg2(TSRG.as_bytes(), &obf()).unwrap().unwrap();
        let s = build_scheme("srg", &srg_names(members));
        assert_eq!(
            s.overlay_class,
            "net/minecraft/client/gui/components/PlayerTabOverlay"
        );
        assert_eq!(s.overlay_method, "m_94549_");
        assert_eq!(
            s.overlay_desc,
            "(Lnet/minecraft/client/multiplayer/PlayerInfo;)Lnet/minecraft/network/chat/Component;"
        );
        assert_eq!(s.get_profile, "m_105312_");
        assert_eq!(s.literal, "m_237113_");
        assert_eq!(s.append, "m_7220_");
        assert_eq!(
            s.append_desc,
            "(Lnet/minecraft/network/chat/Component;)Lnet/minecraft/network/chat/MutableComponent;"
        );
    }

    #[test]
    fn official_scheme() {
        let s = build_scheme("official", &TabNames::official());
        assert_eq!(s.overlay_method, "getNameForDisplay");
        assert_eq!(
            s.literal_desc,
            "(Ljava/lang/String;)Lnet/minecraft/network/chat/MutableComponent;"
        );
    }

    #[test]
    fn supported_versions() {
        for v in ["1.19", "1.19.2", "1.20.1", "1.21", "1.21.11"] {
            assert!(is_supported_version(v), "{v}");
        }
        for v in [
            "1.18.2",
            "1.22",
            "1.21-pre1",
            "24w14a",
            "26.1",
            "1.20.1.1",
            "",
        ] {
            assert!(!is_supported_version(v), "{v}");
        }
    }

    #[test]
    fn mcp_config_dir_does_not_match_longer_version() {
        let dir = std::env::temp_dir().join(format!("rl-mappings-test-{}", std::process::id()));
        let base = dir.join("de/oceanlabs/mcp/mcp_config");
        for d in ["1.20.1-20230612.114412", "1.20-20230608.053357"] {
            std::fs::create_dir_all(base.join(d)).unwrap();
            std::fs::write(base.join(d).join(format!("mcp_config-{d}.zip")), b"").unwrap();
        }
        let found = find_mcp_config(&dir, "1.20").unwrap();
        assert!(found.ends_with("mcp_config-1.20-20230608.053357.zip"));
        assert!(find_mcp_config(&dir, "1.20.2").is_none());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// Resolves against real downloads. Run with
    /// `RL_MAPPINGS_DIR=/some/tmp cargo test --lib mappings -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore]
    async fn real_versions() {
        let dir = PathBuf::from(std::env::var("RL_MAPPINGS_DIR").expect("RL_MAPPINGS_DIR"));
        let real_libs = dirs_home().join(".reality-launcher/libraries");
        let extra: Vec<String> = std::env::var("RL_MAPPINGS_VERSIONS")
            .map(|v| v.split(',').map(str::to_string).collect())
            .unwrap_or_default();
        let manifest: serde_json::Value = crate::http_client::HTTP_CLIENT
            .get("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json")
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let versions = manifest["versions"].as_array().unwrap();
        let mut wanted: Vec<String> = ["1.19", "1.19.2", "1.20.1", "1.20.4", "1.21.1"]
            .map(String::from)
            .to_vec();
        wanted.extend(extra);
        if let Some(newest) = versions
            .iter()
            .filter(|v| v["type"] == "release")
            .map(|v| v["id"].as_str().unwrap())
            .find(|id| id.starts_with("1.21"))
        {
            wanted.push(newest.to_string());
        }
        for mc in wanted {
            let url = versions.iter().find(|v| v["id"] == mc.as_str()).unwrap()["url"]
                .as_str()
                .unwrap();
            let vj: serde_json::Value = crate::http_client::HTTP_CLIENT
                .get(url)
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap();
            let empty_libs = dir.join("no-libs");
            for loader in [LoaderType::Vanilla, LoaderType::Fabric, LoaderType::Forge] {
                let libs = if loader == LoaderType::Forge {
                    &real_libs
                } else {
                    &empty_libs
                };
                let schemes = resolve_tab_schemes(&dir, libs, &mc, &loader, &vj)
                    .await
                    .unwrap();
                for s in &schemes {
                    println!("{mc} {loader:?} {}", serde_json::to_string(s).unwrap());
                }
                if loader != LoaderType::Forge {
                    assert_eq!(schemes.len(), 1, "{mc} {loader:?}");
                }
            }
        }
    }

    fn dirs_home() -> PathBuf {
        PathBuf::from(std::env::var("HOME").unwrap())
    }
}
