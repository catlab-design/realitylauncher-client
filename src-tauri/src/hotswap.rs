//! Experimental mod hotswap: pure launch gate, change tiers and allowlist.
//!
//! Nothing here touches the disk or the network. Hotswap is off by default;
//! an empty tier list from [`enabled_tiers`] means the launch is unchanged.

use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::instances::LoaderType;

/// Phase A only ever offers tier 0. The tier-1 plan flips this to `false`.
const PHASE_A: bool = true;

/// Bundled list of mods that may be added or removed live.
const ALLOWLIST_JSON: &str = include_str!("../resources/hotswap-allowlist.json");

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tier {
    Zero,
    One,
    Two,
    Three,
}

impl Tier {
    pub fn as_u8(self) -> u8 {
        match self {
            Tier::Zero => 0,
            Tier::One => 1,
            Tier::Two => 2,
            Tier::Three => 3,
        }
    }
}

impl Serialize for Tier {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_u8(self.as_u8())
    }
}

impl<'de> Deserialize<'de> for Tier {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        match u8::deserialize(d)? {
            0 => Ok(Tier::Zero),
            1 => Ok(Tier::One),
            2 => Ok(Tier::Two),
            3 => Ok(Tier::Three),
            // Unknown tier from another version: treat as needing a restart.
            _ => Ok(Tier::Three),
        }
    }
}

#[derive(Debug, Clone)]
pub struct GateInput {
    /// `experimental.hotswap` from the pack manifest (missing = false).
    pub manifest_flag: bool,
    /// The player turned hotswap off for this PC.
    pub pc_disabled: bool,
    /// Hotswap is locked off after a crash.
    pub crash_locked: bool,
    pub loader: LoaderType,
    pub mc: String,
    /// Runtime class/method names were resolved for this Minecraft version.
    pub names_resolved: bool,
}

/// True for exactly "1.20.1" and for "1.21" / "1.21.N".
pub fn tier12_version(mc: &str) -> bool {
    if mc == "1.20.1" || mc == "1.21" {
        return true;
    }
    match mc.strip_prefix("1.21.") {
        Some(n) => !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()),
        None => false,
    }
}

/// Tiers hotswap may use for this launch. Empty means launch unchanged.
pub fn enabled_tiers(g: &GateInput) -> Vec<Tier> {
    if !g.manifest_flag || g.pc_disabled || g.crash_locked || !g.names_resolved {
        return vec![];
    }
    if g.loader == LoaderType::Vanilla {
        return vec![];
    }
    let mut tiers = vec![Tier::Zero];
    if !PHASE_A
        && matches!(g.loader, LoaderType::Fabric | LoaderType::Quilt)
        && tier12_version(&g.mc)
    {
        tiers.push(Tier::One);
        tiers.push(Tier::Two);
    }
    tiers
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChangeKind {
    Asset,
    Config,
    ShaderPack,
    ResourcePack,
    ModUpdate,
    ModAdd,
    ModRemove,
    Protected,
    Other,
}

/// Tier a change needs. A kind that its tier is not enabled for falls to Three
/// (restart).
pub fn classify(kind: ChangeKind, enabled: &[Tier], allowlisted: bool) -> Tier {
    let has = |t: Tier| enabled.contains(&t);
    match kind {
        ChangeKind::Asset | ChangeKind::Config | ChangeKind::ShaderPack | ChangeKind::ResourcePack
            if has(Tier::Zero) =>
        {
            Tier::Zero
        }
        ChangeKind::ModUpdate if has(Tier::One) => Tier::One,
        ChangeKind::ModAdd | ChangeKind::ModRemove if allowlisted && has(Tier::Two) => Tier::Two,
        _ => Tier::Three,
    }
}

/// Classify an instance-relative path.
pub fn change_kind(path: &str, prev_present: bool, now_present: bool) -> ChangeKind {
    let norm = path.replace('\\', "/");
    let p = norm.trim_start_matches("./").trim_start_matches('/');
    let lower = p.to_ascii_lowercase();

    if lower.ends_with(".rlmod") || lower.starts_with(".rl-protected/") || lower.contains("/.rl-protected/") {
        return ChangeKind::Protected;
    }
    if lower.starts_with("mods/") && lower.ends_with(".jar") {
        return match (prev_present, now_present) {
            (true, true) => ChangeKind::ModUpdate,
            (false, true) => ChangeKind::ModAdd,
            (true, false) => ChangeKind::ModRemove,
            (false, false) => ChangeKind::Other,
        };
    }
    if lower.starts_with("config/") || lower.starts_with("defaultconfigs/") {
        return ChangeKind::Config;
    }
    if lower.starts_with("resourcepacks/") {
        return ChangeKind::ResourcePack;
    }
    if lower.starts_with("shaderpacks/") {
        return ChangeKind::ShaderPack;
    }
    if lower.starts_with("assets/") || lower.starts_with("kubejs/assets/") {
        return ChangeKind::Asset;
    }
    ChangeKind::Other
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AllowEntry {
    pub mod_id: String,
    pub mc: String,
    #[serde(default)]
    pub addable: bool,
    #[serde(default)]
    pub removable: bool,
    #[serde(default)]
    pub remove_recipe: Option<serde_json::Value>,
}

pub fn parse_allowlist(json: &str) -> Result<Vec<AllowEntry>, String> {
    serde_json::from_str(json).map_err(|e| format!("invalid hotswap allowlist: {e}"))
}

/// The allowlist bundled with the launcher.
pub fn bundled_allowlist() -> Result<Vec<AllowEntry>, String> {
    parse_allowlist(ALLOWLIST_JSON)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gate(loader: LoaderType, mc: &str) -> GateInput {
        GateInput {
            manifest_flag: true,
            pc_disabled: false,
            crash_locked: false,
            loader,
            mc: mc.into(),
            names_resolved: true,
        }
    }

    #[test]
    fn off_when_flag_false() {
        let mut g = gate(LoaderType::Fabric, "1.20.1");
        g.manifest_flag = false;
        assert_eq!(enabled_tiers(&g), vec![]);
    }

    #[test]
    fn off_when_pc_disabled() {
        let mut g = gate(LoaderType::Fabric, "1.20.1");
        g.pc_disabled = true;
        assert_eq!(enabled_tiers(&g), vec![]);
    }

    #[test]
    fn off_when_crash_locked() {
        let mut g = gate(LoaderType::Fabric, "1.20.1");
        g.crash_locked = true;
        assert_eq!(enabled_tiers(&g), vec![]);
    }

    #[test]
    fn off_for_vanilla() {
        assert_eq!(enabled_tiers(&gate(LoaderType::Vanilla, "1.20.1")), vec![]);
    }

    #[test]
    fn fabric_1_20_1_gets_zero_only_in_phase_a() {
        assert_eq!(enabled_tiers(&gate(LoaderType::Fabric, "1.20.1")), vec![Tier::Zero]);
        assert_eq!(enabled_tiers(&gate(LoaderType::Quilt, "1.21.4")), vec![Tier::Zero]);
    }

    #[test]
    fn forge_any_version_zero_when_names_resolved() {
        assert_eq!(enabled_tiers(&gate(LoaderType::Forge, "1.18.2")), vec![Tier::Zero]);
        assert_eq!(enabled_tiers(&gate(LoaderType::Neoforge, "1.21.1")), vec![Tier::Zero]);
        let mut g = gate(LoaderType::Forge, "1.18.2");
        g.names_resolved = false;
        assert_eq!(enabled_tiers(&g), vec![]);
    }

    #[test]
    fn tier12_version_matches() {
        for ok in ["1.20.1", "1.21", "1.21.1", "1.21.11"] {
            assert!(tier12_version(ok), "{ok}");
        }
        for bad in ["1.20", "1.20.2", "1.20.10", "1.2", "1.210", "1.21.", "1.21.x", "1.21.1-pre1", "1.22", "", "1.19.4"] {
            assert!(!tier12_version(bad), "{bad}");
        }
    }

    #[test]
    fn classify_table() {
        let z = [Tier::Zero];
        for k in [ChangeKind::Asset, ChangeKind::Config, ChangeKind::ResourcePack, ChangeKind::ShaderPack] {
            assert_eq!(classify(k, &z, false), Tier::Zero);
            assert_eq!(classify(k, &[], false), Tier::Three);
        }
        for k in [
            ChangeKind::ModUpdate,
            ChangeKind::ModAdd,
            ChangeKind::ModRemove,
            ChangeKind::Protected,
            ChangeKind::Other,
        ] {
            assert_eq!(classify(k, &z, true), Tier::Three);
        }
    }

    #[test]
    fn change_kind_table() {
        use ChangeKind::*;
        assert_eq!(change_kind("mods/a.rlmod", true, true), Protected);
        assert_eq!(change_kind("config/x.rlmod", false, true), Protected);
        assert_eq!(change_kind(".rl-protected/foo.jar", true, true), Protected);
        assert_eq!(change_kind("mods/a.jar", true, true), ModUpdate);
        assert_eq!(change_kind("mods/a.jar", false, true), ModAdd);
        assert_eq!(change_kind("mods/a.jar", true, false), ModRemove);
        assert_eq!(change_kind("config/a/b.toml", true, true), Config);
        assert_eq!(change_kind("defaultconfigs/a.toml", true, true), Config);
        assert_eq!(change_kind("resourcepacks/p.zip", true, true), ResourcePack);
        assert_eq!(change_kind("shaderpacks/s.zip", true, true), ShaderPack);
        assert_eq!(change_kind("assets/mod/lang/en_us.json", true, true), Asset);
        assert_eq!(change_kind("kubejs/assets/m/x.png", true, true), Asset);
        assert_eq!(change_kind("kubejs/server_scripts/a.js", true, true), Other);
        assert_eq!(change_kind("mods/readme.txt", true, true), Other);
        assert_eq!(change_kind("options.txt", true, true), Other);
        assert_eq!(change_kind("mods\\a.jar", false, true), ModAdd);
    }

    #[test]
    fn tier_serializes_as_number() {
        assert_eq!(serde_json::to_string(&[Tier::Zero, Tier::Three]).unwrap(), "[0,3]");
        assert_eq!(serde_json::from_str::<Tier>("2").unwrap(), Tier::Two);
        assert_eq!(serde_json::from_str::<Tier>("7").unwrap(), Tier::Three);
    }

    #[test]
    fn allowlist_parses() {
        assert!(parse_allowlist("[]").unwrap().is_empty());
        assert!(bundled_allowlist().unwrap().is_empty());
        let v = parse_allowlist(
            r#"[{"modId":"foo","mc":"1.20.1","addable":true,"removeRecipe":{"k":1}}]"#,
        )
        .unwrap();
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].mod_id, "foo");
        assert!(v[0].addable && !v[0].removable);
        assert!(v[0].remove_recipe.is_some());
        assert!(parse_allowlist("{").is_err());
    }
}
