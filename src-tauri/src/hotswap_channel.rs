//! Launcher <-> agent channel files for experimental hotswap.
//!
//! Plain JSON files in the session dir (`offer.json`, `apply.json`,
//! `status.json`, `result.json`), all `schema: 1`. Writers use temp + rename so
//! a reader never sees a half-written file; readers ignore unknown fields and
//! treat a missing or invalid file as absent.

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::Path;

use crate::hotswap::Tier;

pub const SCHEMA: u32 = 1;

fn schema_default() -> u32 {
    SCHEMA
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ChangeAction {
    Add,
    Update,
    Remove,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OfferChange {
    pub path: String,
    pub tier: Tier,
    #[serde(default)]
    pub sha256: String,
    pub action: ChangeAction,
}

/// Written by the launcher: a staged pack update the player may apply.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Offer {
    #[serde(default = "schema_default")]
    pub schema: u32,
    pub version: u64,
    /// The pack owner turned hotswap off: the agent drops the pending offer
    /// and refuses any Apply already in flight.
    #[serde(default)]
    pub revoked: bool,
    #[serde(default)]
    pub changes: Vec<OfferChange>,
    /// Staging dir (`<instance>/.reality/staging/<version>/`).
    #[serde(default)]
    pub staging: String,
}

/// Written by the launcher when the player clicks Apply.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Apply {
    #[serde(default = "schema_default")]
    pub schema: u32,
    pub version: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AgentState {
    Idle,
    Ready,
    Applying,
    BusyInWorld,
}

/// Written by the agent.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    #[serde(default = "schema_default")]
    pub schema: u32,
    pub state: AgentState,
    #[serde(default)]
    pub version: Option<u64>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Outcome {
    Applied,
    Restart,
    Failed,
    Healthy,
    Refused,
}

/// Written by the agent after an Apply.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HotswapResult {
    #[serde(default = "schema_default")]
    pub schema: u32,
    pub version: u64,
    pub outcome: Outcome,
    #[serde(default)]
    pub applied: Vec<String>,
    #[serde(default)]
    pub restart: Vec<String>,
    #[serde(default)]
    pub error: Option<String>,
}

/// Write `<dir>/<name>` atomically (temp file + rename).
pub fn write_json<T: Serialize>(dir: &Path, name: &str, v: &T) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let bytes = serde_json::to_vec(v).map_err(|e| e.to_string())?;
    let dest = dir.join(name);
    let tmp = dir.join(format!(".{name}.tmp"));
    let res = (|| -> std::io::Result<()> {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(&bytes)?;
        f.flush()?;
        f.sync_all()?;
        drop(f);
        fs::rename(&tmp, &dest)
    })();
    res.map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}

/// Read `<dir>/<name>`; a missing or invalid file is `None`.
pub fn read_json<T: DeserializeOwned>(dir: &Path, name: &str) -> Option<T> {
    let bytes = fs::read(dir.join(name)).ok()?;
    serde_json::from_slice(&bytes).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(tag: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("rl-hotswap-chan-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn offer() -> Offer {
        Offer {
            schema: 1,
            version: 7,
            revoked: false,
            changes: vec![OfferChange {
                path: "config/a.toml".into(),
                tier: Tier::Zero,
                sha256: "ab".repeat(32),
                action: ChangeAction::Update,
            }],
            staging: "/x/.reality/staging/7".into(),
        }
    }

    #[test]
    fn round_trips() {
        let d = tmpdir("rt");
        let o = offer();
        write_json(&d, "offer.json", &o).unwrap();
        assert_eq!(read_json::<Offer>(&d, "offer.json"), Some(o));

        let a = Apply { schema: 1, version: 7 };
        write_json(&d, "apply.json", &a).unwrap();
        assert_eq!(read_json::<Apply>(&d, "apply.json"), Some(a));

        for state in [AgentState::Idle, AgentState::Ready, AgentState::Applying, AgentState::BusyInWorld] {
            let s = Status { schema: 1, state, version: Some(7) };
            write_json(&d, "status.json", &s).unwrap();
            assert_eq!(read_json::<Status>(&d, "status.json"), Some(s));
        }

        let r = HotswapResult {
            schema: 1,
            version: 7,
            outcome: Outcome::Restart,
            applied: vec!["config/a.toml".into()],
            restart: vec!["mods/b.jar".into()],
            error: Some("boom".into()),
        };
        write_json(&d, "result.json", &r).unwrap();
        assert_eq!(read_json::<HotswapResult>(&d, "result.json"), Some(r));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn wire_format() {
        let v = serde_json::to_value(offer()).unwrap();
        assert_eq!(v["schema"], 1);
        assert_eq!(v["changes"][0]["tier"], 0);
        assert_eq!(v["changes"][0]["action"], "update");
        let s = serde_json::to_value(Status { schema: 1, state: AgentState::BusyInWorld, version: None }).unwrap();
        assert_eq!(s["state"], "busy-in-world");
    }

    #[test]
    fn unknown_fields_ignored() {
        let d = tmpdir("unk");
        fs::write(
            d.join("apply.json"),
            r#"{"schema":1,"version":3,"future":{"x":1}}"#,
        )
        .unwrap();
        assert_eq!(read_json::<Apply>(&d, "apply.json"), Some(Apply { schema: 1, version: 3 }));
        fs::write(d.join("status.json"), r#"{"state":"idle","extra":true}"#).unwrap();
        let s: Status = read_json(&d, "status.json").unwrap();
        assert_eq!(s.state, AgentState::Idle);
        assert_eq!(s.version, None);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn missing_or_invalid_is_none() {
        let d = tmpdir("bad");
        assert_eq!(read_json::<Apply>(&d, "apply.json"), None);
        fs::write(d.join("apply.json"), "{not json").unwrap();
        assert_eq!(read_json::<Apply>(&d, "apply.json"), None);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn half_written_temp_not_read() {
        let d = tmpdir("tmp");
        // A crashed writer left a temp file but never renamed it.
        fs::write(d.join(".offer.json.tmp"), r#"{"schema":1,"vers"#).unwrap();
        fs::write(d.join("offer.json.tmp"), serde_json::to_vec(&offer()).unwrap()).unwrap();
        assert_eq!(read_json::<Offer>(&d, "offer.json"), None);
        // A later write replaces any stale temp and lands the real file.
        write_json(&d, "offer.json", &offer()).unwrap();
        assert_eq!(read_json::<Offer>(&d, "offer.json"), Some(offer()));
        assert!(!d.join(".offer.json.tmp").exists());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn revoked_offer_clears_pending() {
        let d = tmpdir("rev");
        write_json(&d, "offer.json", &offer()).unwrap();
        let revoked = Offer { schema: 1, version: 7, revoked: true, changes: vec![], staging: String::new() };
        write_json(&d, "offer.json", &revoked).unwrap();
        let got: Offer = read_json(&d, "offer.json").unwrap();
        assert!(got.revoked);
        assert!(got.changes.is_empty());
        let _ = fs::remove_dir_all(&d);
    }
}
