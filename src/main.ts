import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog, ask } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { connectLsp, LspConnection, pathToUri } from "./lsp";
import { createEditor, EditorHandle } from "./editor";
import {
  startPreview,
  stopPreview,
  zoomIn,
  zoomOut,
  resetZoom,
  initPreviewSync,
} from "./preview";
import { detectEol, withEol, createSaver, Saver } from "./document";
import { renderProblems, summarise } from "./problems";
import { fetchDirectoryEntries, renderFileTree, toggleSidebar } from "./files";
import { parseOutlineSymbols, renderOutline } from "./outline";
import { showQuickOpen } from "./quick_open";
import {
  loadSettings,
  saveSettings,
  initSettingsModal,
  getCachedSettings,
  checkForUpdates,
} from "./settings";
import { initTemplateMarket, openTemplateMarket } from "./templates";

let lspConnection: LspConnection | null = null;
let editor: EditorHandle | null = null;
let saver: Saver | null = null;
let currentProjectFolder: string | null = null;
let currentFilePath: string | null = null;
let pinnedFilePath: string | null = null;
let currentEol: "\r\n" | "\n" = "\n";
let outlineTimer: any = null;

let lastRestartTime = 0;
let isReconnecting = false;
let flatWorkspaceFiles: string[] = [];

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
  const bannerAction = document.getElementById("banner-action");
  if (!banner || !bannerText) return;

  if (bannerAction) {
    bannerAction.classList.add("hidden");
  }

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

export function showBannerWithAction(message: string, actionLabel: string, onAction: () => void) {
  const banner = document.getElementById("banner");
  const bannerText = document.getElementById("banner-text");
  const bannerAction = document.getElementById("banner-action") as HTMLButtonElement | null;
  if (!banner || !bannerText) return;

  bannerText.textContent = message;
  banner.classList.remove("hidden");
  banner.style.background = "var(--warn-soft)";
  banner.style.color = "var(--warn)";
  banner.style.borderColor = "var(--warn)";

  if (bannerAction) {
    bannerAction.textContent = actionLabel;
    bannerAction.classList.remove("hidden");
    bannerAction.onclick = () => {
      onAction();
    };
  }
}

export function hideBanner() {
  const banner = document.getElementById("banner");
  const bannerAction = document.getElementById("banner-action");
  if (!banner) return;
  banner.classList.add("hidden");
  if (bannerAction) {
    bannerAction.classList.add("hidden");
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

export async function refreshFileTree() {
  const treeContainer = document.getElementById("file-tree");
  if (!treeContainer) return;

  if (!currentProjectFolder) {
    treeContainer.replaceChildren();
    return;
  }

  try {
    const entries = await fetchDirectoryEntries();
    renderFileTree(
      treeContainer,
      entries,
      currentFilePath,
      pinnedFilePath,
      async (selectedPath) => {
        await openFile(selectedPath);
      },
      async (pinPath) => {
        await setMainFile(pinPath);
      },
      async (deletePath) => {
        await deleteItem(deletePath);
      },
      async (renamePath) => {
        await renameItem(renamePath);
      },
    );

    // Collect flat list of files recursively for Quick Open
    flatWorkspaceFiles = await collectAllWorkspaceFiles();
  } catch (err) {
    console.warn("Failed to refresh file tree:", err);
  }
}

async function collectAllWorkspaceFiles(dir?: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const raw = await invoke<Array<{ name: string; path: string; is_dir: boolean }>>("list_dir", {
      path: dir,
    });
    for (const item of raw) {
      if (item.is_dir) {
        const subFiles = await collectAllWorkspaceFiles(item.path);
        results.push(...subFiles);
      } else {
        results.push(item.path);
      }
    }
  } catch {}
  return results;
}

export async function setMainFile(path: string | null) {
  pinnedFilePath = path;
  if (currentProjectFolder) {
    const settings = getCachedSettings();
    if (path) {
      settings.mainPins[currentProjectFolder] = path;
    } else {
      delete settings.mainPins[currentProjectFolder];
    }
    await saveSettings(settings);
  }

  if (lspConnection) {
    try {
      await lspConnection.request("workspace/executeCommand", {
        command: "tinymist.pinMain",
        arguments: path ? [path] : [null],
      });
    } catch (e) {
      console.warn("Failed to pin main file via LSP:", e);
    }
  }

  await refreshFileTree();

  const previewFrame = document.getElementById("preview") as HTMLIFrameElement;
  const targetPreview = pinnedFilePath || currentFilePath;
  if (previewFrame && lspConnection && targetPreview) {
    startPreview(previewFrame, lspConnection, targetPreview).catch(console.error);
  }
}

async function deleteItem(path: string) {
  const baseName = path.split(/[\\/]/).pop() || path;
  const confirmed = await ask(`Are you sure you want to delete "${baseName}"?`, {
    title: "Confirm Delete",
    kind: "warning",
  });
  if (!confirmed) return;

  try {
    await invoke("delete_path", { path });
    if (currentFilePath === path) {
      currentFilePath = null;
      updateFileNameDisplay(null, false);
      editor?.open("", "");
    }
    if (pinnedFilePath === path) {
      await setMainFile(null);
    }
    await refreshFileTree();
  } catch (e: any) {
    showBanner(`Failed to delete: ${e?.message || e}`);
  }
}

async function renameItem(oldPath: string) {
  const oldName = oldPath.split(/[\\/]/).pop() || oldPath;
  const newName = window.prompt("New name:", oldName);
  if (!newName || newName.trim() === "" || newName === oldName) return;

  const parent = oldPath.replace(/[\\/][^\\/]+$/, "");
  const newPath = `${parent}/${newName.trim()}`;

  try {
    await invoke("rename_path", { oldPath, newPath });
    if (currentFilePath === oldPath) {
      currentFilePath = newPath;
      updateFileNameDisplay(newPath, saver?.isDirty() || false);
    }
    if (pinnedFilePath === oldPath) {
      pinnedFilePath = newPath;
      if (currentProjectFolder) {
        const settings = getCachedSettings();
        settings.mainPins[currentProjectFolder] = newPath;
        await saveSettings(settings);
      }
    }
    await refreshFileTree();
  } catch (e: any) {
    showBanner(`Failed to rename: ${e?.message || e}`);
  }
}

async function createNewFile() {
  if (!currentProjectFolder) {
    showBanner("Please open a project folder first to create files.", false);
    return;
  }
  const name = window.prompt("New file name (e.g. chapter1.typ):");
  if (!name || name.trim() === "") return;

  const targetPath = `${currentProjectFolder}/${name.trim()}`;
  try {
    await invoke("create_file", { path: targetPath });
    await refreshFileTree();
    await openFile(targetPath);
  } catch (e: any) {
    showBanner(`Failed to create file: ${e?.message || e}`);
  }
}

async function createNewFolder() {
  if (!currentProjectFolder) {
    showBanner("Please open a project folder first to create folders.", false);
    return;
  }
  const name = window.prompt("New folder name:");
  if (!name || name.trim() === "") return;

  const targetPath = `${currentProjectFolder}/${name.trim()}`;
  try {
    await invoke("create_dir", { path: targetPath });
    await refreshFileTree();
  } catch (e: any) {
    showBanner(`Failed to create folder: ${e?.message || e}`);
  }
}

export async function refreshOutline() {
  const outlineEl = document.getElementById("outline-tree");
  if (!outlineEl || !lspConnection || !currentFilePath) return;

  try {
    const symbols = (await lspConnection.request("textDocument/documentSymbol", {
      textDocument: { uri: pathToUri(currentFilePath) },
    })) as any[];

    const items = parseOutlineSymbols(symbols || []);
    renderOutline(outlineEl, items, (item) => {
      editor?.jumpTo(item.line, item.col);
    });
  } catch (e) {
    console.warn("Failed to fetch outline symbols:", e);
  }
}

function scheduleOutlineRefresh() {
  if (outlineTimer) clearTimeout(outlineTimer);
  outlineTimer = setTimeout(() => {
    refreshOutline().catch(() => {});
  }, 1200);
}

async function reconnectLsp() {
  if (!currentFilePath && !currentProjectFolder) return;
  isReconnecting = true;
  const folder = currentProjectFolder || currentFilePath!.replace(/[\\/][^\\/]+$/, "") || ".";

  try {
    if (lspConnection) {
      try {
        lspConnection.close();
      } catch {}
    }

    lspConnection = await connectLsp(folder, () => {
      handleLspExit();
    });

    const editorEl = document.getElementById("editor")!;
    const currentText = editor
      ? editor.getText()
      : currentFilePath
        ? await invoke<string>("read_file", { path: currentFilePath })
        : "";

    if (editor) {
      editor.destroy();
    }

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

    editor.onChange(() => {
      saver?.touch();
      scheduleOutlineRefresh();
    });

    if (currentFilePath) {
      editor.open(currentFilePath, currentText);
      const previewFrame = document.getElementById("preview") as HTMLIFrameElement;
      const targetPreview = pinnedFilePath || currentFilePath;
      if (previewFrame && lspConnection && targetPreview) {
        await startPreview(previewFrame, lspConnection, targetPreview);
      }
      refreshOutline().catch(() => {});
    }
  } finally {
    isReconnecting = false;
  }
}

async function handleLspExit() {
  if (isReconnecting || (!currentFilePath && !currentProjectFolder)) return;
  const now = Date.now();
  const timeSinceLastRestart = now - lastRestartTime;

  if (timeSinceLastRestart < 30000 && lastRestartTime !== 0) {
    showBannerWithAction("Language service stopped.", "Restart", () => {
      hideBanner();
      reconnectLsp().catch((err) => {
        showBanner(`Restart failed: ${err}`);
      });
    });
    return;
  }

  lastRestartTime = now;
  try {
    await reconnectLsp();
    hideBanner();
  } catch (err) {
    showBannerWithAction("Language service failed to restart.", "Restart", () => {
      hideBanner();
      reconnectLsp().catch((e) => showBanner(`Restart failed: ${e}`));
    });
  }
}

export async function exportDocument(format: "pdf" | "png" | "svg" = "pdf") {
  const targetExport = pinnedFilePath || currentFilePath;
  if (!targetExport) {
    showBanner("Please open a document first to export.", false);
    return;
  }

  if (saver) {
    try {
      await saver.saveNow();
    } catch (e: any) {
      showBanner(`Save failed before export: ${e?.message || e}`);
      return;
    }
  }

  const defaultExt = format;
  const defaultPath = targetExport.replace(/\.[^/\\.]+$/, "") + `.${defaultExt}`;
  const filterName = format === "pdf" ? "PDF Document" : format === "png" ? "PNG Image" : "SVG Image";
  const outPath = await saveDialog({
    defaultPath,
    filters: [{ name: filterName, extensions: [defaultExt] }],
  });

  if (!outPath || typeof outPath !== "string") return;

  const statusState = document.getElementById("status-state");
  const settings = getCachedSettings();
  try {
    await invoke("export_file", {
      main: targetExport,
      out: outPath,
      customBinary: settings.customTypstPath || null,
    });
    hideBanner();
    const fileName = outPath.split(/[\\/]/).pop() || outPath;
    if (statusState) {
      statusState.textContent = `Exported ${fileName}`;
    }
  } catch (err: any) {
    const msg = String(err);
    if (msg.includes("TYPST_NOT_FOUND")) {
      showBannerWithAction(
        "Typst CLI was not detected. Please install it (winget install Typst.Typst) or configure the path in Settings.",
        "Settings",
        () => {
          document.getElementById("modal-settings")?.classList.remove("hidden");
        },
      );
    } else {
      showBanner(`Export failed: ${msg}`);
    }
  }
}

export async function exportPdf() {
  return exportDocument("pdf");
}

export async function openFolder(folderPath?: string) {
  let targetFolder = folderPath;
  if (!targetFolder) {
    const selected = await openDialog({
      directory: true,
      multiple: false,
    });
    if (!selected || typeof selected !== "string") return;
    targetFolder = selected;
  }

  if (saver && saver.isDirty()) {
    try {
      await saver.saveNow();
    } catch {}
  }

  currentProjectFolder = targetFolder;
  await stopPreview();
  await invoke("set_root", { path: targetFolder });

  if (lspConnection) {
    lspConnection.close();
  }

  lastRestartTime = 0;
  lspConnection = await connectLsp(targetFolder, () => {
    handleLspExit();
  });

  // Restore main pin if configured
  const settings = getCachedSettings();
  pinnedFilePath = settings.mainPins[targetFolder] || null;

  // Add to recents
  const recents = (settings.recentFolders || []).filter((f) => f !== targetFolder);
  recents.unshift(targetFolder);
  settings.recentFolders = recents.slice(0, 10);
  await saveSettings(settings);

  await refreshFileTree();

  // Pick entry file: pinned file if exists, or main.typ, or first .typ file
  let fileToOpen = pinnedFilePath;
  if (!fileToOpen || !flatWorkspaceFiles.includes(fileToOpen)) {
    const mainTyp = flatWorkspaceFiles.find((f) => f.endsWith("main.typ"));
    const anyTyp = flatWorkspaceFiles.find((f) => f.endsWith(".typ"));
    fileToOpen = mainTyp || anyTyp || null;
  }

  if (fileToOpen) {
    await openFile(fileToOpen);
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

  if (!currentProjectFolder) {
    currentProjectFolder = folder;
    await stopPreview();
    await invoke("set_root", { path: folder });

    if (lspConnection) {
      lspConnection.close();
    }

    lastRestartTime = 0;
    lspConnection = await connectLsp(folder, () => {
      handleLspExit();
    });
  }

  const editorEl = document.getElementById("editor")!;
  if (!editor && lspConnection) {
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

  const settings = getCachedSettings();

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
    delayMs: settings.autosave ? 1000 : 999999999,
  });

  editor?.onChange(() => {
    if (settings.autosave) {
      saver?.touch();
    }
    scheduleOutlineRefresh();
  });

  editor?.open(targetPath, content);
  updateFileNameDisplay(targetPath, false);

  const previewFrame = document.getElementById("preview") as HTMLIFrameElement;
  const targetPreview = pinnedFilePath || targetPath;
  if (previewFrame && lspConnection) {
    startPreview(previewFrame, lspConnection, targetPreview).catch((err) => {
      console.error("Preview start failed:", err);
    });
  }

  await refreshFileTree();
  scheduleOutlineRefresh();
}

async function handleExternalFileChange() {
  if (!currentFilePath || !editor) return;

  try {
    const diskContent = await invoke<string>("read_file", { path: currentFilePath });
    const currentText = editor.getText();
    if (diskContent === currentText) return;

    if (saver && !saver.isDirty()) {
      editor.open(currentFilePath, diskContent);
      scheduleOutlineRefresh();
    } else if (saver && saver.isDirty()) {
      const reload = await ask(
        "This file has been modified on disk by another program.\n\nDo you want to reload it from disk and overwrite your unsaved edits?",
        { title: "Typst-Editor by Kong", kind: "warning" },
      );
      if (reload) {
        editor.open(currentFilePath, diskContent);
        saver.saveNow().catch(() => {});
        scheduleOutlineRefresh();
      }
    }
  } catch {}
}

function initApp() {
  console.log("Typst-Editor: wiring UI and event listeners...");

  initSplitter();
  initSettingsModal();

  // Template market initialization
  initTemplateMarket(async (targetDir) => {
    await openFolder(targetDir);
  });

  // Preview frame
  const previewFrame = document.getElementById("preview") as HTMLIFrameElement;

  initPreviewSync((file, line, col) => {
    if (file && file !== currentFilePath) {
      openFile(file).then(() => {
        editor?.jumpTo(line, col);
      });
    } else {
      editor?.jumpTo(line, col);
    }
  });

  // Zoom controls
  const btnZoomIn = document.getElementById("btn-zoom-in");
  const btnZoomOut = document.getElementById("btn-zoom-out");
  const btnZoomReset = document.getElementById("btn-zoom-reset");

  const updateZoomLabel = (z: number) => {
    if (btnZoomReset) {
      btnZoomReset.textContent = `${Math.round(z * 100)}%`;
    }
  };

  btnZoomIn?.addEventListener("click", () => {
    if (previewFrame) updateZoomLabel(zoomIn(previewFrame));
  });
  btnZoomOut?.addEventListener("click", () => {
    if (previewFrame) updateZoomLabel(zoomOut(previewFrame));
  });
  btnZoomReset?.addEventListener("click", () => {
    if (previewFrame) updateZoomLabel(resetZoom(previewFrame));
  });

  // Sidebar buttons
  const btnSidebar = document.getElementById("btn-sidebar");
  btnSidebar?.addEventListener("click", () => {
    toggleSidebar();
  });

  const btnNewFile = document.getElementById("btn-new-file");
  btnNewFile?.addEventListener("click", () => {
    createNewFile().catch(console.error);
  });

  const btnNewFolder = document.getElementById("btn-new-folder");
  btnNewFolder?.addEventListener("click", () => {
    createNewFolder().catch(console.error);
  });

  // Open buttons
  const btnOpen = document.getElementById("btn-open");
  btnOpen?.addEventListener("click", () => {
    openFile().catch(console.error);
  });

  const btnOpenFolder = document.getElementById("btn-open-folder");
  btnOpenFolder?.addEventListener("click", () => {
    openFolder().catch(console.error);
  });

  const btnTemplates = document.getElementById("btn-templates");
  btnTemplates?.addEventListener("click", () => {
    openTemplateMarket(async (targetDir) => {
      await openFolder(targetDir);
    });
  });

  // Welcome screen buttons
  const welcomeBtnOpenFolder = document.getElementById("welcome-btn-open-folder");
  welcomeBtnOpenFolder?.addEventListener("click", () => {
    openFolder().catch(console.error);
  });

  const welcomeBtnOpenFile = document.getElementById("welcome-btn-open-file");
  welcomeBtnOpenFile?.addEventListener("click", () => {
    openFile().catch(console.error);
  });

  const welcomeBtnTemplates = document.getElementById("welcome-btn-templates");
  welcomeBtnTemplates?.addEventListener("click", () => {
    openTemplateMarket(async (targetDir) => {
      await openFolder(targetDir);
    });
  });

  // Format button
  const btnFormat = document.getElementById("btn-format");
  btnFormat?.addEventListener("click", () => {
    if (!currentFilePath) {
      showBanner("Open a .typ document first to format it.", false);
      return;
    }
    editor?.format();
  });

  // Export dropdown
  const btnExport = document.getElementById("btn-export");
  const btnExportOptions = document.getElementById("btn-export-options");
  const exportMenu = document.getElementById("export-menu");
  const btnExportPdf = document.getElementById("btn-export-pdf");
  const btnExportPng = document.getElementById("btn-export-png");
  const btnExportSvg = document.getElementById("btn-export-svg");

  btnExport?.addEventListener("click", () => {
    exportDocument("pdf").catch(console.error);
  });

  btnExportOptions?.addEventListener("click", (e) => {
    e.stopPropagation();
    exportMenu?.classList.toggle("hidden");
  });

  btnExportPdf?.addEventListener("click", () => {
    exportMenu?.classList.add("hidden");
    exportDocument("pdf").catch(console.error);
  });

  btnExportPng?.addEventListener("click", () => {
    exportMenu?.classList.add("hidden");
    exportDocument("png").catch(console.error);
  });

  btnExportSvg?.addEventListener("click", () => {
    exportMenu?.classList.add("hidden");
    exportDocument("svg").catch(console.error);
  });

  document.addEventListener("click", (e) => {
    if (exportMenu && !exportMenu.classList.contains("hidden")) {
      if (!exportMenu.contains(e.target as Node) && e.target !== btnExportOptions) {
        exportMenu.classList.add("hidden");
      }
    }
  });

  // Global key shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === "b") {
      e.preventDefault();
      toggleSidebar();
    } else if (e.ctrlKey && e.key.toLowerCase() === "p") {
      e.preventDefault();
      showQuickOpen(flatWorkspaceFiles, (path) => {
        openFile(path).catch(console.error);
      });
    } else if (e.ctrlKey && e.key.toLowerCase() === "o") {
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
    } else if (e.shiftKey && e.altKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      editor?.format();
    } else if (e.ctrlKey && (e.key === "=" || e.key === "+")) {
      e.preventDefault();
      if (previewFrame) updateZoomLabel(zoomIn(previewFrame));
    } else if (e.ctrlKey && e.key === "-") {
      e.preventDefault();
      if (previewFrame) updateZoomLabel(zoomOut(previewFrame));
    } else if (e.ctrlKey && e.key === "0") {
      e.preventDefault();
      if (previewFrame) updateZoomLabel(resetZoom(previewFrame));
    }
  });

  // Window focus check
  window.addEventListener("focus", () => {
    handleExternalFileChange().catch(console.error);
  });

  try {
    const appWindow = getCurrentWindow();
    appWindow.onCloseRequested(async (event) => {
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
    }).catch(console.warn);
  } catch (e) {
    console.warn("Could not register window close listener:", e);
  }

  window.addEventListener("beforeunload", () => {
    stopPreview().catch(() => {});
  });

  // Background async tasks (never block UI responsiveness)
  loadSettings().catch(console.warn);

  // First-run Typst check
  try {
    const settings = getCachedSettings();
    invoke<string>("check_typst", { customBinary: settings.customTypstPath || null })
      .then((ver) => {
        const verEl = document.getElementById("status-typst-ver");
        if (verEl) {
          verEl.textContent = ver.split(" ")[1] ? `Typst ${ver.split(" ")[1]}` : ver;
        }
      })
      .catch(() => {
        showBannerWithAction(
          "Typst CLI was not found. Export requires Typst. Install via winget or configure in Settings.",
          "Settings",
          () => {
            document.getElementById("modal-settings")?.classList.remove("hidden");
          },
        );
      });
  } catch {}

  // Check for updates quietly in background
  checkForUpdates(true).then(async (info) => {
    if (info && info.available && info.download_url) {
      showBannerWithAction(
        `Version ${info.latest_version} is available.`,
        "Install and restart",
        async () => {
          if (saver && saver.isDirty()) {
            const confirmed = await ask(
              "You have unsaved changes. Save before updating and restarting?",
              { title: "Typst-Editor by Kong", kind: "warning" },
            );
            if (confirmed) {
              await saver.saveNow();
            } else {
              return;
            }
          }
          try {
            showBanner(`Downloading update v${info.latest_version}...`, false);
            await invoke("download_and_launch_installer", { url: info.download_url });
          } catch (e: any) {
            showBanner(`Update failed: ${e?.message || e}`);
          }
        },
      );
    }
  }).catch(() => {});
}

// Ensure initApp runs regardless of whether document is already parsed or loading
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
