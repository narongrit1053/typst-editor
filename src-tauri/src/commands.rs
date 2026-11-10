use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::State;
use crate::AppState;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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
pub fn export_pdf(state: State<'_, AppState>, main: String, out: String) -> Result<(), String> {
    let root_guard = state.root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or_else(|| "NO_ROOT".to_string())?;

    let main_path = resolve_inside(root, Path::new(&main))?;
    let out_path = PathBuf::from(out);

    let font_candidate = root.join("fonts");
    let font_dir = if font_candidate.is_dir() {
        Some(font_candidate.as_path())
    } else {
        None
    };

    let args = export_args(&main_path, &out_path, root, font_dir);

    let mut cmd = Command::new("typst");
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
        assert!(resolve_inside(&proj, &proj.join("new.typ")).is_ok()); // not yet existing
        assert_eq!(resolve_inside(&proj, &proj.join("../proj2/b.typ")), Err("OUTSIDE_ROOT".into()));
        assert_eq!(resolve_inside(&proj, &proj2.join("b.typ")), Err("OUTSIDE_ROOT".into())); // sibling with same prefix
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

        // Clean up permissions so tempdir can be deleted
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
}
