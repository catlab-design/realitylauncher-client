






#[tauri::command]
pub fn window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_maximize(window: tauri::Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn window_close(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_is_maximized(window: tauri::Window) -> Result<bool, String> {
    window.is_maximized().map_err(|e| e.to_string())
}





const MAIN_MIN: (f64, f64) = (1100.0, 680.0);
const MAIN_MAX: (f64, f64) = (1920.0, 1080.0);



fn configured_main_size() -> Option<(f64, f64)> {
    let config = crate::config::config_get();
    let auto = config
        .extra
        .get("windowAuto")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    if auto {
        return None;
    }
    let dim = |key: &str, min: f64, max: f64| {
        config
            .extra
            .get(key)
            .and_then(|v| v.as_f64())
            .map(|v| v.round().clamp(min, max))
    };
    let width = dim("windowWidth", MAIN_MIN.0, MAIN_MAX.0)?;
    let height = dim("windowHeight", MAIN_MIN.1, MAIN_MAX.1)?;
    Some((width, height))
}



#[tauri::command]
pub fn window_set_main_mode(window: tauri::Window) -> Result<(), String> {
    use tauri::{LogicalSize, Size};
    let (width, height) = configured_main_size().unwrap_or(MAIN_MIN);
    window.set_resizable(true).map_err(|e| e.to_string())?;
    let _ = window.set_min_size(Some(Size::Logical(LogicalSize {
        width: MAIN_MIN.0,
        height: MAIN_MIN.1,
    })));
    let _ = window.set_max_size(Some(Size::Logical(LogicalSize {
        width: MAIN_MAX.0,
        height: MAIN_MAX.1,
    })));
    window
        .set_size(Size::Logical(LogicalSize { width, height }))
        .map_err(|e| e.to_string())?;
    window.center().map_err(|e| e.to_string())?;
    Ok(())
}
