# Phase 2 Manual Smoke Checklist (Multi-file Comfort)

- [x] **Open Folder Workflow:** User clicks "Open Folder..." (`#btn-open-folder`); Tauri `set_root` establishes workspace security sandbox; directory tree loads into `#file-tree`.
- [x] **Hierarchical File Tree & Sorting:** Directories display first in alphabetical order, followed by files; non-project directories like `.git`, `node_modules`, `target` filtered out.
- [x] **File Creation:** User clicks `+ File`, enters name (e.g. `chapter1.typ`); file created atomically via `create_file` within root, tree refreshes, and new file opens in editor.
- [x] **Folder Creation:** User clicks `+ Folder`, enters folder name; directory created via `create_dir` within root and tree refreshes.
- [x] **File Rename & Path Traversal Prevention:** Renaming active file updates tab/title and settings main pin; `resolve_inside` blocks any attempt to traverse outside project root.
- [x] **File Deletion with Confirmation:** Delete prompt warns user before removing file or folder; deleting active file resets editor gracefully without crash.
- [x] **Main File Pinning (`tinymist.pinMain`):** Pinning `main.typ` displays `📌` badge, calls Tinymist's `tinymist.pinMain` LSP command, persists pin in app settings, and directs preview server to render the pinned file even while editing other chapters.
- [x] **Quick Open Palette (`Ctrl+P`):** Pressing `Ctrl+P` displays fuzzy search modal over all workspace files; typing filters files, arrow keys navigate, Enter opens selected file.
- [x] **Document Outline Panel:** Outline requests `textDocument/documentSymbol` from LSP; headings indented by level; clicking any heading jumps editor view directly to corresponding line and column.
- [x] **Document Formatting (`Shift+Alt+F`):** User presses `Shift+Alt+F` or clicks "Format" button; invokes LSP `textDocument/formatting`; formats document cleanly without altering selection or losing edits.
- [x] **Find and Replace (`Ctrl+F`, `Ctrl+H`):** Built-in CodeMirror search panel activates cleanly for text search and batch replacement.
- [x] **Preview Zoom Controls:** Toolbar `-`, `100%`, `+` buttons and `Ctrl + / - / 0` adjust iframe zoom level smoothly between 50% and 250%.
- [x] **Bidirectional Preview Sync:** Preview iframe postMessage events routed to `onJumpToSource`; clicking in preview navigates editor to corresponding source location.
- [x] **Settings & Themes Modal:** Clicking `⚙` opens settings dialog; switches between Light, Dark, and System themes immediately updating CSS custom properties; persists to user config.
- [x] **External Disk Changes Handling:** On window focus, compares disk content with editor; clean files reload automatically; unsaved files display confirmation dialog to protect against data loss.
