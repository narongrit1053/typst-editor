import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { connectLsp, LspConnection } from "./lsp";
import { createEditor, EditorHandle } from "./editor";

let lspConnection: LspConnection | null = null;
let editor: EditorHandle | null = null;
let currentFilePath: string | null = null;

export function getCurrentFilePath(): string | null {
  return currentFilePath;
}

export function getCurrentEditor(): EditorHandle | null {
  return editor;
}

function initSplitter() {
  const splitter = document.getElementById("splitter");
  const editorPane = document.getElementById("editor") as HTMLElement;
  const workspace = document.querySelector(".workspace") as HTMLElement;

  if (!splitter || !editorPane || !workspace) return;

  let isDragging = false;

  splitter.addEventListener("pointerdown", (e) => {
    isDragging = true;
    splitter.classList.add("dragging");
    splitter.setPointerCapture(e.pointerId);
  });

  splitter.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const rect = workspace.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const minWidth = rect.width * 0.2;
    const maxWidth = rect.width * 0.8;
    const clamped = Math.max(minWidth, Math.min(maxWidth, x));
    const percent = (clamped / rect.width) * 100;
    editorPane.style.flex = `0 0 ${percent}%`;
  });

  const stopDrag = (e: PointerEvent) => {
    if (isDragging) {
      isDragging = false;
      splitter.classList.remove("dragging");
      try {
        splitter.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  splitter.addEventListener("pointerup", stopDrag);
  splitter.addEventListener("pointercancel", stopDrag);
}

export async function openFile(filePath?: string) {
  let targetPath = filePath;
  if (!targetPath) {
    const selected = await openDialog({
      filters: [{ name: "Typst Files", extensions: ["typ"] }],
      multiple: false,
    });
    if (!selected || typeof selected !== "string") return;
    targetPath = selected;
  }

  const folder = targetPath.replace(/[\\/][^\\/]+$/, "") || ".";
  await invoke("set_root", { path: folder });

  if (lspConnection) {
    lspConnection.close();
  }

  lspConnection = await connectLsp(folder, () => {
    console.warn("LSP exited");
  });

  const editorEl = document.getElementById("editor")!;
  if (!editor) {
    editor = createEditor(editorEl, lspConnection);
    const statusPos = document.getElementById("status-pos");
    editor.onCursor((line, col) => {
      if (statusPos) {
        statusPos.textContent = `Ln ${line}, Col ${col}`;
      }
    });
  }

  const content = await invoke<string>("read_file", { path: targetPath });
  currentFilePath = targetPath;
  editor.open(targetPath, content);

  const fileNameEl = document.getElementById("file-name");
  if (fileNameEl) {
    const baseName = targetPath.split(/[\\/]/).pop() || targetPath;
    fileNameEl.textContent = baseName;
    fileNameEl.title = targetPath;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initSplitter();

  const btnOpen = document.getElementById("btn-open");
  if (btnOpen) {
    btnOpen.addEventListener("click", () => {
      openFile().catch(console.error);
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === "o") {
      e.preventDefault();
      openFile().catch(console.error);
    }
  });
});
