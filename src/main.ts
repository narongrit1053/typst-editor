import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog, ask } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { connectLsp, LspConnection } from "./lsp";
import { createEditor, EditorHandle } from "./editor";
import { startPreview, stopPreview } from "./preview";
import { detectEol, withEol, createSaver, Saver } from "./document";
import { renderProblems, summarise } from "./problems";

let lspConnection: LspConnection | null = null;
let editor: EditorHandle | null = null;
let saver: Saver | null = null;
let currentFilePath: string | null = null;
let currentEol: "\r\n" | "\n" = "\n";

export function getCurrentFilePath(): string | null {
  return currentFilePath;
}

export function getCurrentEditor(): EditorHandle | null {
  return editor;
}

export function getLspConnection(): LspConnection | null {
  return lspConnection;
}

export function getSaver(): Saver | null {
  return saver;
}

export function showBanner(message: string, isError = true) {
  const banner = document.getElementById("banner");
  const bannerText = document.getElementById("banner-text");
  if (!banner || !bannerText) return;

  bannerText.textContent = message;
  banner.classList.remove("hidden");
  if (isError) {
    banner.style.background = "var(--err-soft)";
    banner.style.color = "var(--err)";
    banner.style.borderColor = "var(--err)";
  } else {
    banner.style.background = "var(--warn-soft)";
    banner.style.color = "var(--warn)";
    banner.style.borderColor = "var(--warn)";
  }
}

export function hideBanner() {
  const banner = document.getElementById("banner");
  if (banner) {
    banner.classList.add("hidden");
  }
}

function updateFileNameDisplay(path: string | null, isDirty: boolean) {
  const fileNameEl = document.getElementById("file-name");
  if (!fileNameEl) return;
  if (!path) {
    fileNameEl.textContent = "No file open";
    fileNameEl.title = "";
    return;
  }
  const baseName = path.split(/[\\/]/).pop() || path;
  fileNameEl.textContent = isDirty ? `${baseName} ●` : baseName;
  fileNameEl.title = path;
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

export async function exportPdf() {
  if (!currentFilePath) return;

  if (saver) {
    try {
      await saver.saveNow();
    } catch (e: any) {
      showBanner(`Save failed before export: ${e?.message || e}`);
      return;
    }
  }

  const defaultPdfPath = currentFilePath.replace(/\.[^/\\.]+$/, "") + ".pdf";
  const outPath = await saveDialog({
    defaultPath: defaultPdfPath,
    filters: [{ name: "PDF Document", extensions: ["pdf"] }],
  });

  if (!outPath || typeof outPath !== "string") return;

  const statusState = document.getElementById("status-state");
  try {
    await invoke("export_pdf", { main: currentFilePath, out: outPath });
    hideBanner();
    const pdfName = outPath.split(/[\\/]/).pop() || outPath;
    if (statusState) {
      statusState.textContent = `Exported ${pdfName}`;
    }
  } catch (err: any) {
    const msg = String(err);
    if (msg.includes("TYPST_NOT_FOUND")) {
      showBanner("Typst was not found. Install it (winget install Typst.Typst) and restart the app.");
    } else {
      showBanner(`Export failed: ${msg}`);
    }
  }
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

  if (saver && saver.isDirty()) {
    try {
      await saver.saveNow();
    } catch {}
  }

  const folder = targetPath.replace(/[\\/][^\\/]+$/, "") || ".";
  await stopPreview();
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

    editor.onDiagnostics((problems) => {
      const problemsEl = document.getElementById("problems");
      const statusState = document.getElementById("status-state");
      if (problemsEl) {
        renderProblems(problemsEl, problems, folder, (p) => {
          editor?.jumpTo(p.line, p.col);
        });
      }
      if (statusState) {
        statusState.textContent = summarise(problems);
      }
    });
  }

  const content = await invoke<string>("read_file", { path: targetPath });
  currentFilePath = targetPath;
  currentEol = detectEol(content);

  saver = createSaver({
    getText: () => editor?.getText() || "",
    write: async (text) => {
      if (!currentFilePath) return;
      const normalized = withEol(text, currentEol);
      await invoke("write_file", { path: currentFilePath, contents: normalized });
    },
    onState: (state, err) => {
      if (state === "saved") {
        hideBanner();
        updateFileNameDisplay(currentFilePath, false);
      } else if (state === "dirty" || state === "saving") {
        updateFileNameDisplay(currentFilePath, true);
      } else if (state === "error") {
        updateFileNameDisplay(currentFilePath, true);
        showBanner(`Save failed: ${err || "Unknown error"}`);
      }
    },
    delayMs: 1000,
  });

  editor.onChange(() => {
    saver?.touch();
  });

  editor.open(targetPath, content);
  updateFileNameDisplay(targetPath, false);

  const previewFrame = document.getElementById("preview") as HTMLIFrameElement;
  if (previewFrame && lspConnection) {
    startPreview(previewFrame, lspConnection, targetPath).catch((err) => {
      console.error("Preview start failed:", err);
    });
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  initSplitter();

  const btnOpen = document.getElementById("btn-open");
  if (btnOpen) {
    btnOpen.addEventListener("click", () => {
      openFile().catch(console.error);
    });
  }

  const btnExport = document.getElementById("btn-export");
  if (btnExport) {
    btnExport.addEventListener("click", () => {
      exportPdf().catch(console.error);
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === "o") {
      e.preventDefault();
      openFile().catch(console.error);
    } else if (e.ctrlKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (saver) {
        saver.saveNow().catch((err) => {
          showBanner(`Save failed: ${err?.message || err}`);
        });
      }
    } else if (e.ctrlKey && e.key.toLowerCase() === "e") {
      e.preventDefault();
      exportPdf().catch(console.error);
    }
  });

  try {
    const appWindow = getCurrentWindow();
    await appWindow.onCloseRequested(async (event) => {
      if (saver && saver.isDirty()) {
        try {
          await saver.saveNow();
        } catch {
          const shouldClose = await ask(
            "Could not save changes. Close without saving?",
            { title: "Typst-Editor by Kong", kind: "warning" },
          );
          if (!shouldClose) {
            event.preventDefault();
            return;
          }
        }
      }
      stopPreview().catch(() => {});
    });
  } catch (e) {
    console.warn("Could not register window close listener:", e);
  }

  window.addEventListener("beforeunload", () => {
    stopPreview().catch(() => {});
  });
});
