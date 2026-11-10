# Phase 3 Manual Smoke Checklist (Packaging & Installer)

- [x] **Bundled Tinymist Binary:** `tauri.conf.json` includes `tools/tinymist.exe` in `bundle.resources`; `tinymist_path` resolves binary relative to app resource directory, current executable directory, or local dev tools.
- [x] **File Association for `.typ`:** Configured in `tauri.conf.json` under `bundle.fileAssociations` with extension `typ`, name `Typst Document`, and role `Editor`.
- [x] **Application Icons & Windows Metadata:** Windows application icon (`icon.ico`) and multi-resolution PNG icons (32x32 to 256x256) embedded in NSIS bundle configuration.
- [x] **Multi-format Export (PDF / PNG / SVG):** Toolbar Export dropdown allows selecting PDF (`.pdf`), PNG (`.png`), and SVG (`.svg`). Typst CLI invoked with corresponding extension and font paths.
- [x] **First-run Typst Availability Check:** On launch, backend executes `check_typst`; if Typst CLI is missing, a non-intrusive banner notifies the user with instructions to install via `winget install Typst.Typst` and a direct link to configure custom paths in Settings.
- [x] **Custom Typst Path Setting:** Settings modal includes "Custom Typst Path" option, allowing users to override the system executable path; persisted to `settings.json`.
