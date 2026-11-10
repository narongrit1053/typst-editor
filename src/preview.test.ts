import { describe, it, expect, vi, beforeEach } from "vitest";
import { zoomIn, zoomOut, resetZoom, getZoom, setZoomLevel, handlePreviewMessage, startPreview, stopPreview } from "./preview";
import { LspConnection } from "./lsp";

describe("preview zoom and controls", () => {
  let fakeFrame: any;

  beforeEach(() => {
    fakeFrame = {
      style: {} as any,
      src: "http://127.0.0.1:5000/",
      contentWindow: { postMessage: vi.fn() },
    };
    resetZoom(fakeFrame);
  });

  it("asks the preview page to zoom and tracks the level it reports", () => {
    expect(getZoom()).toBe(1.0);

    zoomIn(fakeFrame);
    expect(fakeFrame.contentWindow.postMessage).toHaveBeenCalledWith({ type: "kong-zoom", dir: "in" }, "*");
    zoomOut(fakeFrame);
    expect(fakeFrame.contentWindow.postMessage).toHaveBeenCalledWith({ type: "kong-zoom", dir: "out" }, "*");

    expect(setZoomLevel(1.2999)).toBe(1.3);
    expect(getZoom()).toBe(1.3);

    resetZoom(fakeFrame);
    expect(getZoom()).toBe(1.0);
  });

  it("handles jumpTo sync message events and decodes file URI", () => {
    let jumped: { file: string; line: number; col: number } | null = null;
    const handled = handlePreviewMessage(
      {
        type: "jumpTo",
        filepath: "file:///D:/Try/Typst/paper.typ",
        line: 4,
        character: 12,
      },
      (file, line, col) => {
        jumped = { file, line, col };
      },
    );

    expect(handled).toBe(true);
    expect(jumped).not.toBeNull();
    expect(jumped!.file).toContain("paper.typ");
    expect(jumped!.line).toBe(5); // 1-based index
    expect(jumped!.col).toBe(13); // 1-based index
  });

  it("starts preview with dynamic port and sets iframe src", async () => {
    const fakeLsp: LspConnection = {
      rootPath: "D:/Try/Typst",
      transport: { send: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() },
      request: vi.fn().mockResolvedValue({
        staticServerPort: 54321,
        staticServerAddr: "127.0.0.1:54321",
      }),
      notify: vi.fn(),
      onNotification: vi.fn(),
      close: vi.fn(),
    };

    await startPreview(fakeFrame, fakeLsp, "D:/Try/Typst/paper.typ");
    expect(fakeLsp.request).toHaveBeenCalledWith("workspace/executeCommand", {
      command: "tinymist.doStartPreview",
      arguments: [["--no-open", "--data-plane-host", "127.0.0.1:0", "D:/Try/Typst/paper.typ"]],
    });
    expect(fakeFrame.src).toBe("http://127.0.0.1:54321/");

    await stopPreview(fakeLsp);
    expect(fakeLsp.request).toHaveBeenCalledWith("workspace/executeCommand", {
      command: "tinymist.doKillPreview",
      arguments: ["default_preview"],
    });
  });

  it("throws error when tinymist does not return a valid staticServerPort", async () => {
    const fakeLsp: LspConnection = {
      rootPath: "D:/Try/Typst",
      transport: { send: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() },
      request: vi.fn().mockResolvedValue({
        // Missing staticServerPort, e.g. capabilities collision
        capabilities: {},
      }),
      notify: vi.fn(),
      onNotification: vi.fn(),
      close: vi.fn(),
    };

    await expect(startPreview(fakeFrame, fakeLsp, "D:/Try/Typst/paper.typ")).rejects.toThrow(
      "Tinymist preview failed to return staticServerPort",
    );
  });

  it("retries when tinymist returns not initialized error (-32002)", async () => {
    let callCount = 0;
    const fakeLsp: LspConnection = {
      rootPath: "D:/Try/Typst",
      transport: { send: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() },
      request: vi.fn().mockImplementation(async (cmd) => {
        if (cmd === "workspace/executeCommand") {
          callCount++;
          if (callCount < 3) {
            throw { code: -32002, message: "not initialized yet" };
          }
          return { staticServerPort: 61234 };
        }
        return null;
      }),
      notify: vi.fn(),
      onNotification: vi.fn(),
      close: vi.fn(),
    };

    await startPreview(fakeFrame, fakeLsp, "D:/Try/Typst/paper.typ");
    expect(callCount).toBe(3);
    expect(fakeFrame.src).toBe("http://127.0.0.1:61234/");
  });
});
