import { LspConnection } from "./lsp";

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
  (frame.style as any).zoom = String(currentZoom);
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

export function initPreviewSync(onJumpToSource?: (file: string, line: number, col: number) => void): void {
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "jumpTo" || data.event === "editorScrollTo") {
      const file = data.filepath || data.path || "";
      const line = typeof data.line === "number" ? data.line + 1 : 1;
      const col = typeof data.character === "number" ? data.character + 1 : (typeof data.col === "number" ? data.col + 1 : 1);
      onJumpToSource?.(file, line, col);
    }
  });
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
): Promise<void> {
  await stopPreview(activeLsp || lsp);
  activeLsp = lsp;

  try {
    const res = (await lsp.request("workspace/executeCommand", {
      command: "tinymist.doStartPreview",
      arguments: [["--no-open", mainPath]],
    })) as PreviewStartResult | undefined;

    isPreviewRunning = true;
    const port = res?.staticServerPort || 23625;
    const previewUrl = `http://127.0.0.1:${port}/`;
    if (frame.src !== previewUrl) {
      frame.src = previewUrl;
    }
    // Apply current zoom
    (frame.style as any).zoom = String(currentZoom);
  } catch (err) {
    console.error("Failed to start preview:", err);
    throw err;
  }
}
