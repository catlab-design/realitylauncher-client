//! Game window branding handed to the agent: the title it shows instead of
//! Minecraft's default one, and the icon it swaps in for Minecraft's default
//! icons (the instance icon, or the Reality logo when the instance has none).
//! Titles and icons set by mods are left alone by the agent.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use image::imageops::FilterType;
use image::RgbaImage;

const FALLBACK_ICON: &[u8] = include_bytes!("../icons/128x128@2x.png");
const ICON_SIZES: [u32; 6] = [16, 32, 48, 64, 128, 256];
/// Encoded icons are cached per source image; this many are kept.
const ICON_CACHE_KEEP: usize = 8;

pub fn window_title(instance_name: &str, mc_version: &str) -> String {
    format!(
        "{instance_name} | Reality Launcher ({mc_version}-{})",
        env!("CARGO_PKG_VERSION")
    )
}

/// Instance icons are stored as `icon.png` but are often WebP; decode by content.
fn load_icon(source: Option<&[u8]>) -> RgbaImage {
    source
        .and_then(|bytes| image::load_from_memory(bytes).ok())
        .map(|img| img.to_rgba8())
        .filter(|img| img.width() > 0 && img.height() > 0)
        .unwrap_or_else(|| {
            image::load_from_memory(FALLBACK_ICON)
                .expect("bundled fallback icon decodes")
                .to_rgba8()
        })
}

/// Fits the image into a transparent square, keeping its aspect ratio.
fn square(img: &RgbaImage, size: u32) -> RgbaImage {
    let scale = size as f32 / img.width().max(img.height()) as f32;
    let w = ((img.width() as f32 * scale).round() as u32).clamp(1, size);
    let h = ((img.height() as f32 * scale).round() as u32).clamp(1, size);
    let resized = image::imageops::resize(img, w, h, FilterType::Lanczos3);
    let mut out = RgbaImage::new(size, size);
    image::imageops::overlay(&mut out, &resized, ((size - w) / 2) as i64, ((size - h) / 2) as i64);
    out
}

/// "RLIC", u32 count, then per size u32 width, u32 height, RGBA (big-endian),
/// as read by the agent's WindowHooks.readIcons.
fn encode_icons(img: &RgbaImage) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(b"RLIC");
    out.extend_from_slice(&(ICON_SIZES.len() as u32).to_be_bytes());
    for size in ICON_SIZES {
        let scaled = square(img, size);
        out.extend_from_slice(&size.to_be_bytes());
        out.extend_from_slice(&size.to_be_bytes());
        out.extend_from_slice(scaled.as_raw());
    }
    out
}

/// Names the encoded file after its source image and layout, so an unchanged
/// icon is never decoded and resized again.
fn icon_cache_name(source: Option<&[u8]>) -> String {
    let mut hasher = crc32fast::Hasher::new();
    hasher.update(b"RLIC1");
    for size in ICON_SIZES {
        hasher.update(&size.to_be_bytes());
    }
    hasher.update(source.unwrap_or(FALLBACK_ICON));
    format!("{:08x}.rlic", hasher.finalize())
}

pub fn write_icon_file(minecraft_dir: &Path, instance_dir: &Path) -> Result<PathBuf, String> {
    let dir = minecraft_dir.join("agent").join("icons");
    let source = fs::read(instance_dir.join("icon.png")).ok();
    let path = dir.join(icon_cache_name(source.as_deref()));
    if path.is_file() {
        // Bump the mtime so pruning keeps icons that are still in use.
        let _ = fs::File::options()
            .append(true)
            .open(&path)
            .and_then(|f| f.set_modified(std::time::SystemTime::now()));
        return Ok(path);
    }

    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let tmp = path.with_extension(format!("{}.tmp", std::process::id()));
    let bytes = encode_icons(&load_icon(source.as_deref()));
    fs::File::create(&tmp)
        .and_then(|mut f| f.write_all(&bytes))
        .map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })?;
    prune_icon_cache(&dir);
    let _ = fs::remove_file(minecraft_dir.join("agent").join("window-icon.rlic"));
    Ok(path)
}

/// Keeps the most recently used encoded icons.
fn prune_icon_cache(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    let mut files: Vec<(std::time::SystemTime, PathBuf)> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "rlic"))
        .filter_map(|p| Some((fs::metadata(&p).ok()?.modified().ok()?, p)))
        .collect();
    files.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, path) in files.into_iter().skip(ICON_CACHE_KEEP) {
        let _ = fs::remove_file(path);
    }
}

/// CRC32 of the RGBA pixels of each default window icon in the version's asset
/// index (`icons/*.png`, release and snapshot sets). The agent replaces an icon
/// only when every image the game passes matches one of these, so icons from
/// mods are never touched. RGBA here equals what Minecraft gets from STBImage
/// for these 8-bit PNGs.
pub fn vanilla_icon_fingerprints(assets_dir: &Path, asset_index: &str) -> Vec<String> {
    let index_path = assets_dir.join("indexes").join(format!("{asset_index}.json"));
    // Decoding every icon takes seconds; the result only changes with the index.
    let Some(stamp) = fs::metadata(&index_path).ok().and_then(|m| {
        let mtime = m.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?;
        Some(format!("v1:{}:{}", m.len(), mtime.as_millis()))
    }) else {
        return Vec::new();
    };
    let cache_path = assets_dir.join("indexes").join(format!(".{asset_index}.icon-fingerprints"));
    if let Some(cached) = fs::read_to_string(&cache_path).ok().and_then(|text| {
        let (key, prints) = text.split_once('\n')?;
        (key == stamp).then(|| prints.split_whitespace().map(str::to_string).collect::<Vec<_>>())
    }) {
        return cached;
    }
    let prints = compute_vanilla_icon_fingerprints(assets_dir, &index_path);
    if !prints.is_empty() {
        let _ = fs::write(&cache_path, format!("{stamp}\n{}", prints.join(" ")));
    }
    prints
}

fn compute_vanilla_icon_fingerprints(assets_dir: &Path, index_path: &Path) -> Vec<String> {
    let Some(index) = fs::read_to_string(index_path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
    else {
        return Vec::new();
    };
    let Some(objects) = index.get("objects").and_then(|o| o.as_object()) else {
        return Vec::new();
    };
    let mut prints: Vec<String> = objects
        .iter()
        .filter(|(name, _)| name.starts_with("icons/") && name.ends_with(".png"))
        .filter_map(|(_, entry)| entry.get("hash")?.as_str().map(str::to_string))
        .filter(|hash| hash.len() > 2)
        .filter_map(|hash| fs::read(assets_dir.join("objects").join(&hash[..2]).join(&hash)).ok())
        .filter_map(|bytes| image::load_from_memory(&bytes).ok())
        .map(|img| format!("{:08x}", crc32fast::hash(img.to_rgba8().as_raw())))
        .collect();
    prints.sort();
    prints.dedup();
    prints
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_format() {
        assert_eq!(
            window_title("Cat Lab Testplace", "1.20.1"),
            format!("Cat Lab Testplace | Reality Launcher (1.20.1-{})", env!("CARGO_PKG_VERSION"))
        );
    }

    #[test]
    fn missing_instance_icon_falls_back_to_logo() {
        let logo = image::load_from_memory(FALLBACK_ICON).unwrap().to_rgba8();
        assert_eq!(load_icon(None), logo);
        assert_eq!(load_icon(Some(b"not an image")), logo);
    }

    #[test]
    fn icon_file_is_reused_until_the_icon_changes() {
        let root = std::env::temp_dir().join(format!("rl-icon-cache-{}", std::process::id()));
        let instance = root.join("instance");
        fs::create_dir_all(&instance).unwrap();

        let logo = write_icon_file(&root, &instance).unwrap();
        assert_eq!(write_icon_file(&root, &instance).unwrap(), logo);

        let mut png = Vec::new();
        RgbaImage::from_pixel(4, 4, image::Rgba([0, 255, 0, 255]))
            .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
            .unwrap();
        fs::write(instance.join("icon.png"), &png).unwrap();
        let custom = write_icon_file(&root, &instance).unwrap();
        assert_ne!(custom, logo);
        assert!(custom.is_file() && logo.is_file());

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn icon_file_layout() {
        let img = RgbaImage::from_pixel(30, 10, image::Rgba([255, 0, 0, 255]));
        let bytes = encode_icons(&img);
        assert_eq!(&bytes[..4], b"RLIC");
        assert_eq!(u32::from_be_bytes(bytes[4..8].try_into().unwrap()), ICON_SIZES.len() as u32);
        assert_eq!(u32::from_be_bytes(bytes[8..12].try_into().unwrap()), 16);
        let expected: usize = 8 + ICON_SIZES.iter().map(|s| 8 + (s * s * 4) as usize).sum::<usize>();
        assert_eq!(bytes.len(), expected);
        // 30x10 fits as 16x5 centred: top row transparent, middle row red.
        let first = &bytes[16..16 + 16 * 16 * 4];
        assert_eq!(first[3], 0);
        let mid = (8 * 16 + 8) * 4;
        assert_eq!(&first[mid..mid + 4], &[255, 0, 0, 255]);
    }
}
