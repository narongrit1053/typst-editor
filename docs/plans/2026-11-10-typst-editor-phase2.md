# Typst-Editor by Kong — Phase 2 (Multi-file Comfort) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the single-file MVP into a multi-file editor with a file tree, outline navigation, main-file pinning, quick file search, document formatting, settings/themes, and bidirectional sync between editor and preview.

**Architecture:** Tauri 2 backend manages extended guarded filesystem operations (directory trees, CRUD, settings storage). Frontend UI adds a collapsible left sidebar (Files tree + Document outline), settings modal, and quick-open palette. Tinymist LSP services provide formatting (`textDocument/formatting`), document symbols (`textDocument/documentSymbol`), and main-file pinning (`tinymist.pinMain`).

**Tech Stack:** Tauri 2, Rust (`std::fs`, `serde_json`, `tauri`), TypeScript, Vite, Vitest, CodeMirror 6 (`@codemirror/search`, `@codemirror/lsp-client`, `@codemirror/view`).

**Spec:** `docs/typst-desk-plan.html` (Phase 2 in section 8, section 4 "main file", section 5 "Interface design").

---

## Global Constraints

- Windows 11 only.
- Window title: `Typst-Editor by Kong`. Tauri identifier: `com.kong.typst-editor`.
- No heavy UI frameworks. Plain TypeScript modules and lightweight DOM components.
- Guarded file operations: all file reads, writes, creations, and deletions are strictly restricted to within the currently opened project root (`resolve_inside`).
- App settings stored locally in app data dir or `<user-config>/typst-editor/settings.json`.
- Light / dark / system theme support respecting `prefers-color-scheme` or user settings.
- Pinning a main file sets Tinymist entry (`tinymist.pinMain`) and updates the preview target.

## Review Focus

1. **Path traversal during file creation/rename:** `../../` in file names must be rejected by `resolve_inside`. -> Task 1.
2. **Deleting or renaming the active or pinned file:** Handled gracefully without crash or stale handles. -> Task 3.
3. **Outline parsing for deeply nested or empty headings:** Empty document or invalid Typst syntax must not crash outline panel. -> Task 5.
4. **Formatting unsaved dirty documents:** Preserves cursor position and dirty state without data loss. -> Task 6.
5. **External file modification:** Conflicting external disk changes prompt user to reload or keep current edits. -> Task 8.

---

## File Structure

| Path | Responsibility |
|---|---|
| `src-tauri/src/commands.rs` | Extended file CRUD: `list_dir`, `create_file`, `create_dir`, `rename_file`, `delete_file`, `get_settings`, `save_settings`. |
| `src/settings.ts` | Theme switching, font size, recent folders management, settings modal. |
| `src/files.ts` | File tree UI, context menu (new, rename, delete, pin main), folder open handler. |
| `src/outline.ts` | Fetches `textDocument/documentSymbol` from LSP, renders heading hierarchy, click-to-jump. |
| `src/quick_open.ts` | Ctrl+P modal palette with fuzzy filtering over workspace files. |
| `src/editor.ts` | Format document command, search panel binding, jump-to-source hooks. |
| `src/preview.ts` | Zoom controls (`Ctrl + / -`), scroll synchronization. |
| `src/main.ts` | Layout integration: sidebar toggle (Ctrl+B), toolbar controls, keyboard shortcut coordination. |
| `docs/smoke-phase2.md` | Phase 2 manual smoke checklist. |

---

# Phase 2 Tasks

### Task 1: Extended Guarded Filesystem & Settings Commands

**Files:**
- Modify: `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`
- Test: tests in `src-tauri/src/commands.rs`

**Interfaces:**
- Produces:
  - `pub struct FileEntry { name: String, path: String, is_dir: bool, children: Option<Vec<FileEntry>> }`
  - `pub fn list_dir(state, path: String) -> Result<Vec<FileEntry>, String>`
  - `pub fn create_file(state, path: String) -> Result<(), String>`
  - `pub fn create_dir(state, path: String) -> Result<(), String>`
  - `pub fn rename_path(state, old_path: String, new_path: String) -> Result<(), String>`
  - `pub fn delete_path(state, path: String) -> Result<(), String>`
  - `pub fn load_app_settings(app: AppHandle) -> Result<String, String>`
  - `pub fn save_app_settings(app: AppHandle, settings_json: String) -> Result<(), String>`

- [ ] **Step 1:** Write failing tests in `src-tauri/src/commands.rs` for `create_file`, `rename_path`, `delete_path`, and `list_dir` preventing path traversal.
- [ ] **Step 2:** Run `cargo test --manifest-path src-tauri/Cargo.toml` to verify failure.
- [ ] **Step 3:** Implement commands with `resolve_inside` checks and settings storage in Tauri's app config directory.
- [ ] **Step 4:** Run `cargo test` to verify all pass.
- [ ] **Step 5:** Register commands in `src-tauri/src/lib.rs`. Commit: `feat: filesystem CRUD and settings commands`.

---

### Task 2: Settings, Themes, and Font Size

**Files:**
- Create: `src/settings.ts`, `src/settings.test.ts`
- Modify: `src/styles.css`, `src/main.ts`, `index.html`

**Interfaces:**
- Produces:
  - `export interface AppSettings { theme: "light" | "dark" | "system"; fontSize: number; autosave: boolean; recentFolders: string[]; mainPins: Record<string, string> }`
  - `export function applyTheme(theme: "light" | "dark" | "system"): void`
  - `export function loadSettings(): Promise<AppSettings>`
  - `export function saveSettings(settings: AppSettings): Promise<void>`
  - `export function initSettingsModal(onSave: (s: AppSettings) => void): void`

- [ ] **Step 1:** Write failing tests in `src/settings.test.ts` for default settings fallback and theme class application.
- [ ] **Step 2:** Run `npm test` to verify failure.
- [ ] **Step 3:** Implement `src/settings.ts` with CSS custom property overrides for font size and data-theme attributes.
- [ ] **Step 4:** Add Settings modal UI in `index.html` and wire Settings gear button (`⚙`) in `src/main.ts`.
- [ ] **Step 5:** Verify with `npm test` and `npm run build`. Commit: `feat: settings modal and theme support`.

---

### Task 3: Sidebar & File Tree with CRUD and Pinning

**Files:**
- Create: `src/files.ts`, `src/files.test.ts`
- Modify: `index.html`, `src/styles.css`, `src/main.ts`

**Interfaces:**
- Produces:
  - `export function renderFileTree(container: HTMLElement, rootDir: string, onSelect: (path: string) => void, onPinMain: (path: string) => void): Promise<void>`
  - `export function toggleSidebar(): void`
  - Pin indicator (`📌`) for pinned main file.

- [ ] **Step 1:** Add sidebar structure (`#sidebar`, `#file-tree`, `#outline-tree`) in `index.html` and `#splitter-side` or flex sizing.
- [ ] **Step 2:** Write tests in `src/files.test.ts` for building hierarchical directory models and sorting (directories first, then `.typ` files).
- [ ] **Step 3:** Implement `src/files.ts` with file creation (+ file / + folder), rename, delete confirmation, and right-click "Set as main file" (`tinymist.pinMain`).
- [ ] **Step 4:** Wire `Ctrl+B` shortcut and open-folder workflow in `src/main.ts`.
- [ ] **Step 5:** Verify with `npm test` and `npm run build`. Commit: `feat: sidebar file tree and main-file pin`.

---

### Task 4: Quick Open Modal (Ctrl+P)

**Files:**
- Create: `src/quick_open.ts`, `src/quick_open.test.ts`
- Modify: `index.html`, `src/styles.css`, `src/main.ts`

**Interfaces:**
- Produces:
  - `export function filterFiles(files: string[], query: string): string[]`
  - `export function showQuickOpen(files: string[], onSelect: (path: string) => void): void`

- [ ] **Step 1:** Write failing tests in `src/quick_open.test.ts` for fuzzy matching file paths.
- [ ] **Step 2:** Implement `filterFiles` scoring and `showQuickOpen` modal dialog.
- [ ] **Step 3:** Wire `Ctrl+P` shortcut to collect workspace files, display modal, and open selection.
- [ ] **Step 4:** Verify with `npm test` and `npm run build`. Commit: `feat: quick open file palette`.

---

### Task 5: Document Outline (Symbols Hierarchy)

**Files:**
- Create: `src/outline.ts`, `src/outline.test.ts`
- Modify: `index.html`, `src/styles.css`, `src/main.ts`

**Interfaces:**
- Produces:
  - `export interface OutlineItem { title: string; level: number; line: number; col: number; children?: OutlineItem[] }`
  - `export function parseOutlineSymbols(symbols: any[]): OutlineItem[]`
  - `export function renderOutline(container: HTMLElement, items: OutlineItem[], onSelect: (item: OutlineItem) => void): void`

- [ ] **Step 1:** Write failing tests in `src/outline.test.ts` for converting LSP document symbols into nested heading items.
- [ ] **Step 2:** Implement `src/outline.ts` and fetch `textDocument/documentSymbol` periodically or on document change.
- [ ] **Step 3:** Render outline in sidebar under `#outline-tree`; click jumps editor to corresponding line/column.
- [ ] **Step 4:** Verify with `npm test` and `npm run build`. Commit: `feat: document outline from lsp symbols`.

---

### Task 6: Document Formatting & Find/Replace

**Files:**
- Modify: `src/editor.ts`, `src/main.ts`, `src-tauri/capabilities/default.json`

**Interfaces:**
- Produces:
  - `export async function formatDocument(editor: EditorHandle, lsp: LspConnection): Promise<void>`
  - Format toolbar button & `Shift+Alt+F` shortcut.
  - Find (`Ctrl+F`) and Replace (`Ctrl+H`) triggering CodeMirror search panel.

- [ ] **Step 1:** Implement `formatDocument` in `src/editor.ts` using LSP `textDocument/formatting`, applying edits without losing cursor position.
- [ ] **Step 2:** Wire Format button in toolbar and `Shift+Alt+F` shortcut in `src/main.ts`.
- [ ] **Step 3:** Ensure CodeMirror search keymaps (`openSearchPanel`) activate properly on Ctrl+F and Ctrl+H.
- [ ] **Step 4:** Verify with `npm test` and `npm run build`. Commit: `feat: formatting and search integration`.

---

### Task 7: Preview Zoom and Sync Relay

**Files:**
- Modify: `src/preview.ts`, `src/main.ts`, `index.html`

**Interfaces:**
- Produces:
  - Zoom controls in toolbar (`-`, `100%`, `+`, Fit width) via iframe CSS scale or Tinymist preview messages.
  - Preview jump listener: click on preview jumps editor cursor (`window.addEventListener("message")`).
  - Editor jump trigger: `tinymist.scrollPreview` or editor position notifications.

- [ ] **Step 1:** Add zoom buttons in toolbar (`#btn-zoom-out`, `#btn-zoom-reset`, `#btn-zoom-in`).
- [ ] **Step 2:** Implement zoom level state in `src/preview.ts`.
- [ ] **Step 3:** Listen for Tinymist preview iframe messages (`postMessage`) for click-to-source jumps.
- [ ] **Step 4:** Verify with `npm run build`. Commit: `feat: preview zoom and bidirectional sync`.

---

### Task 8: External File Change Detection and Phase 2 Smoke Checklist

**Files:**
- Create: `docs/smoke-phase2.md`
- Modify: `src/main.ts`

- [ ] **Step 1:** Add check on window focus or file reload: if disk content changed and editor is clean, auto-reload; if dirty, prompt "Reload from disk / Keep mine".
- [ ] **Step 2:** Create `docs/smoke-phase2.md` comprehensive checklist covering all Phase 2 features.
- [ ] **Step 3:** Run full test suite (`cargo test` and `npm test`) and complete smoke checklist.
- [ ] **Step 4:** Commit: `feat: external change handling; docs: phase 2 smoke checklist`.
