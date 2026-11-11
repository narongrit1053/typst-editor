import { LspConnection, uriToPath } from "./lsp";

let activeLsp: LspConnection | null = null;
let isPreviewRunning = false;
let currentZoom = 1.0;

interface PreviewStartResult {
  dataPlanePort?: number;
  isPrimary?: boolean;
  staticServerAddr?: string;
  staticServerPort?: number;
}

export function getZoom(): number {
  return currentZoom;
}

// Zoom is done by Tinymist's own renderer: scaling the iframe with CSS does nothing visible because
// the preview page re-fits the document to its own width. The injected script
// (src-tauri/src/preview_flash.js) turns these messages into Tinymist's Ctrl+= / Ctrl+- zoom and
// reports the real level back as a "kong-zoom-level" message (see setZoomLevel).
function sendZoom(frame: HTMLIFrameElement, dir: "in" | "out"): number {
  frame?.contentWindow?.postMessage({ type: "kong-zoom", dir }, "*");
  return currentZoom;
}

export function setZoomLevel(ratio: number): number {
  currentZoom = Math.round(ratio * 100) / 100;
  return currentZoom;
}

export function zoomIn(frame: HTMLIFrameElement): number {
  return sendZoom(frame, "in");
}

export function zoomOut(frame: HTMLIFrameElement): number {
  return sendZoom(frame, "out");
}

// Reloading the preview page brings it back to fit-to-width.
export function resetZoom(frame: HTMLIFrameElement): number {
  currentZoom = 1.0;
  if (frame?.src) frame.src = frame.src;
  return currentZoom;
}

// Asks the preview page (via src-tauri/src/preview_flash.js) for a standalone HTML copy of what it renders.
export function requestPreviewHtml(frame: HTMLIFrameElement, title: string, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const target = frame?.contentWindow;
    if (!target || !isPreviewRunning) {
      reject(new Error("PREVIEW_NOT_READY"));
      return;
    }
    const id = `${Date.now()}-${Math.random()}`;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== target || event.data?.type !== "kong-export-html-result" || event.data.id !== id) return;
      cleanup();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(String(event.data.html));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("PREVIEW_NOT_READY"));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    };
    window.addEventListener("message", onMessage);
    target.postMessage({ type: "kong-export-html", id, title }, "*");
  });
}

export function handlePreviewMessage(data: any, onJumpToSource?: (file: string, line: number, col: number) => void): boolean {
  if (!data || typeof data !== "object") return false;
  if (data.type === "jumpTo" || data.event === "editorScrollTo") {
    const rawFile = data.filepath || data.path || "";
    const file = rawFile.startsWith("file://") ? uriToPath(rawFile) : rawFile;
    const line = typeof data.line === "number" ? data.line + 1 : 1;
    const col = typeof data.character === "number" ? data.character + 1 : (typeof data.col === "number" ? data.col + 1 : 1);
    onJumpToSource?.(file, line, col);
    return true;
  }
  return false;
}

export function initPreviewSync(onJumpToSource?: (file: string, line: number, col: number) => void): void {
  if (typeof window === "undefined") return;
  window.addEventListener("message", (event) => {
    handlePreviewMessage(event.data, onJumpToSource);
  });
}

export async function waitForPort(url: string, maxAttempts = 15, delayMs = 100): Promise<boolean> {
  if (typeof window === "undefined") return true;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await fetch(url, { method: "HEAD", mode: "no-cors" });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

export async function stopPreview(lsp?: LspConnection): Promise<void> {
  const targetLsp = lsp || activeLsp;
  if (!targetLsp || !isPreviewRunning) return;

  try {
    await targetLsp.request("workspace/executeCommand", {
      command: "tinymist.doKillPreview",
      arguments: ["default_preview"],
    });
  } catch (err) {
    console.warn("stopPreview warning:", err);
  } finally {
    isPreviewRunning = false;
  }
}

export async function startPreview(
  frame: HTMLIFrameElement,
  lsp: LspConnection,
  mainPath: string,
  fontPath?: string,
): Promise<void> {
  await stopPreview(activeLsp || lsp);
  activeLsp = lsp;

  try {
    // No --partial-rendering: it renders pages lazily on scroll, which made scrolling the preview laggy.
    const previewArgs = ["--no-open", "--data-plane-host", "127.0.0.1:0"];
    if (fontPath) {
      previewArgs.push("--font-path", fontPath);
    }
    previewArgs.push(mainPath);

    let res: PreviewStartResult | undefined;
    for (let attempt = 0; attempt < 25; attempt++) {
      try {
        res = (await lsp.request("workspace/executeCommand", {
          command: "tinymist.doStartPreview",
          arguments: [previewArgs],
        })) as PreviewStartResult | undefined;
        break;
      } catch (err: any) {
        if (err?.code === -32002 && attempt < 24) {
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        throw err;
      }
    }

    if (!res || typeof res.staticServerPort !== "number") {
      throw new Error(`Tinymist preview failed to return staticServerPort: ${JSON.stringify(res)}`);
    }

    isPreviewRunning = true;
    const port = res.staticServerPort;
    const previewUrl = `http://127.0.0.1:${port}/`;
    await waitForPort(previewUrl);

    if (frame.src === previewUrl) {
      try {
        frame.contentWindow?.location.reload();
      } catch {
        frame.src = previewUrl;
      }
    } else {
      frame.src = previewUrl;
    }
    // A freshly loaded preview page starts at fit-to-width.
    currentZoom = 1.0;
  } catch (err) {
    console.error("Failed to start preview:", err);
    throw err;
  }
}
