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
  Decoration,
  DecorationSet,
} from "@codemirror/view";
import { EditorState, Compartment, StateEffect, StateField } from "@codemirror/state";
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

export function fixRawTextWhitespace(text: string): string {
  return text.replace(/(^|[^`])```([^\s\n`][^`\n]*```)/g, "$1``` $2");
}

// Orange fade on the jump target (preview -> editor). A fresh data-n per flash makes
// CodeMirror rebuild the DOM so the CSS animation restarts on repeated jumps.
const setFlash = StateEffect.define<{ from: number; to: number; n: number } | null>();
const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setFlash)) continue;
      if (!e.value) {
        deco = Decoration.none;
        continue;
      }
      const { from, to, n } = e.value;
      const attrs = { class: "cm-jump-flash", attributes: { "data-n": String(n) } };
      deco = Decoration.set([
        // Line decorations must sit at the start of a line.
        from === to
          ? Decoration.line(attrs).range(tr.state.doc.lineAt(from).from)
          : Decoration.mark(attrs).range(from, to),
      ]);
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

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
  onDoubleClick(cb: (line: number, col: number) => void): void;
  jumpTo(line: number, col: number): void;
  jumpToRange(startLine: number, startCol: number, endLine?: number, endCol?: number, flash?: boolean): void;
  setWordWrap(enabled: boolean): void;
  setTheme(dark: boolean): void;
  onDiagnostics(cb: (d: Problem[]) => void): void;
  destroy(): void;
}

export function createEditor(
  parent: HTMLElement,
  lsp: LspConnection | null,
  initialWordWrap = true,
): EditorHandle {
  let lspClient: any = null;
  let view: EditorView | null = null;
  const wrapCompartment = new Compartment();
  const themeCompartment = new Compartment();
  const isDarkInitial =
    typeof document !== "undefined" &&
    (document.documentElement.dataset.theme === "dark" ||
      (!document.documentElement.dataset.theme &&
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-color-scheme: dark)").matches));
  const changeCallbacks: (() => void)[] = [];
  const cursorCallbacks: ((line: number, col: number) => void)[] = [];
  const doubleClickCallbacks: ((line: number, col: number) => void)[] = [];
  const diagnosticsCallbacks: ((d: Problem[]) => void)[] = [];
  let flashCount = 0;
  let flashTimer: ReturnType<typeof setTimeout> | null = null;

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
      wrapCompartment.of(initialWordWrap ? EditorView.lineWrapping : []),
      themeCompartment.of(EditorView.theme({}, { dark: isDarkInitial })),
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
      flashField,
      EditorView.domEventHandlers({
        dblclick: (event, targetView) => {
          const pos = targetView.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos !== null) {
            const lineObj = targetView.state.doc.lineAt(pos);
            const lineNum = lineObj.number;
            const colNum = pos - lineObj.from + 1;
            for (const cb of doubleClickCallbacks) {
              cb(lineNum, colNum);
            }
          }
          return false;
        },
      }),
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
      const formatted = formatDocument(view);
      const text = view.state.doc.toString();
      const fixed = fixRawTextWhitespace(text);
      if (fixed !== text) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: fixed },
        });
      }
      return formatted;
    },

    onChange(cb: () => void) {
      changeCallbacks.length = 0;
      changeCallbacks.push(cb);
    },

    onCursor(cb: (line: number, col: number) => void) {
      cursorCallbacks.push(cb);
    },

    onDoubleClick(cb: (line: number, col: number) => void) {
      doubleClickCallbacks.push(cb);
    },

    setWordWrap(enabled: boolean) {
      if (!view) return;
      view.dispatch({
        effects: wrapCompartment.reconfigure(enabled ? EditorView.lineWrapping : []),
      });
    },

    setTheme(dark: boolean) {
      if (!view) return;
      view.dispatch({
        effects: themeCompartment.reconfigure(EditorView.theme({}, { dark })),
      });
    },

    jumpToRange(startLine: number, startCol: number, endLine?: number, endCol?: number, flash = false) {
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
        // Preview jumps put the target ~35% down the editor (a bit above center); others scroll minimally.
        scrollIntoView: !flash,
        effects: flash
          ? [
              setFlash.of({ from: Math.min(anchor, head), to: Math.max(anchor, head), n: ++flashCount }),
              EditorView.scrollIntoView(anchor, { y: "start", yMargin: view.scrollDOM.clientHeight * 0.35 }),
            ]
          : [],
      });
      view.focus();
      if (flash) {
        if (flashTimer) clearTimeout(flashTimer);
        flashTimer = setTimeout(() => view?.dispatch({ effects: setFlash.of(null) }), 2000);
      }
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
