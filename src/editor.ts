import {
  EditorView,
  keymap,
  highlightActiveLine,
  highlightActiveLineGutter,
  lineNumbers,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
} from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { lintKeymap } from "@codemirror/lint";
import { bracketMatching, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { typst } from "codemirror-lang-typst";
import {
  LSPClient,
  languageServerExtensions,
  jumpToDefinition,
  jumpToDefinitionKeymap,
  formatDocument,
  formatKeymap,
} from "@codemirror/lsp-client";

import { LspConnection, pathToUri, uriToPath } from "./lsp";

export interface Problem {
  path: string;
  line: number;
  col: number;
  severity: "error" | "warning";
  message: string;
}

export interface EditorHandle {
  open(path: string, text: string): void;
  getText(): string;
  format(): boolean;
  onChange(cb: () => void): void;
  onCursor(cb: (line: number, col: number) => void): void;
  jumpTo(line: number, col: number): void;
  jumpToRange(startLine: number, startCol: number, endLine?: number, endCol?: number): void;
  onDiagnostics(cb: (d: Problem[]) => void): void;
  destroy(): void;
}

export function createEditor(parent: HTMLElement, lsp: LspConnection | null): EditorHandle {
  let lspClient: any = null;
  let view: EditorView | null = null;
  const changeCallbacks: (() => void)[] = [];
  const cursorCallbacks: ((line: number, col: number) => void)[] = [];
  const diagnosticsCallbacks: ((d: Problem[]) => void)[] = [];

  if (lsp) {
    lspClient = new LSPClient({
      rootUri: pathToUri(lsp.rootPath),
      extensions: languageServerExtensions(),
    }).connect(lsp.transport);

    lsp.onNotification("textDocument/publishDiagnostics", (params: any) => {
      if (!params || !params.uri) return;
      const filePath = uriToPath(params.uri);
      const problems: Problem[] = (params.diagnostics || []).map((d: any) => {
        const line = (d.range?.start?.line ?? 0) + 1;
        const col = (d.range?.start?.character ?? 0) + 1;
        const severity: "error" | "warning" = d.severity === 1 ? "error" : "warning";
        return {
          path: filePath,
          line,
          col,
          severity,
          message: d.message || "Unknown error",
        };
      });

      for (const cb of diagnosticsCallbacks) {
        cb(problems);
      }
    });
  }

  const f12Keymap = keymap.of([
    {
      key: "F12",
      run: (targetView) => jumpToDefinition(targetView),
    },
  ]);

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      for (const cb of changeCallbacks) {
        cb();
      }
    }
    if (update.selectionSet || update.docChanged) {
      const pos = update.state.selection.main.head;
      const line = update.state.doc.lineAt(pos);
      const lineNum = line.number;
      const colNum = pos - line.from + 1;
      for (const cb of cursorCallbacks) {
        cb(lineNum, colNum);
      }
    }
  });

  function buildExtensions(fileUri: string) {
    const exts = [
      lineNumbers(),
      highlightActiveLineGutter(),
      history(),
      drawSelection(),
      dropCursor(),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      typst(),
      updateListener,
      f12Keymap,
      keymap.of([
        ...formatKeymap,
        ...jumpToDefinitionKeymap,
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...completionKeymap,
        ...lintKeymap,
      ]),
    ];
    if (lspClient) {
      exts.push(lspClient.plugin(fileUri));
    }
    return exts;
  }

  return {
    open(path: string, text: string) {
      const fileUri = pathToUri(path);

      if (view) {
        view.destroy();
      }
      parent.replaceChildren();

      const state = EditorState.create({
        doc: text,
        extensions: buildExtensions(fileUri),
      });

      view = new EditorView({
        state,
        parent,
      });

      for (const cb of cursorCallbacks) {
        cb(1, 1);
      }
    },

    getText(): string {
      return view ? view.state.doc.toString() : "";
    },

    format(): boolean {
      if (!view) return false;
      return formatDocument(view);
    },

    onChange(cb: () => void) {
      changeCallbacks.length = 0;
      changeCallbacks.push(cb);
    },

    onCursor(cb: (line: number, col: number) => void) {
      cursorCallbacks.push(cb);
    },

    jumpToRange(startLine: number, startCol: number, endLine?: number, endCol?: number) {
      if (!view) return;
      const doc = view.state.doc;
      const sLine = Math.max(1, Math.min(doc.lines, startLine));
      const sLineObj = doc.line(sLine);
      const sCol = Math.max(1, Math.min(sLineObj.length + 1, startCol));
      const anchor = sLineObj.from + sCol - 1;

      let head = anchor;
      if (typeof endLine === "number" && typeof endCol === "number") {
        const eLine = Math.max(1, Math.min(doc.lines, endLine));
        const eLineObj = doc.line(eLine);
        const eCol = Math.max(1, Math.min(eLineObj.length + 1, endCol));
        head = eLineObj.from + eCol - 1;
      }

      view.dispatch({
        selection: { anchor, head },
        scrollIntoView: true,
      });
      view.focus();
    },

    jumpTo(line: number, col: number) {
      this.jumpToRange(line, col, line, col);
    },

    onDiagnostics(cb: (d: Problem[]) => void) {
      diagnosticsCallbacks.push(cb);
    },

    destroy() {
      if (view) {
        view.destroy();
        view = null;
      }
    },
  };
}
