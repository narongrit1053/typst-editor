# Phase 1 Manual Smoke Checklist

- [x] **Open file (plain path):** Opened a `.typ` file; filename displayed in toolbar and content loaded in CodeMirror editor.
- [x] **Open file (path with spaces & Thai characters):** Tested `resolve_inside`, `pathToUri`, and file commands with `D:\งาน\my doc.typ`.
- [x] **Live preview updates unsaved:** `tinymist.doStartPreview` connects iframe to `127.0.0.1:<port>`; incremental compilation on in-memory edits.
- [x] **Autocomplete with docs (`#ta`):** CodeMirror autocomplete triggers Tinymist LSP completions with documentation popup.
- [x] **Parameter hints:** Signature help triggered on `(`, `,`, `:`.
- [x] **Error underlines and Problems panel:** Diagnostics from `textDocument/publishDiagnostics` show red squiggles and populate `#problems-list`; clicking an item jumps to line/col.
- [x] **Autosave after 1s:** `createSaver` debounces edits to 1000ms and updates `#file-name` dirty dot indicator.
- [x] **Read-only save failure protection:** Verified via unit test that atomic write failure never truncates or loses text in editor; banner shows error.
- [x] **Line endings preserved:** Verified via unit test that CRLF files remain CRLF and LF files remain LF.
- [x] **Export PDF:** Calls `typst compile` with OsString arguments and `--root`; tested with non-ASCII paths and font directories.
- [x] **Typst missing message:** Returns `TYPST_NOT_FOUND` and prompts user with winget install instructions.
- [x] **Helper-down auto-recovery:** Single crash triggers automatic reconnect and state restoration; repeated crash within 30s surfaces banner with manual Restart button.
- [x] **Close with unsaved changes:** `onCloseRequested` attempts save and prompts user confirmation before closing if save fails.
- [x] **No leftover processes on exit:** Tauri `RunEvent::Exit` and `beforeunload` kill child `tinymist.exe` and stop preview server.
