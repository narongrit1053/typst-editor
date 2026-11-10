import { LspConnection } from "./lsp";

let activeLsp: LspConnection | null = null;
let isPreviewRunning = false;

interface PreviewStartResult {
  dataPlanePort?: number;
  isPrimary?: boolean;
  staticServerAddr?: string;
  staticServerPort?: number;
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
  } catch (err) {
    console.error("Failed to start preview:", err);
    throw err;
  }
}
