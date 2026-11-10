use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

pub mod lsp_bridge;
pub mod lsp_frame;

use lsp_bridge::LspProcess;

pub struct AppState {
    pub root: Mutex<Option<PathBuf>>,
    pub lsp: Mutex<Option<LspProcess>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            root: Mutex::new(None),
            lsp: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            lsp_bridge::lsp_start,
            lsp_bridge::lsp_send,
            lsp_bridge::lsp_stop,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<AppState>();
                if let Ok(mut lsp_guard) = state.lsp.lock() {
                    lsp_bridge::stop_process(&mut lsp_guard);
                };
            }
        });
}
