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

export function setZoom(frame: HTMLIFrameElement, zoom: number): number {
  currentZoom = Math.max(0.5, Math.min(2.5, Math.round(zoom * 10) / 10));
  if (frame && frame.style) {
    if (currentZoom === 1.0) {
      frame.style.transform = "";
      frame.style.width = "100%";
      frame.style.height = "100%";
      frame.style.transformOrigin = "";
    } else {
      frame.style.transformOrigin = "top left";
      frame.style.transform = `scale(${currentZoom})`;
      frame.style.width = `${100 / currentZoom}%`;
      frame.style.height = `${100 / currentZoom}%`;
    }
    (frame.style as any).zoom = "";
  }
  return currentZoom;
}

export function zoomIn(frame: HTMLIFrameElement): number {
  return setZoom(frame, currentZoom + 0.1);
}

export function zoomOut(frame: HTMLIFrameElement): number {
  return setZoom(frame, currentZoom - 0.1);
}

export function resetZoom(frame: HTMLIFrameElement): number {
  return setZoom(frame, 1.0);
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
    // Apply current zoom via GPU-accelerated transform
    setZoom(frame, currentZoom);
  } catch (err) {
    console.error("Failed to start preview:", err);
    throw err;
  }
}
