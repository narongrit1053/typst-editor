# Spike Findings (Phase 0)

## Versions

```text
tinymist 
Build Timestamp:     2026-11-03T06:25:46.048922800Z
Build Git Describe:  v0.15.12
Commit SHA:          9681433b09c3ae15b9794a42a399fecec0aa0747
Commit Date:         None
Commit Branch:       None
Cargo Target Triple: x86_64-pc-windows-msvc
Typst Version:       0.15.1
Typst Source:        git+https://github.com/Myriad-Dreamin/typst.git?tag=tinymist/v0.15.1#59b5999da8e74e74583069408d2564fc1f9bc973
```

Typst CLI version installed on system:
```text
typst 0.15.1 (9dfd3a08)
```
Embedded Typst version matches the installed 0.15.1 exactly.

## Preview

`tinymist preview --help`:
```text
Run preview server

Usage: tinymist.exe preview [OPTIONS] [INPUT]

Arguments:
  [INPUT]
          Specify the path to input Typst file. If the path is relative, it will be resolved
          relative to the current working directory (PWD)

Options:
      --format <FORMAT>
          Configure the preview output format. [default: paged]
      --preview-mode <MODE>
          Configure the preview mode [default: document]
      --page-title <TITLE>
          Set the preview page title.
      --partial-rendering <ENABLE_PARTIAL_RENDERING>
          Only render visible part of the document.
      --invert-colors <INVERT_COLORS>
          Configure the way to invert colors of the preview.
      --root <DIR>
          Configure the project root (for absolute paths)
      --font-path <DIR>
          Add additional directories that are recursively searched for fonts.
      --ignore-system-fonts
          Ensure system fonts won't be searched, unless explicitly included via `--font-path`
      --package-path <DIR>
          Specify a custom path to local packages
      --package-cache-path <DIR>
          Specify a custom path to package cache
      --pdf-standard <STANDARD>
          Specify the PDF standards that Typst will enforce conformance with.
      --no-pdf-tags
          By default, even when not producing a `PDF/UA-1` document, a tagged PDF document is written
      --ppi <PPI>
          Specify the PPI (pixels per inch) to use for PNG export [default: 144]
      --features <FEATURES>
          Enable in-development features
      --input <key=value>
          Add a string key-value pair visible through `sys.inputs`.
      --cert <CERT_PATH>
          Specify the path to CA certificate file for network access
      --host <HOST>
          (Deprecated) Configure (File) Host address for the preview server.
      --open
          Open the preview in the browser after compilation.
      --no-open
          Don't open the preview in the browser after compilation.
      --verbose
          Emit INFO level logging. The default is WARN
  -h, --help
          Print help
```

LSP Preview Command:
- Start command: `workspace/executeCommand` with `command: "tinymist.doStartPreview"` and `arguments: [["--no-open", filePath]]`.
- Returns response:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "dataPlanePort": 23625,
    "isPrimary": true,
    "staticServerAddr": "127.0.0.1:23625",
    "staticServerPort": 23625
  }
}
```
- Stop command: `workspace/executeCommand` with `command: "tinymist.doKillPreview"` and `arguments: ["default_preview"]`.
- URL to load in iframe: `http://127.0.0.1:<staticServerPort>/`
- Updates on unsaved edits: Yes! Tinymist compiles from in-memory text document updates (`textDocument/didChange`).
- CSP required in `tauri.conf.json`:
`"default-src 'self'; frame-src 'self' http://127.0.0.1:* ws://127.0.0.1:*; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*;"`

## Editor LSP client

- Package: `@codemirror/lsp-client` v6.3.0
- Transport interface:
```ts
interface Transport {
  send(message: string): void;
  subscribe(handler: (value: string) => void): void;
  unsubscribe(handler: (value: string) => void): void;
}
```
- Attached to editor via:
```ts
const client = new LSPClient({ extensions: languageServerExtensions() }).connect(transport);
// in EditorView extensions:
client.plugin(fileUri)
```

## Syntax colours

- `codemirror-lang-typst` v0.6.0 provides full Lezer-based syntax highlighting, syntax tree, and language support for Typst in CodeMirror 6.

## Decision

**GO.** All three links (LSP communication, CodeMirror autocomplete/hover, Tinymist live preview with unsaved edits) are verified and working cleanly.
