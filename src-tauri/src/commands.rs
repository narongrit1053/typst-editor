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

    let can_canon = if candidate.exists() {
        fs::canonicalize(candidate).map_err(|e| e.to_string())?
    } else {
        let parent = candidate.parent().ok_or_else(|| "OUTSIDE_ROOT".to_string())?;
        let parent_canon = fs::canonicalize(parent).map_err(|_| "OUTSIDE_ROOT".to_string())?;
        let file_name = candidate.file_name().ok_or_else(|| "OUTSIDE_ROOT".to_string())?;
        parent_canon.join(file_name)
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
    let out_path = PathBuf::from(&out);

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
        let err_msg = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(if err_msg.trim().is_empty() {
            format!("typst compile failed with status {}", output.status)
        } else {
            err_msg
        });
    }

    Ok(())
}

#[tauri::command]
pub fn export_pdf(state: State<'_, AppState>, main: String, out: String) -> Result<(), String> {
    export_file(state, main, out, None)
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
        assert_eq!(resolve_inside(&proj, &proj.join("../proj2/b.typ")), Err("OUTSIDE_ROOT".into()));
        assert_eq!(resolve_inside(&proj, &proj2.join("b.typ")), Err("OUTSIDE_ROOT".into()));
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
}
