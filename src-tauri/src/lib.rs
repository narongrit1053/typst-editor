use std::path::PathBuf;
use std::sync::Mutex;

pub mod lsp_frame;

pub struct LspProcess;

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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
