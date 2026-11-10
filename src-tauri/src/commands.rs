use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager, State};
use crate::AppState;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

pub fn resolve_inside(root: &Path, candidate: &Path) -> Result<PathBuf, String> {
    let root_canon = fs::canonicalize(root).map_err(|e| format!("NO_ROOT: {}", e))?;
    let full_cand = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        root.join(candidate)
    };

    let can_canon = if full_cand.exists() {
        fs::canonicalize(&full_cand).map_err(|e| e.to_string())?
    } else {
        // Walk up to find nearest existing directory
        let mut curr = full_cand.as_path();
        let mut parts = Vec::new();
        while !curr.exists() {
            if let Some(name) = curr.file_name() {
                parts.push(name.to_os_string());
            }
            match curr.parent() {
                Some(p) => curr = p,
                None => return Err("OUTSIDE_ROOT".to_string()),
            }
        }
        let mut canon = fs::canonicalize(curr).map_err(|_| "OUTSIDE_ROOT".to_string())?;
        for p in parts.into_iter().rev() {
            canon.push(p);
        }
        canon
    };

    if can_canon.starts_with(&root_canon) {
        Ok(can_canon)
    } else {
        Err("OUTSIDE_ROOT".to_string())
    }
}

pub fn write_file_atomic(path: &Path, contents: &str) -> Result<(), String> {
    let file_name = path.file_name().and_then(|s| s.to_str()).unwrap_or("file");
    let tmp_path = path.with_file_name(format!("{}.tmp", file_name));

    fs::write(&tmp_path, contents).map_err(|e| e.to_string())?;

    if let Err(e) = fs::rename(&tmp_path, path) {
        let _ = fs::remove_file(&tmp_path);
        return Err(e.to_string());
    }
    Ok(())
}

pub fn export_args(
    main: &Path,
    out: &Path,
    root: &Path,
    font_dir: Option<&Path>,
) -> Vec<OsString> {
    let mut args = vec![
        OsString::from("compile"),
        main.as_os_str().to_os_string(),
        out.as_os_str().to_os_string(),
        OsString::from("--root"),
        root.as_os_str().to_os_string(),
    ];

    if let Some(fonts) = font_dir {
        args.push(OsString::from("--font-path"));
        args.push(fonts.as_os_str().to_os_string());
    }

    args
}

pub fn list_directory(target_dir: &Path) -> Result<Vec<FileEntry>, String> {
    let mut entries = Vec::new();
    let read_dir = fs::read_dir(target_dir).map_err(|e| e.to_string())?;
    for item in read_dir {
        let entry = item.map_err(|e| e.to_string())?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name == ".git" || file_name == "node_modules" || file_name == "target" || file_name == ".superpowers" {
            continue;
        }
        let is_dir = path.is_dir();
        entries.push(FileEntry {
            name: file_name,
            path: path.to_string_lossy().to_string(),
            is_dir,
        });
    }

    entries.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(entries)
}

#[tauri::command]
pub fn set_root(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let p = PathBuf::from(path);
    let mut root = state.root.lock().map_err(|e| e.to_string())?;
    *root = Some(p);
    Ok(())
}

#[tauri::command]
pub fn read_file(state: State<'_, AppState>, path: String) -> Result<String, String> {
    let root_guard = state.root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or_else(|| "NO_ROOT".to_string())?;
    let target = resolve_inside(root, Path::new(&path))?;
    fs::read_to_string(&target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file(state: State<'_, AppState>, path: String, contents: String) -> Result<(), String> {
    let root_guard = state.root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or_else(|| "NO_ROOT".to_string())?;
    let target = resolve_inside(root, Path::new(&path))?;
    write_file_atomic(&target, &contents)
}

#[tauri::command]
pub fn list_dir(state: State<'_, AppState>, path: Option<String>) -> Result<Vec<FileEntry>, String> {
    let root_guard = state.root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or_else(|| "NO_ROOT".to_string())?;
    let target = match path {
        Some(p) => resolve_inside(root, Path::new(&p))?,
        None => root.clone(),
    };
    list_directory(&target)
}

#[tauri::command]
pub fn create_file(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let root_guard = state.root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or_else(|| "NO_ROOT".to_string())?;
    let target = resolve_inside(root, Path::new(&path))?;
    if target.exists() {
        return Err("FILE_ALREADY_EXISTS".to_string());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&target, "").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_dir(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let root_guard = state.root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or_else(|| "NO_ROOT".to_string())?;
    let target = resolve_inside(root, Path::new(&path))?;
    fs::create_dir_all(&target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_path(state: State<'_, AppState>, old_path: String, new_path: String) -> Result<(), String> {
    let root_guard = state.root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or_else(|| "NO_ROOT".to_string())?;
    let old_target = resolve_inside(root, Path::new(&old_path))?;
    let new_target = resolve_inside(root, Path::new(&new_path))?;
    fs::rename(old_target, new_target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_path(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let root_guard = state.root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or_else(|| "NO_ROOT".to_string())?;
    let target = resolve_inside(root, Path::new(&path))?;
    if target.is_dir() {
        fs::remove_dir_all(target).map_err(|e| e.to_string())
    } else {
        fs::remove_file(target).map_err(|e| e.to_string())
    }
}

pub fn settings_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    Ok(config_dir.join("settings.json"))
}

#[tauri::command]
pub fn load_app_settings(app: AppHandle) -> Result<String, String> {
    let path = settings_file_path(&app)?;
    if path.exists() {
        fs::read_to_string(&path).map_err(|e| e.to_string())
    } else {
        Ok("{}".to_string())
    }
}

#[tauri::command]
pub fn save_app_settings(app: AppHandle, settings_json: String) -> Result<(), String> {
    let path = settings_file_path(&app)?;
    write_file_atomic(&path, &settings_json)
}

#[tauri::command]
pub fn check_typst(custom_binary: Option<String>) -> Result<String, String> {
    let bin = custom_binary.filter(|s| !s.trim().is_empty()).unwrap_or_else(|| "typst".to_string());
    let mut cmd = Command::new(&bin);
    cmd.arg("--version");

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "TYPST_NOT_FOUND".to_string()
        } else {
            e.to_string()
        }
    })?;

    if output.status.success() {
        let ver = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(ver)
    } else {
        Err(format!("typst check failed with exit code {}", output.status))
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub available: bool,
    pub notes: String,
    pub download_url: Option<String>,
}

pub fn is_version_newer(current: &str, latest: &str) -> bool {
    let parse_ver = |s: &str| -> Vec<u32> {
        s.trim_start_matches('v')
            .split('.')
            .filter_map(|part| part.split('-').next().unwrap_or(part).parse::<u32>().ok())
            .collect()
    };
    let c = parse_ver(current);
    let l = parse_ver(latest);
    l > c
}

#[tauri::command]
pub fn check_app_update(custom_endpoint: Option<String>) -> Result<UpdateInfo, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let url = custom_endpoint
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "https://github.com/kong/typst-editor/releases/latest/download/latest.json".to_string());

    let resp = ureq::get(&url)
        .timeout(std::time::Duration::from_secs(5))
        .call()
        .map_err(|e| format!("UPDATE_CHECK_FAILED: {}", e))?;

    let body: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
    let latest_version = body["version"].as_str().unwrap_or(&current_version).to_string();
    let notes = body["notes"].as_str().unwrap_or("").to_string();
    let available = is_version_newer(&current_version, &latest_version);
    let download_url = body["platforms"]["windows-x86_64"]["url"].as_str().map(|s| s.to_string());

    Ok(UpdateInfo {
        current_version,
        latest_version,
        available,
        notes,
        download_url,
    })
}

#[tauri::command]
pub fn download_and_launch_installer(url: String) -> Result<(), String> {
    if !url.starts_with("https://github.com/kong/typst-editor/releases/download/") || !url.ends_with(".exe") {
        return Err("UNTRUSTED_DOWNLOAD_URL".to_string());
    }
    let temp_dir = std::env::temp_dir();
    let installer_path = temp_dir.join("typst-editor-setup.exe");

    let resp = ureq::get(&url)
        .timeout(std::time::Duration::from_secs(60))
        .call()
        .map_err(|e| format!("DOWNLOAD_FAILED: {}", e))?;

    let mut reader = resp.into_reader();
    let mut file = fs::File::create(&installer_path).map_err(|e| e.to_string())?;
    std::io::copy(&mut reader, &mut file).map_err(|e| e.to_string())?;
    drop(file);

    let mut cmd = Command::new(&installer_path);
    cmd.spawn().map_err(|e| format!("LAUNCH_FAILED: {}", e))?;
    Ok(())
}

// --- Phase 5: Template Market Commands ---

pub fn template_cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    Ok(data_dir.join("template_cache.json"))
}

pub fn my_templates_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dir = data_dir.join("my_templates");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub fn fetch_template_catalog(app: AppHandle) -> Result<String, String> {
    let cache_file = template_cache_path(&app)?;
    let url = "https://packages.typst.org/preview/index.json";

    match ureq::get(url).timeout(std::time::Duration::from_secs(6)).call() {
        Ok(resp) => {
            if let Ok(text) = resp.into_string() {
                let _ = fs::write(&cache_file, &text);
                return Ok(text);
            }
        }
        Err(_) => {
            // Offline fallback: load from cache
            if cache_file.exists() {
                if let Ok(cached) = fs::read_to_string(&cache_file) {
                    return Ok(cached);
                }
            }
        }
    }

    if cache_file.exists() {
        fs::read_to_string(&cache_file).map_err(|e| e.to_string())
    } else {
        Err("CATALOG_UNAVAILABLE".to_string())
    }
}

#[tauri::command]
pub fn create_from_template(
    target_dir: String,
    package_spec: String,
    custom_binary: Option<String>,
) -> Result<(), String> {
    let target = PathBuf::from(&target_dir);
    if !target.exists() {
        fs::create_dir_all(&target).map_err(|e| e.to_string())?;
    }

    let bin = custom_binary.filter(|s| !s.trim().is_empty()).unwrap_or_else(|| "typst".to_string());
    let mut cmd = Command::new(&bin);
    cmd.arg("init").arg(&package_spec).arg(&target_dir);

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "TYPST_NOT_FOUND".to_string()
        } else {
            e.to_string()
        }
    })?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(if err_msg.trim().is_empty() {
            format!("typst init failed with code {}", output.status)
        } else {
            err_msg
        });
    }

    Ok(())
}

#[tauri::command]
pub fn save_as_my_template(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
) -> Result<(), String> {
    let root_guard = state.root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or_else(|| "NO_ROOT".to_string())?;

    let clean_name = name.trim().replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
    if clean_name.is_empty() {
        return Err("INVALID_NAME".to_string());
    }

    let templates_dir = my_templates_dir(&app)?;
    let dest_dir = templates_dir.join(&clean_name);
    if dest_dir.exists() {
        fs::remove_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    // Copy all files from project root to dest_dir recursively
    copy_dir_recursive(root, &dest_dir)?;
    Ok(())
}

#[tauri::command]
pub fn list_my_templates(app: AppHandle) -> Result<Vec<String>, String> {
    let templates_dir = my_templates_dir(&app)?;
    let mut names = Vec::new();
    if let Ok(entries) = fs::read_dir(templates_dir) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                if let Ok(name) = entry.file_name().into_string() {
                    names.push(name);
                }
            }
        }
    }
    names.sort();
    Ok(names)
}

#[tauri::command]
pub fn use_my_template(
    app: AppHandle,
    template_name: String,
    target_dir: String,
) -> Result<(), String> {
    let templates_dir = my_templates_dir(&app)?;
    let src = templates_dir.join(&template_name);
    if !src.exists() {
        return Err("TEMPLATE_NOT_FOUND".to_string());
    }

    let dest = PathBuf::from(&target_dir);
    fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
    copy_dir_recursive(&src, &dest)?;
    Ok(())
}

pub fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        let file_name = entry.file_name();
        let name_str = file_name.to_string_lossy();
        if name_str == ".git" || name_str == "node_modules" || name_str == "target" {
            continue;
        }

        let path = entry.path();
        if path == dst || dst.starts_with(&path) {
            continue;
        }

        let dest_child = dst.join(&file_name);
        if file_type.is_dir() {
            fs::create_dir_all(&dest_child).map_err(|e| e.to_string())?;
            copy_dir_recursive(&entry.path(), &dest_child)?;
        } else {
            fs::copy(entry.path(), &dest_child).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn export_file(
    state: State<'_, AppState>,
    main: String,
    out: String,
    custom_binary: Option<String>,
) -> Result<(), String> {
    let root_guard = state.root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or_else(|| "NO_ROOT".to_string())?;

    let main_path = resolve_inside(root, Path::new(&main))?;
    let mut out_path = PathBuf::from(&out);

    // If exporting to image (PNG/SVG) and path lacks page template ({p} or {0p}),
    // automatically append _{0p} before extension so multi-page documents compile without error.
    let out_str = out_path.to_string_lossy().to_string();
    let lower_out = out_str.to_lowercase();
    let is_img = lower_out.ends_with(".png") || lower_out.ends_with(".svg");
    let has_template = out_str.contains("{p}") || out_str.contains("{0p}");
    if is_img && !has_template {
        if let Some(stem) = out_path.file_stem().and_then(|s| s.to_str()) {
            let ext = out_path.extension().and_then(|s| s.to_str()).unwrap_or("");
            out_path.set_file_name(format!("{}_{{0p}}.{}", stem, ext));
        }
    }

    let font_candidate = root.join("fonts");
    let font_dir = if font_candidate.is_dir() {
        Some(font_candidate.as_path())
    } else {
        None
    };

    let args = export_args(&main_path, &out_path, root, font_dir);

    let bin = custom_binary.filter(|s| !s.trim().is_empty()).unwrap_or_else(|| "typst".to_string());
    let mut cmd = Command::new(&bin);
    cmd.args(args);

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "TYPST_NOT_FOUND".to_string()
        } else {
            e.to_string()
        }
    })?;

    if !output.status.success() {
        let stderr_raw = String::from_utf8_lossy(&output.stderr).to_string();
        let mut err_lines: Vec<&str> = stderr_raw
            .lines()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .filter(|s| s.starts_with("error:") || s.contains("error"))
            .collect();

        let clean_err = if !err_lines.is_empty() {
            err_lines.truncate(3);
            err_lines.join("\n")
        } else {
            stderr_raw
                .lines()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .take(3)
                .collect::<Vec<&str>>()
                .join("\n")
        };

        return Err(if clean_err.trim().is_empty() {
            format!("typst compile failed with status {}", output.status)
        } else {
            clean_err
        });
    }

    Ok(())
}


#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_resolve_inside() {
        let dir = tempdir().unwrap();
        let proj = dir.path().join("proj");
        let proj2 = dir.path().join("proj2");
        fs::create_dir_all(proj.join("sub")).unwrap();
        fs::create_dir_all(&proj2).unwrap();
        fs::write(proj.join("sub/a.typ"), "a").unwrap();
        fs::write(proj2.join("b.typ"), "b").unwrap();

        assert!(resolve_inside(&proj, &proj.join("sub/a.typ")).is_ok());
        assert!(resolve_inside(&proj, &proj.join("new.typ")).is_ok());
        assert!(resolve_inside(&proj, Path::new("sub/a.typ")).is_ok());
        assert!(resolve_inside(&proj, Path::new("new.typ")).is_ok());
        assert!(resolve_inside(&proj, Path::new("nested/deep/new.typ")).is_ok());
        assert_eq!(resolve_inside(&proj, &proj.join("../proj2/b.typ")), Err("OUTSIDE_ROOT".into()));
        assert_eq!(resolve_inside(&proj, &proj2.join("b.typ")), Err("OUTSIDE_ROOT".into()));
    }

    #[test]
    fn test_download_installer_url_validation() {
        assert_eq!(
            download_and_launch_installer("http://malicious.com/setup.exe".into()),
            Err("UNTRUSTED_DOWNLOAD_URL".into())
        );
        assert_eq!(
            download_and_launch_installer("https://github.com/other/repo/releases/download/v1/setup.exe".into()),
            Err("UNTRUSTED_DOWNLOAD_URL".into())
        );
    }

    #[test]
    fn test_image_export_path_template() {
        let mut out = PathBuf::from("paper.png");
        let out_str = out.to_string_lossy().to_string();
        let lower = out_str.to_lowercase();
        let is_img = lower.ends_with(".png") || lower.ends_with(".svg");
        let has_template = out_str.contains("{p}") || out_str.contains("{0p}");
        if is_img && !has_template {
            let stem = out.file_stem().unwrap().to_str().unwrap();
            let ext = out.extension().unwrap().to_str().unwrap();
            out.set_file_name(format!("{}_{{0p}}.{}", stem, ext));
        }
        assert_eq!(out.to_string_lossy(), "paper_{0p}.png");
    }

    #[test]
    fn test_write_file_atomic() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.typ");
        fs::write(&file_path, "initial").unwrap();

        write_file_atomic(&file_path, "updated").unwrap();
        assert_eq!(fs::read_to_string(&file_path).unwrap(), "updated");
        assert!(!dir.path().join("test.typ.tmp").exists());
    }

    #[test]
    fn test_write_file_read_only_fails_cleanly() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("readonly.typ");
        fs::write(&file_path, "initial content").unwrap();
        let mut perms = fs::metadata(&file_path).unwrap().permissions();
        perms.set_readonly(true);
        fs::set_permissions(&file_path, perms.clone()).unwrap();

        let res = write_file_atomic(&file_path, "new content");
        assert!(res.is_err());
        assert_eq!(fs::read_to_string(&file_path).unwrap(), "initial content");

        perms.set_readonly(false);
        let _ = fs::set_permissions(&file_path, perms);
    }

    #[test]
    fn test_export_args() {
        let a = export_args(
            Path::new(r"D:\งาน\my doc.typ"),
            Path::new(r"D:\out\x.pdf"),
            Path::new(r"D:\งาน"),
            None,
        );
        assert_eq!(
            a,
            ["compile", r"D:\งาน\my doc.typ", r"D:\out\x.pdf", "--root", r"D:\งาน"].map(OsString::from)
        );
        let b = export_args(
            Path::new("m.typ"),
            Path::new("o.pdf"),
            Path::new("."),
            Some(Path::new("fonts")),
        );
        assert_eq!(&b[5..], ["--font-path", "fonts"].map(OsString::from));
    }

    #[test]
    fn test_list_directory_ordering() {
        let dir = tempdir().unwrap();
        fs::create_dir_all(dir.path().join("subdir")).unwrap();
        fs::write(dir.path().join("b.typ"), "").unwrap();
        fs::write(dir.path().join("a.typ"), "").unwrap();

        let entries = list_directory(dir.path()).unwrap();
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].name, "subdir");
        assert!(entries[0].is_dir);
        assert_eq!(entries[1].name, "a.typ");
        assert!(!entries[1].is_dir);
        assert_eq!(entries[2].name, "b.typ");
        assert!(!entries[2].is_dir);
    }

    #[test]
    fn test_create_and_delete_operations() {
        let dir = tempdir().unwrap();
        let root = dir.path().join("root");
        fs::create_dir_all(&root).unwrap();

        // create file inside root
        let target = resolve_inside(&root, &root.join("new_file.typ")).unwrap();
        fs::write(&target, "content").unwrap();
        assert!(target.exists());

        // delete file
        fs::remove_file(&target).unwrap();
        assert!(!target.exists());

        // path traversal attempt is blocked by resolve_inside
        let outside = resolve_inside(&root, &root.join("../escaped.typ"));
        assert_eq!(outside, Err("OUTSIDE_ROOT".into()));
    }

    #[test]
    fn test_check_typst() {
        assert_eq!(
            check_typst(Some("non_existent_binary_foo_bar_xyz".to_string())),
            Err("TYPST_NOT_FOUND".into())
        );
        if let Ok(ver) = check_typst(None) {
            assert!(ver.contains("typst"));
        }
    }

    #[test]
    fn test_is_version_newer() {
        assert!(is_version_newer("0.1.0", "0.2.0"));
        assert!(is_version_newer("0.1.0", "1.0.0"));
        assert!(is_version_newer("v0.1.0", "v0.1.1"));
        assert!(!is_version_newer("0.2.0", "0.1.0"));
        assert!(!is_version_newer("0.1.0", "0.1.0"));
    }

    #[test]
    fn test_copy_dir_recursive() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("src");
        let dst = dir.path().join("dst");
        fs::create_dir_all(src.join("sub")).unwrap();
        fs::write(src.join("sub/chapter.typ"), "hello").unwrap();
        fs::create_dir_all(&dst).unwrap();

        copy_dir_recursive(&src, &dst).unwrap();
        assert!(dst.join("sub/chapter.typ").exists());
        assert_eq!(fs::read_to_string(dst.join("sub/chapter.typ")).unwrap(), "hello");

        // Guard against infinite self-nesting when dst is inside src
        let nested_dst = src.join("backup");
        fs::create_dir_all(&nested_dst).unwrap();
        copy_dir_recursive(&src, &nested_dst).unwrap();
        assert!(nested_dst.join("sub/chapter.typ").exists());
    }
}
