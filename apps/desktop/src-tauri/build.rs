use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use std::{env, fs, path::Path, path::PathBuf, process::Command};

const ICON_PLACEHOLDER: &str =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HwAHAAL/3LjXLwAAAABJRU5ErkJggg==";

fn ensure_placeholder_icon() {
  let manifest_dir = env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR to be set");
  let icon_path = Path::new(&manifest_dir).join("icons/icon.png");

  if icon_path.exists() {
    return;
  }

  if let Some(parent) = icon_path.parent() {
    if let Err(error) = fs::create_dir_all(parent) {
      panic!("failed to create icon directory: {error}");
    }
  }

  let bytes = BASE64_STANDARD
    .decode(ICON_PLACEHOLDER)
    .expect("placeholder icon base64 to decode");
  if let Err(error) = fs::write(&icon_path, bytes) {
    panic!("failed to write placeholder icon: {error}");
  }
}

fn pkg_config_libdir(package: &str) -> Option<PathBuf> {
  let output = Command::new("pkg-config")
    .args(["--variable=libdir", package])
    .output()
    .ok()?;

  if !output.status.success() {
    return None;
  }

  let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
  if path.is_empty() {
    None
  } else {
    Some(PathBuf::from(path))
  }
}

fn ensure_library_aliases() {
  if cfg!(not(target_os = "linux")) {
    return;
  }

  let out_dir = match env::var_os("OUT_DIR") {
    Some(path) => PathBuf::from(path),
    None => return,
  };

  let compat_dir = out_dir.join("compat-libs");
  if let Err(error) = fs::create_dir_all(&compat_dir) {
    println!("cargo:warning=Failed to prepare compat lib dir: {error}");
    return;
  }

  #[allow(clippy::type_complexity)]
  let aliases: &[(&str, &str, &str)] = &[
    ("webkit2gtk-4.1", "libwebkit2gtk-4.1.so", "libwebkit2gtk-4.0.so"),
    (
      "webkit2gtk-4.1",
      "libwebkit2gtk-4.1.so.0",
      "libwebkit2gtk-4.0.so.0",
    ),
    (
      "javascriptcoregtk-4.1",
      "libjavascriptcoregtk-4.1.so",
      "libjavascriptcoregtk-4.0.so",
    ),
    (
      "javascriptcoregtk-4.1",
      "libjavascriptcoregtk-4.1.so.0",
      "libjavascriptcoregtk-4.0.so.0",
    ),
  ];

  for (package, source_name, alias_name) in aliases {
    let Some(libdir) = pkg_config_libdir(package) else {
      println!("cargo:warning=Missing pkg-config libdir for {package}");
      continue;
    };

    let source = libdir.join(source_name);
    if !source.exists() {
      println!(
        "cargo:warning=Expected library {source_name} from {package} at {}",
        source.display()
      );
      continue;
    }

    let alias = compat_dir.join(alias_name);
    if alias.exists() {
      continue;
    }

    if let Err(error) = create_alias(&source, &alias) {
      println!(
        "cargo:warning=Failed to create compatibility alias {} -> {}: {error}",
        alias.display(),
        source.display()
      );
    }
  }

  println!("cargo:rustc-link-search=native={}", compat_dir.display());
}

#[cfg(unix)]
fn create_alias(source: &Path, alias: &Path) -> std::io::Result<()> {
  use std::os::unix::fs::symlink;

  symlink(source, alias)
}

#[cfg(not(unix))]
fn create_alias(source: &Path, alias: &Path) -> std::io::Result<()> {
  if alias.exists() {
    return Ok(());
  }

  fs::copy(source, alias).map(|_| ())
}

fn main() {
  ensure_placeholder_icon();
  ensure_library_aliases();
  tauri_build::build()
}
