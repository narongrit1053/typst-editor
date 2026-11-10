use std::io::BufReader;
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::lsp_frame::{read_message, write_message};
use crate::AppState;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub struct LspProcess {
    pub child: Child,
    pub stdin: ChildStdin,
}

pub fn stop_process(lsp_opt: &mut Option<LspProcess>) {
    if let Some(mut proc) = lsp_opt.take() {
        let _ = proc.child.kill();
        let _ = proc.child.wait();
    }
}

pub fn tinymist_path(app: Option<&AppHandle>) -> PathBuf {
    if let Ok(env_path) = std::env::var("TYPST_EDITOR_TINYMIST") {
        if !env_path.is_empty() {
            return PathBuf::from(env_path);
        }
    }
    if let Some(app_handle) = app {
        if let Ok(res_dir) = app_handle.path().resource_dir() {
            let res_cand = res_dir.join("tinymist.exe");
            if res_cand.exists() {
                return res_cand;
            }
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidate = dir.join("tinymist.exe");
            if candidate.exists() {
                return candidate;
            }
            let sub = dir.join("resources").join("tinymist.exe");
            if sub.exists() {
                return sub;
            }
        }
    }
    let local_tools = PathBuf::from("tools/tinymist.exe");
    if local_tools.exists() {
        return local_tools;
    }
    PathBuf::from("tinymist")
}

#[tauri::command]
pub fn lsp_start(
    app: AppHandle,
    state: State<'_, AppState>,
    on_message: Channel<String>,
) -> Result<(), String> {
    let mut lsp_guard = state.lsp.lock().map_err(|e| e.to_string())?;
    stop_process(&mut lsp_guard);

    let bin = tinymist_path(Some(&app));
    let mut cmd = Command::new(&bin);
    cmd.arg("lsp")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn tinymist from {:?}: {}", bin, e))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Failed to capture stdin for tinymist".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture stdout for tinymist".to_string())?;

    *lsp_guard = Some(LspProcess { child, stdin });
    drop(lsp_guard);

    let app_handle = app.clone();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            match read_message(&mut reader) {
                Ok(Some(msg)) => {
                    if on_message.send(msg).is_err() {
                        break;
                    }
                }
                Ok(None) => {
                    break;
                }
                Err(e) => {
                    eprintln!("LSP reader error: {}", e);
                    break;
                }
            }
        }
        let _ = app_handle.emit("lsp-exit", ());
    });

    Ok(())
}

#[tauri::command]
pub fn lsp_send(state: State<'_, AppState>, message: String) -> Result<(), String> {
    let mut lsp_guard = state.lsp.lock().map_err(|e| e.to_string())?;
    let proc = lsp_guard.as_mut().ok_or_else(|| "LSP_NOT_RUNNING".to_string())?;
    write_message(&mut proc.stdin, &message).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn lsp_stop(state: State<'_, AppState>) -> Result<(), String> {
    let mut lsp_guard = state.lsp.lock().map_err(|e| e.to_string())?;
    stop_process(&mut lsp_guard);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tinymist_path_finds_local_tools() {
        let path = tinymist_path(None);
        assert!(path.to_string_lossy().contains("tinymist"));
    }
}
