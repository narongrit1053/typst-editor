use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

pub mod commands;
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
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            root: Mutex::new(None),
            lsp: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            lsp_bridge::lsp_start,
            lsp_bridge::lsp_send,
            lsp_bridge::lsp_stop,
            commands::set_root,
            commands::read_file,
            commands::write_file,
            commands::list_dir,
            commands::create_file,
            commands::create_dir,
            commands::rename_path,
            commands::delete_path,
            commands::load_app_settings,
            commands::save_app_settings,
            commands::export_pdf,
            commands::export_file,
            commands::check_typst,
            commands::check_app_update,
            commands::download_and_launch_installer,
            commands::fetch_template_catalog,
            commands::create_from_template,
            commands::save_as_my_template,
            commands::list_my_templates,
            commands::use_my_template,
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
