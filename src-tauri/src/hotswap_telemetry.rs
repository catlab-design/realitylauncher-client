//! Telemetry for the experimental hotswap (spec section 9): `hotswap_offer`,
//! `hotswap_applied`, `hotswap_restart_required`, `hotswap_failed` and
//! `hotswap_crash_lock`. Every payload carries the loader, the Minecraft
//! version and the launcher version, and never a file path or token.

use serde_json::{json, Value};

use crate::hotswap_channel::{HotswapResult, Outcome};

/// What the game was running when the event happened.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TelemetryCtx {
    pub loader: String,
    pub mc_version: String,
}

impl TelemetryCtx {
    pub fn new(loader: impl Into<String>, mc_version: impl Into<String>) -> Self {
        TelemetryCtx { loader: loader.into(), mc_version: mc_version.into() }
    }
}

const ERROR_MAX_CHARS: usize = 120;

/// A failure message with anything path-like removed and a hard length cap.
pub fn sanitize_error(raw: &str) -> String {
    let words: Vec<&str> = raw
        .split_whitespace()
        .map(|w| if w.contains('/') || w.contains('\\') || w.contains(':') && w.len() > 2 && w.as_bytes()[1] == b':' { "<path>" } else { w })
        .collect();
    words.join(" ").chars().take(ERROR_MAX_CHARS).collect()
}

/// The common payload plus event-specific fields.
pub fn payload(ctx: &TelemetryCtx, extra: Value) -> Value {
    let mut base = json!({
        "loader": ctx.loader,
        "mcVersion": ctx.mc_version,
        "launcherVersion": env!("CARGO_PKG_VERSION"),
    });
    if let (Some(map), Some(more)) = (base.as_object_mut(), extra.as_object()) {
        for (k, v) in more {
            map.insert(k.clone(), v.clone());
        }
    }
    base
}

/// Events for one `result.json`; `healthy` and `refused` report nothing.
/// Counts only, so no paths leave the machine.
pub fn events_for_result(ctx: &TelemetryCtx, r: &HotswapResult) -> Vec<(&'static str, Value)> {
    let counts = json!({ "version": r.version, "appliedCount": r.applied.len(), "restartCount": r.restart.len() });
    match r.outcome {
        Outcome::Applied => {
            let mut out = vec![("hotswap_applied", payload(ctx, counts.clone()))];
            if !r.restart.is_empty() {
                out.push(("hotswap_restart_required", payload(ctx, merge(&counts, json!({ "reason": "partial" })))));
            }
            out
        }
        Outcome::Restart => {
            vec![("hotswap_restart_required", payload(ctx, merge(&counts, json!({ "reason": "nothing_applied" }))))]
        }
        Outcome::Failed => {
            let error = sanitize_error(r.error.as_deref().unwrap_or("unknown"));
            vec![("hotswap_failed", payload(ctx, merge(&counts, json!({ "error": error }))))]
        }
        Outcome::Healthy | Outcome::Refused | Outcome::Unknown => vec![],
    }
}

fn merge(a: &Value, b: Value) -> Value {
    let mut out = a.clone();
    if let (Some(m), Some(extra)) = (out.as_object_mut(), b.as_object()) {
        for (k, v) in extra {
            m.insert(k.clone(), v.clone());
        }
    }
    out
}

pub fn offer_payload(ctx: &TelemetryCtx, version: u64, live: usize, restart: usize) -> Value {
    payload(ctx, json!({ "version": version, "liveCount": live, "restartCount": restart }))
}

pub fn crash_lock_payload(ctx: &TelemetryCtx, pack_version: u64) -> Value {
    payload(ctx, json!({ "version": pack_version }))
}

pub fn send(event: &str, data: Value) {
    crate::telemetry::queue_event(event, data);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx() -> TelemetryCtx {
        TelemetryCtx::new("fabric", "1.21.1")
    }

    fn result(outcome: Outcome, applied: &[&str], restart: &[&str], error: Option<&str>) -> HotswapResult {
        HotswapResult {
            schema: 1,
            version: 6,
            outcome,
            applied: applied.iter().map(|s| s.to_string()).collect(),
            restart: restart.iter().map(|s| s.to_string()).collect(),
            error: error.map(str::to_string),
        }
    }

    #[test]
    fn every_payload_carries_loader_mc_and_launcher_version() {
        let p = offer_payload(&ctx(), 6, 2, 1);
        assert_eq!(p["loader"], "fabric");
        assert_eq!(p["mcVersion"], "1.21.1");
        assert_eq!(p["launcherVersion"], env!("CARGO_PKG_VERSION"));
        assert_eq!((p["version"].as_u64(), p["liveCount"].as_u64(), p["restartCount"].as_u64()), (Some(6), Some(2), Some(1)));
        assert_eq!(crash_lock_payload(&ctx(), 6)["loader"], "fabric");
    }

    #[test]
    fn applied_result_maps_to_applied_and_partial_restart() {
        let ev = events_for_result(&ctx(), &result(Outcome::Applied, &["config/a.toml"], &["mods/x.jar"], None));
        let names: Vec<_> = ev.iter().map(|(n, _)| *n).collect();
        assert_eq!(names, ["hotswap_applied", "hotswap_restart_required"]);
        assert_eq!(ev[1].1["reason"], "partial");
        let only = events_for_result(&ctx(), &result(Outcome::Applied, &["a"], &[], None));
        assert_eq!(only.len(), 1);
    }

    #[test]
    fn restart_failed_and_silent_outcomes() {
        let r = events_for_result(&ctx(), &result(Outcome::Restart, &[], &["x"], None));
        assert_eq!((r[0].0, r[0].1["reason"].as_str()), ("hotswap_restart_required", Some("nothing_applied")));
        let f = events_for_result(&ctx(), &result(Outcome::Failed, &[], &[], Some("boom")));
        assert_eq!((f[0].0, f[0].1["error"].as_str()), ("hotswap_failed", Some("boom")));
        for o in [Outcome::Healthy, Outcome::Refused, Outcome::Unknown] {
            assert!(events_for_result(&ctx(), &result(o, &["a"], &[], None)).is_empty());
        }
    }

    #[test]
    fn payloads_never_contain_file_paths() {
        let r = result(
            Outcome::Failed,
            &["config/secret-player.toml"],
            &["mods/x.jar"],
            Some("could not read /home/steve/.minecraft/saves/World/level.dat or C:\\Users\\steve\\a.txt"),
        );
        for (_, data) in events_for_result(&ctx(), &r) {
            let text = data.to_string();
            assert!(!text.contains("steve"), "{text}");
            assert!(!text.contains("config/"), "{text}");
            assert!(!text.contains("mods/"), "{text}");
        }
        let long = sanitize_error(&"x".repeat(500));
        assert_eq!(long.chars().count(), ERROR_MAX_CHARS);
    }
}
