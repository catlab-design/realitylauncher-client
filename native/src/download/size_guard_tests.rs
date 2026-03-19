use std::fs::read_to_string;
use std::path::Path;

#[test]
fn download_module_loc_guard() {
    let source = read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("src/download/mod.rs"))
        .expect("failed to read src/download/mod.rs");
    let lines = source.lines().count();
    assert!(
        lines <= 2000,
        "src/download/mod.rs should stay at or below 2000 lines, found {lines}"
    );
}
