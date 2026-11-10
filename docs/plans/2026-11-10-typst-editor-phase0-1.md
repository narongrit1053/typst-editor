# Typst-Editor by Kong — Phase 0 (spike) + Phase 1 (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Windows desktop app where you open a `.typ` file, type on the left, see the page update on the right, get Tinymist autocomplete and error squiggles, and export a PDF.

**Architecture:** Tauri 2 window (plain TypeScript + Vite, CodeMirror 6) with a small Rust backend that spawns `tinymist.exe`, relays LSP messages over stdio, guards file access to the opened folder, and runs `typst compile` for export. The preview is Tinymist's own preview server shown in an iframe on `127.0.0.1`.

**Tech Stack:** Tauri 2, Rust (std only + tauri + tauri-plugin-dialog), TypeScript, Vite, Vitest, CodeMirror 6 + `@codemirror/lsp-client`, Tinymist (pinned release), Typst CLI 0.15.1.

**Spec:** `docs/typst-desk-plan.html` (sections 1–7, phases 0 and 1 of section 8, risks in section 9).

**Not in this plan:** Phase 2 (file tree, outline, jump, format, settings), Phase 3 (installer), Phase 4 (updates), Phase 5 (template market). Each gets its own plan after Phase 1 works, because their details depend on what Phase 0 finds.

## Global Constraints

- Windows 11 only. No macOS/Linux work.
- App name and window title: `Typst-Editor by Kong`. Tauri identifier: `com.kong.typst-editor`.
- No UI framework. Plain TypeScript modules.
- One file open at a time.
- Autosave on, 1000 ms after the last keystroke.
- The backend reads/writes only inside the opened file's folder ("root").
- Preview server and websocket bind to `127.0.0.1` only. No remote hosts in Phase 1.
- Export uses the installed `typst` CLI (0.15.1). Preview uses Tinymist's embedded compiler.
- Ship no fonts. If `<root>/fonts` exists, pass it as a font path.
- Never discard unsaved text on any failure.
- **Unverified API names:** the Tinymist preview start command, the `@codemirror/lsp-client` API shape, and the Typst syntax-colour source are *not confirmed*. Task 2 confirms them and writes `docs/spike-findings.md`. Tasks 7 and 8 must follow that file, not this plan's guesses.
- Deviation from spec, deliberate: Phase 1 opens a **file** (root = its folder) rather than a folder, because the file tree is Phase 2.

## Review Focus

Inputs the spec implies but does not spell out, most likely first. Each has a test in the task named.

1. **Paths with spaces or Thai characters** (`D:\งาน\my doc.typ`) must open, preview and export. → Task 7 (`pathToUri` test), Task 11 (args are `OsString`, never joined into a shell string).
2. **Non-ASCII text in LSP messages** (Thai document body): `Content-Length` counts bytes, not characters. → Task 4.
3. **Save fails** (read-only file, disk full): text stays in the editor, file stays marked unsaved, error shown. → Task 9.
4. **CRLF files** must not be silently rewritten to LF on save. → Task 9.
5. **Fast typing during a slow save**: two saves must never overlap or write stale text last. → Task 9.

## File Structure

| Path | Responsibility |
|---|---|
| `spike/` | Throwaway Phase 0 code. Deleted in Task 3. |
| `docs/spike-findings.md` | Verified facts Phase 1 depends on. |
| `tools/tinymist.exe` | Pinned Tinymist binary for development (git-ignored). |
| `index.html`, `src/styles.css` | Static window layout. |
| `src/main.ts` | Wires modules together, toolbar, shortcuts, splitter. |
| `src/lsp.ts` | `pathToUri`, LSP transport over Tauri, restart-once logic. |
| `src/editor.ts` | CodeMirror setup + LSP client. |
| `src/preview.ts` | Preview iframe start/stop. |
| `src/document.ts` | Open/save, dirty state, autosave, line endings. |
| `src/problems.ts` | Problems panel + status bar. |
| `src-tauri/src/lsp_frame.rs` | LSP message framing (pure, tested). |
| `src-tauri/src/lsp_bridge.rs` | Tinymist process + relay commands. |
| `src-tauri/src/commands.rs` | Root guard, read/write file, export. |
| `src-tauri/src/lib.rs` | State, command registration, kill-on-exit. |
| `docs/smoke-phase1.md` | Manual smoke checklist. |

---

# Phase 0 — Feasibility spike (throwaway)

### Task 1: Repository and Tinymist binary

**Files:**
- Create: `.gitignore`, `tools/README.md`, `docs/spike-findings.md`

**Interfaces:**
- Produces: `tools/tinymist.exe`; `docs/spike-findings.md` with the headings `## Versions`, `## Preview`, `## Editor LSP client`, `## Syntax colours`, `## Decision`.

- [ ] **Step 1:** `git init` in `D:\Try\Typst`. `.gitignore`: `node_modules/`, `dist/`, `target/`, `tools/*.exe`, `spike/`.
- [ ] **Step 2:** Ask the user to approve downloading the Windows x64 Tinymist executable from the official `Myriad-Dreamin/tinymist` GitHub Releases page (state filename and size). Pick the newest release whose notes say it is built on Typst 0.15.x. Save as `tools/tinymist.exe`. Record the release tag and URL in `tools/README.md`.
- [ ] **Step 3:** Run `tools\tinymist.exe --version` and `tools\tinymist.exe preview --help`. Paste both outputs under `## Versions` and `## Preview` in `docs/spike-findings.md`. Expected: a version line, and a help text listing the preview options (host/port and "do not open browser" flags).
- [ ] **Step 4:** If the embedded Typst version differs from 0.15.1, write that under `## Versions` in bold. Do not stop; it is a known risk.
- [ ] **Step 5:** Commit: `chore: init repo, pin tinymist`.

### Task 2: Prove the three risky links

**Files:**
- Create: `spike/` (a `npm create tauri-app@latest` vanilla-ts project), a sample `spike/sample/main.typ` containing a heading, `$E = m c^2$`, one Thai sentence and a `#table` call.
- Modify: `docs/spike-findings.md`

**Interfaces:**
- Produces: the filled-in findings file. For each heading, the exact working call, copied from code that ran:
  - `## Preview` — how the preview was started (LSP `workspace/executeCommand` name + arguments, or `tinymist preview` CLI arguments), the URL to load in the iframe, whether it updates on unsaved edits, the CSP that was needed.
  - `## Editor LSP client` — package versions, the exact transport interface the package expects, the calls used to attach it to an editor.
  - `## Syntax colours` — which source worked (Tinymist semantic tokens through the client, or a named community CodeMirror grammar), or "none".
  - `## Decision` — GO, or which fallback from spec section 9 applies.

- [ ] **Step 1 (link a):** In the spike backend, spawn `tools/tinymist.exe lsp`, write an LSP `initialize` request to its stdin, print the response. Pass: a JSON response containing `capabilities.completionProvider`.
- [ ] **Step 2 (link b):** Add CodeMirror 6 and `@codemirror/lsp-client`. Read the package README for the transport interface; relay through two Tauri commands. Open `sample/main.typ`. Pass: typing `#ta` shows a popup containing `table`; hovering `table` shows documentation; deleting a closing bracket shows an error underline.
- [ ] **Step 3 (link c):** Start the preview the way `## Preview` help text and Tinymist docs describe (try the LSP command first so unsaved edits flow; fall back to the `tinymist preview` process). Load its URL in an iframe. Pass: the page renders; typing in the editor *without saving* updates it in under one second; Thai text renders.
- [ ] **Step 4:** Check highlighting: are Typst keywords coloured? If not, try a community CodeMirror Typst grammar. Record the result.
- [ ] **Step 5:** Fill in all headings in `docs/spike-findings.md`. Under `## Decision` write GO or the fallback.
- [ ] **Step 6:** Commit the findings file only. **STOP and show the findings to the user. Phase 1 starts only after they say go.** If link c failed, Task 8 is rewritten around the fallback before continuing.

---

# Phase 1 — Usable editor (MVP)

### Task 3: App skeleton and window layout

**Files:**
- Create: project at repo root via `npm create tauri-app@latest` (vanilla-ts): `package.json`, `index.html`, `src/main.ts`, `src/styles.css`, `src-tauri/**`
- Delete: `spike/`

**Interfaces:**
- Produces: these element ids in `index.html`, used by later tasks: `#toolbar`, `#file-name`, `#btn-open`, `#btn-export`, `#editor`, `#splitter`, `#preview` (an `<iframe>`), `#problems`, `#status-state`, `#status-pos`, `#banner`.
- Produces: `src-tauri/src/lib.rs` with `pub struct AppState { pub root: Mutex<Option<PathBuf>>, pub lsp: Mutex<Option<LspProcess>> }` managed by Tauri (`LspProcess` arrives in Task 5; use a placeholder unit struct until then).

- [ ] **Step 1:** Scaffold. Set `productName` and window title to `Typst-Editor by Kong`, identifier `com.kong.typst-editor`, window 1280×800.
- [ ] **Step 2:** Add `vitest` as a dev dependency and `"test": "vitest run"` to `package.json`.
- [ ] **Step 3:** Write the layout: toolbar on top; editor and preview side by side with a draggable `#splitter` (pointer events, min 20% each side); `#problems` below, hidden when empty; status bar at the bottom; `#banner` hidden. Light/dark via `prefers-color-scheme`. All buttons are real `<button>` elements with visible focus.
- [ ] **Step 4:** Set the CSP in `tauri.conf.json` to the value recorded in `docs/spike-findings.md` → `## Preview`.
- [ ] **Step 5:** Verify: `npm run tauri dev` opens the window with the title above; dragging the splitter resizes both panes; `npm run build` exits 0.
- [ ] **Step 6:** Commit: `feat: app skeleton and layout`.

### Task 4: LSP message framing

**Files:**
- Create: `src-tauri/src/lsp_frame.rs` (tests in the same file)

**Interfaces:**
- Produces:
  - `pub fn read_message<R: BufRead>(r: &mut R) -> io::Result<Option<String>>` — reads headers until a blank line, then exactly `Content-Length` bytes; `Ok(None)` on clean EOF before any header.
  - `pub fn write_message<W: Write>(w: &mut W, body: &str) -> io::Result<()>` — writes `Content-Length: <bytes>\r\n\r\n<body>` and flushes.

- [ ] **Step 1: Write the failing tests**

```rust
#[test] fn reads_two_back_to_back() {
    let mut r = Cursor::new(b"Content-Length: 2\r\n\r\n{}Content-Length: 4\r\n\r\nnull".to_vec());
    assert_eq!(read_message(&mut r).unwrap(), Some("{}".into()));
    assert_eq!(read_message(&mut r).unwrap(), Some("null".into()));
    assert_eq!(read_message(&mut r).unwrap(), None);
}
#[test] fn length_is_bytes_not_chars() {
    let body = "\"งาน\"";                       // 11 bytes, 5 chars
    let mut out = Vec::new();
    write_message(&mut out, body).unwrap();
    assert!(out.starts_with(b"Content-Length: 11\r\n\r\n"));
    assert_eq!(read_message(&mut Cursor::new(out)).unwrap(), Some(body.into()));
}
#[test] fn ignores_other_headers_and_case() {
    let mut r = Cursor::new(b"Content-Type: x\r\ncontent-length: 2\r\n\r\n{}".to_vec());
    assert_eq!(read_message(&mut r).unwrap(), Some("{}".into()));
}
#[test] fn truncated_body_is_an_error() {
    let mut r = Cursor::new(b"Content-Length: 10\r\n\r\n{}".to_vec());
    assert!(read_message(&mut r).is_err());
}
#[test] fn missing_length_is_an_error() {
    let mut r = Cursor::new(b"Content-Type: x\r\n\r\n{}".to_vec());
    assert!(read_message(&mut r).is_err());
}
```

- [ ] **Step 2:** Run `cargo test --manifest-path src-tauri/Cargo.toml lsp_frame`. Expected: compile failure, functions not defined.
- [ ] **Step 3:** Implement both functions.
- [ ] **Step 4:** Run the same command. Expected: 5 passed.
- [ ] **Step 5:** Commit: `feat: LSP message framing`.

### Task 5: Tinymist process and relay

**Files:**
- Create: `src-tauri/src/lsp_bridge.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `read_message`, `write_message` (Task 4); `AppState` (Task 3).
- Produces Tauri commands:
  - `lsp_start(state, on_message: tauri::ipc::Channel<String>) -> Result<(), String>` — stops any running instance, spawns Tinymist in LSP mode with piped stdio and no console window, starts a reader thread that sends each message body to `on_message`. When the reader hits EOF or an error it emits the app event `lsp-exit` (no payload).
  - `lsp_send(state, message: String) -> Result<(), String>` — frames and writes to stdin; `Err("LSP_NOT_RUNNING")` if none.
  - `lsp_stop(state) -> Result<(), String>` — kills the child; idempotent.
- Produces: `pub struct LspProcess` (child handle + stdin). `pub fn tinymist_path() -> PathBuf`: env var `TYPST_EDITOR_TINYMIST` if set, else `tinymist.exe` beside the app executable if it exists, else `tools/tinymist.exe` relative to the current directory, else `tinymist` (PATH).

- [ ] **Step 1:** Implement the three commands and `tinymist_path`. Stderr of Tinymist goes to the app's stderr.
- [ ] **Step 2:** In `lib.rs`, register the commands and kill the child on `RunEvent::Exit`.
- [ ] **Step 3:** Verify by hand in `npm run tauri dev`, from the webview devtools console: call `lsp_start`, send an `initialize` request with `lsp_send`, and see a response arrive on the channel. Then end `tinymist.exe` in Task Manager; an `lsp-exit` event must fire. Close the app; `tinymist.exe` must be gone from Task Manager.
- [ ] **Step 4:** Commit: `feat: tinymist bridge`.

### Task 6: Root guard and file commands

**Files:**
- Create: `src-tauri/src/commands.rs` (tests in the same file)
- Modify: `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml` (add `tauri-plugin-dialog`; `tempfile` as dev-dependency), `package.json` (`@tauri-apps/plugin-dialog`)

**Interfaces:**
- Produces:
  - `pub fn resolve_inside(root: &Path, candidate: &Path) -> Result<PathBuf, String>` — canonicalises `root` and `candidate` (for a file that does not exist yet, canonicalise its parent and re-append the file name); `Err("OUTSIDE_ROOT")` unless the result is `root` or beneath it by **path components**.
  - Commands: `set_root(state, path: String) -> Result<(), String>`; `read_file(state, path: String) -> Result<String, String>`; `write_file(state, path: String, contents: String) -> Result<(), String>` — writes to `<name>.tmp` in the same folder then renames over the target, so a failed write never truncates the original.
  - Errors are strings: `OUTSIDE_ROOT`, `NO_ROOT`, or the OS error text.

- [ ] **Step 1: Write the failing tests** (use `tempfile::tempdir()`; create `proj/`, `proj/sub/a.typ`, `proj2/b.typ`)

```rust
assert!(resolve_inside(&proj, &proj.join("sub/a.typ")).is_ok());
assert!(resolve_inside(&proj, &proj.join("new.typ")).is_ok());               // not yet existing
assert_eq!(resolve_inside(&proj, &proj.join("../proj2/b.typ")), Err("OUTSIDE_ROOT".into()));
assert_eq!(resolve_inside(&proj, &proj2.join("b.typ")), Err("OUTSIDE_ROOT".into())); // sibling with same prefix
// write_file: after a successful write the file has the new contents and no .tmp remains
// write_file into a read-only target returns Err and the original contents are unchanged
```

- [ ] **Step 2:** Run `cargo test --manifest-path src-tauri/Cargo.toml commands`. Expected: fails to compile.
- [ ] **Step 3:** Implement. `read_file`/`write_file` call `resolve_inside` first.
- [ ] **Step 4:** Run tests. Expected: all pass.
- [ ] **Step 5:** Register commands and the dialog plugin. Commit: `feat: guarded file commands`.

### Task 7: Editor with autocomplete

**Files:**
- Create: `src/lsp.ts`, `src/lsp.test.ts`, `src/editor.ts`
- Modify: `src/main.ts`, `package.json` (CodeMirror packages at the versions in the findings file)

**Interfaces:**
- Consumes: commands `lsp_start`, `lsp_send`, event `lsp-exit` (Task 5); `docs/spike-findings.md` → `## Editor LSP client`, `## Syntax colours`.
- Produces:
  - `export function pathToUri(path: string): string` — Windows path to `file:///` URI, each segment percent-encoded, drive colon kept.
  - `export async function connectLsp(rootPath: string, onExit: () => void): Promise<LspConnection>` where `LspConnection` exposes the transport object in exactly the shape the findings file records, plus `request(method: string, params: unknown): Promise<unknown>` for one-off calls (used by Task 8).
  - `export function createEditor(parent: HTMLElement, lsp: LspConnection): EditorHandle` with `open(path: string, text: string): void`, `getText(): string`, `onChange(cb: () => void): void`, `onCursor(cb: (line: number, col: number) => void): void` (1-based), `jumpTo(line: number, col: number): void` (1-based), `onDiagnostics(cb: (d: Problem[]) => void): void`.
  - `export interface Problem { path: string; line: number; col: number; severity: "error" | "warning"; message: string }` (1-based line/col).

- [ ] **Step 1: Write the failing test**

```ts
expect(pathToUri("D:\\Try\\Typst\\main.typ")).toBe("file:///D:/Try/Typst/main.typ");
expect(pathToUri("D:\\งาน\\my doc.typ")).toBe("file:///D:/%E0%B8%87%E0%B8%B2%E0%B8%99/my%20doc.typ");
expect(pathToUri("C:\\a#b\\c%d.typ")).toBe("file:///C:/a%23b/c%25d.typ");
```

- [ ] **Step 2:** `npm test`. Expected: fails, `pathToUri` not defined.
- [ ] **Step 3:** Implement `pathToUri`; `npm test` passes.
- [ ] **Step 4:** Implement `connectLsp` and `createEditor` following the findings file. Editor features on: line numbers, history, search (Ctrl+F / Ctrl+H), bracket matching, completion (also Ctrl+Space), hover, signature help, diagnostics underlines, syntax colours per findings, F12 go-to-definition within the open file.
- [ ] **Step 5:** In `main.ts`: `#btn-open` shows an open-file dialog filtered to `.typ`, calls `set_root` with the file's folder, `connectLsp`, `read_file`, `editor.open`. Show the file name in `#file-name`.
- [ ] **Step 6:** Verify by hand with a file under a folder whose name contains a space and Thai characters: typing `#ta` offers `table` with docs; `#table(` shows parameter hints; a `#let foo = 1` name is offered later in the file; a syntax error gets a red underline.
- [ ] **Step 7:** Commit: `feat: editor with tinymist autocomplete`.

### Task 8: Live preview

**Files:**
- Create: `src/preview.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `LspConnection.request` (Task 7); `docs/spike-findings.md` → `## Preview` (the exact start call and URL shape).
- Produces: `export async function startPreview(frame: HTMLIFrameElement, lsp: LspConnection, mainPath: string): Promise<void>` and `export async function stopPreview(): Promise<void>` (stops the previous preview task; safe to call when none is running).

- [ ] **Step 1:** Implement both using the start/stop calls recorded in the findings file. `startPreview` calls `stopPreview` first. Host is always `127.0.0.1`.
- [ ] **Step 2:** Call `startPreview` after a file is opened; call `stopPreview` before opening another file and on window close.
- [ ] **Step 3:** Verify by hand: page appears; typing updates it in under a second with no save; introducing an error leaves the last good page visible; opening a second file switches the preview; after closing the app nothing listens on the preview port (`netstat -ano | findstr LISTENING` shows no leftover `tinymist`).
- [ ] **Step 4:** Commit: `feat: live preview`.

### Task 9: Save, autosave, unsaved-changes guard

**Files:**
- Create: `src/document.ts`, `src/document.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `write_file` (Task 6); `EditorHandle.getText`, `onChange` (Task 7).
- Produces:
  - `export function detectEol(text: string): "\r\n" | "\n"` — `"\r\n"` if the first line break is CRLF, else `"\n"`.
  - `export function withEol(text: string, eol: "\r\n" | "\n"): string` — normalises every line break to `eol`.
  - `export function createSaver(opts: { getText: () => string; write: (text: string) => Promise<void>; onState: (s: "saved" | "dirty" | "saving" | "error", err?: string) => void; delayMs?: number }): { touch(): void; saveNow(): Promise<void>; isDirty(): boolean }` — `touch()` marks dirty and (re)starts the `delayMs` timer (default 1000). Only one write runs at a time; if text changed during a write, exactly one more write follows with the latest text. A rejected write leaves the state `error` and `isDirty()` true, and the next `touch()` or `saveNow()` retries.

- [ ] **Step 1: Write the failing tests** (Vitest fake timers)

```ts
// detectEol / withEol
expect(detectEol("a\r\nb\n")).toBe("\r\n");
expect(detectEol("a\nb")).toBe("\n");
expect(detectEol("no breaks")).toBe("\n");
expect(withEol("a\nb\r\nc", "\r\n")).toBe("a\r\nb\r\nc");

// debounce: three touches 300 ms apart cause one write, 1000 ms after the last
// overlap: write #1 pending; touch() during it; resolve #1 -> exactly one more write, with the latest text
// failure: write rejects -> last onState is "error", isDirty() === true; saveNow() then resolves -> "saved", isDirty() === false
// saveNow with nothing dirty performs no write
```

- [ ] **Step 2:** `npm test`. Expected: fails, module not found.
- [ ] **Step 3:** Implement the three exports. `npm test` passes.
- [ ] **Step 4:** Wire in `main.ts`: remember `detectEol` of the text as read; `write` = `write_file(path, withEol(text, eol))`; `editor.onChange` → `touch()`; Ctrl+S → `saveNow()`; `#file-name` shows ` ●` while not `saved`; on `error` show the message in `#banner` (text is untouched).
- [ ] **Step 5:** Window close: if `isDirty()`, `await saveNow()`; if that fails, ask "Close without saving?" (dialog plugin `ask`) and only close on yes.
- [ ] **Step 6:** Verify by hand: edit, wait 1 s, file on disk changed; mark the file read-only in Explorer, edit → banner shows the error, text still there, ● stays; clear read-only, Ctrl+S → saved. A CRLF file stays CRLF (`git diff` shows only the edited line).
- [ ] **Step 7:** Commit: `feat: save and autosave`.

### Task 10: Problems panel and status bar

**Files:**
- Create: `src/problems.ts`, `src/problems.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `Problem`, `EditorHandle.onDiagnostics`, `onCursor`, `jumpTo` (Task 7).
- Produces: `export function formatProblem(p: Problem, rootPath: string): string`; `export function renderProblems(el: HTMLElement, problems: Problem[], rootPath: string, onPick: (p: Problem) => void): void`; `export function summarise(problems: Problem[]): string`.

- [ ] **Step 1: Write the failing tests**

```ts
const p = { path: "D:\\proj\\ch\\one.typ", line: 7, col: 39, severity: "error", message: "expected length" } as const;
expect(formatProblem(p, "D:\\proj")).toBe("ch\\one.typ:7:39  expected length");
expect(summarise([])).toBe("No problems");
expect(summarise([p])).toBe("1 error");
expect(summarise([p, p, { ...p, severity: "warning" }])).toBe("2 errors, 1 warning");
```

- [ ] **Step 2:** `npm test`. Expected: fails.
- [ ] **Step 3:** Implement. `renderProblems` builds one `<button>` row per problem (text set with `textContent`, never `innerHTML`), errors first; hides `el` when the list is empty.
- [ ] **Step 4:** Wire: diagnostics → `renderProblems` + `#status-state` = `summarise(...)`; clicking a row → `editor.jumpTo`; cursor → `#status-pos` = `Ln X, Col Y`.
- [ ] **Step 5:** `npm test` passes; verify by hand that an error appears in the panel, clicking it moves the cursor, fixing it hides the panel.
- [ ] **Step 6:** Commit: `feat: problems panel and status bar`.

### Task 11: Export PDF

**Files:**
- Modify: `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`, `src/main.ts`

**Interfaces:**
- Consumes: `resolve_inside`, `AppState.root` (Task 6); `saveNow` (Task 9).
- Produces:
  - `pub fn export_args(main: &Path, out: &Path, root: &Path, font_dir: Option<&Path>) -> Vec<OsString>` → `["compile", <main>, <out>, "--root", <root>]` plus `["--font-path", <font_dir>]` when `Some`.
  - Command `export_pdf(state, main: String, out: String) -> Result<(), String>` — `main` must be inside root (`out` may be anywhere, the user chose it in a save dialog); passes `<root>/fonts` as `font_dir` only if that folder exists; runs `typst` with those args, no shell, no console window. `Err("TYPST_NOT_FOUND")` if the program cannot be started; otherwise `Err(<stderr text>)` on a non-zero exit.

- [ ] **Step 1: Write the failing test**

```rust
let a = export_args(Path::new(r"D:\งาน\my doc.typ"), Path::new(r"D:\out\x.pdf"), Path::new(r"D:\งาน"), None);
assert_eq!(a, ["compile", r"D:\งาน\my doc.typ", r"D:\out\x.pdf", "--root", r"D:\งาน"].map(OsString::from));
let b = export_args(Path::new("m.typ"), Path::new("o.pdf"), Path::new("."), Some(Path::new("fonts")));
assert_eq!(&b[5..], ["--font-path", "fonts"].map(OsString::from));
```

- [ ] **Step 2:** Run `cargo test --manifest-path src-tauri/Cargo.toml export_args`. Expected: fails to compile.
- [ ] **Step 3:** Implement `export_args` and `export_pdf`; tests pass.
- [ ] **Step 4:** `#btn-export` and Ctrl+E: `await saveNow()`, show a save dialog defaulting to `<file name>.pdf` beside the source, call `export_pdf`. Success → `#status-state` shows `Exported <file>`. `TYPST_NOT_FOUND` → banner: "Typst was not found. Install it (winget install Typst.Typst) and restart the app." Other errors → banner with Typst's message.
- [ ] **Step 5:** Verify by hand: export a document in the Thai-named folder; the PDF opens and matches the preview. Temporarily rename the folder containing `typst.exe` out of PATH (or run with an empty PATH) → the not-found banner shows.
- [ ] **Step 6:** Commit: `feat: export pdf`.

### Task 12: Helper-down recovery and smoke checklist

**Files:**
- Modify: `src/lsp.ts`, `src/main.ts`
- Create: `docs/smoke-phase1.md`

**Interfaces:**
- Consumes: `connectLsp(rootPath, onExit)` (Task 7), `startPreview` (Task 8), `#banner`.

- [ ] **Step 1:** On the first `lsp-exit` within a session of the current file: reconnect, re-open the current text in the editor's LSP session, restart the preview. If `lsp-exit` fires again within 30 s of a restart, do not retry: show `#banner` "Language service stopped." with a **Restart** button that performs the same reconnect. Editing and saving keep working throughout.
- [ ] **Step 2:** Verify by hand: end `tinymist.exe` in Task Manager once → completions and preview come back within a few seconds without any prompt. End it twice quickly → banner appears; typing and Ctrl+S still work; Restart recovers.
- [ ] **Step 3:** Write `docs/smoke-phase1.md` as a checklist: open file (plain path; path with space + Thai) · type and see preview update unsaved · `#ta` completion with docs · parameter hints · error underline + Problems row + click to jump · autosave after 1 s · read-only save failure keeps text · CRLF preserved · export PDF · typst missing message · kill Tinymist once / twice · close with unsaved changes · no `tinymist.exe` left after exit.
- [ ] **Step 4:** Run the whole checklist, `npm test`, and `cargo test --manifest-path src-tauri/Cargo.toml`. All must pass. Record any failure in the checklist file instead of ticking it.
- [ ] **Step 5:** Commit: `feat: language service recovery; docs: phase 1 smoke checklist`.

---

## Spec coverage check

| Spec item (Phase 0/1) | Task |
|---|---|
| Spike links a, b, c + go/fallback gate | 1, 2 |
| Open, edit, save one file | 6, 7, 9 |
| Live preview as you type | 8 |
| Autocomplete, hover, parameter hints | 7 |
| Error squiggles + Problems list | 7, 10 |
| Export PDF, project `fonts/` folder | 11 |
| Status bar, draggable split | 3, 10 |
| Autosave 1 s, never discard edits, close prompt | 9 |
| Tinymist crash → restart once → banner | 12 |
| File access limited to root, localhost only, helpers killed on exit | 5, 6, 8, 3 (CSP) |
| LSP framing test + manual smoke checklist | 4, 12 |

**Deferred to the Phase 2 plan (in spec, not here):** file tree, main-file pin, outline, click-to-jump between panes, Format, quick open, theme switch, settings (incl. path to `typst.exe` and extra font folders), recent folders, external-change handling, Welcome screen, compile time in the status bar, preview zoom controls beyond what Tinymist's preview provides itself.
