//! Wayland sessions on Linux.
//!
//! On native Wayland, WebKitGTK and our undecorated window misbehave: blank
//! windows or "Error 71 (Protocol error)" crashes (NVIDIA), no centering (Wayland
//! doesn't let apps place windows) and odd resizing. Minecraft on GLFW 3.4
//! (LWJGL 3.3.2+, i.e. 1.20.2 and newer) also switches to native Wayland, where
//! window icons and positions aren't supported. So by default both the launcher
//! and the game run through XWayland, like they do on X11; the `nativeWayland`
//! setting turns that off for players who want native Wayland (sharper HiDPI).

use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Session {
    /// The desktop session is Wayland.
    pub wayland: bool,
    /// X11 apps can run (XWayland is up).
    pub xwayland: bool,
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.filter(|v| !v.trim().is_empty())
}

fn detect(wayland_display: Option<String>, session_type: Option<String>, display: Option<String>) -> Session {
    let wayland = non_empty(wayland_display).is_some()
        || non_empty(session_type).is_some_and(|t| t.eq_ignore_ascii_case("wayland"));
    Session { wayland, xwayland: non_empty(display).is_some() }
}

pub fn session() -> Session {
    if !cfg!(target_os = "linux") {
        return Session { wayland: false, xwayland: false };
    }
    detect(
        std::env::var("WAYLAND_DISPLAY").ok(),
        std::env::var("XDG_SESSION_TYPE").ok(),
        std::env::var("DISPLAY").ok(),
    )
}

/// Whether the launcher and game should go through XWayland.
pub fn use_xwayland(native_wayland: bool) -> bool {
    let s = session();
    s.wayland && s.xwayland && !native_wayland
}

/// Runs first in `main`, before GTK starts. Variables the player set
/// themselves are never overridden.
pub fn configure_launcher(native_wayland: bool) {
    let s = session();
    if !s.wayland {
        return;
    }
    if use_xwayland(native_wayland) {
        if std::env::var_os("GDK_BACKEND").is_none() {
            std::env::set_var("GDK_BACKEND", "x11");
        }
        println!("[Wayland] Running the launcher through XWayland");
    } else {
        // NVIDIA's explicit sync breaks WebKitGTK on Wayland ("Error 71").
        if Path::new("/proc/driver/nvidia/version").exists()
            && std::env::var_os("__NV_DISABLE_EXPLICIT_SYNC").is_none()
        {
            std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");
        }
        println!("[Wayland] Running the launcher natively on Wayland");
    }
}

/// Environment changes for the game process so GLFW picks X11. GLFW 3.4 tries
/// Wayland first when `XDG_SESSION_TYPE=wayland` and `WAYLAND_DISPLAY` is set.
pub fn game_env(native_wayland: bool) -> Option<(Vec<&'static str>, Vec<(&'static str, &'static str)>)> {
    use_xwayland(native_wayland).then(|| (vec!["WAYLAND_DISPLAY"], vec![("XDG_SESSION_TYPE", "x11")]))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(v: &str) -> Option<String> {
        Some(v.to_string())
    }

    #[test]
    fn detects_sessions() {
        assert_eq!(detect(s("wayland-0"), s("wayland"), s(":0")), Session { wayland: true, xwayland: true });
        assert_eq!(detect(None, s("wayland"), None), Session { wayland: true, xwayland: false });
        assert_eq!(detect(None, s("x11"), s(":0.0")), Session { wayland: false, xwayland: true });
        assert_eq!(detect(s(""), s("tty"), s("")), Session { wayland: false, xwayland: false });
    }
}
