import { describe, it, expect, vi, beforeEach } from "vitest";
import { zoomIn, zoomOut, resetZoom, getZoom, handlePreviewMessage, startPreview, stopPreview } from "./preview";
import { LspConnection } from "./lsp";

describe("preview zoom and controls", () => {
  let fakeFrame: any;

  beforeEach(() => {
    fakeFrame = {
      style: { zoom: "1" },
      src: "",
      contentWindow: {
        location: { reload: vi.fn() },
      },
    };
    resetZoom(fakeFrame);
  });

  it("adjusts zoom in and out with bounds clamping", () => {
    expect(getZoom()).toBe(1.0);

    zoomIn(fakeFrame);
    expect(getZoom()).toBe(1.1);
    expect(fakeFrame.style.zoom).toBe("1.1");

    zoomOut(fakeFrame);
    expect(getZoom()).toBe(1.0);

    // Clamps at minimum 0.5
    for (let i = 0; i < 10; i++) zoomOut(fakeFrame);
    expect(getZoom()).toBe(0.5);

    // Clamps at maximum 2.5
    for (let i = 0; i < 30; i++) zoomIn(fakeFrame);
    expect(getZoom()).toBe(2.5);

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
});
