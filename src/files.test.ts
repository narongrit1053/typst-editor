import { describe, it, expect } from "vitest";
import { sortFileNodes, FileNode, isImagePath } from "./files";
import { extractDialogPath, lineSampleColumns } from "./main";

describe("isImagePath", () => {
  it("matches image extensions case-insensitively", () => {
    expect(isImagePath("D:/proj/fig/Plot.PNG")).toBe(true);
    expect(isImagePath("D:/proj/logo.svg")).toBe(true);
  });

  it("rejects typst files and extensionless names", () => {
    expect(isImagePath("D:/proj/main.typ")).toBe(false);
    expect(isImagePath("D:/proj/png")).toBe(false);
  });
});

describe("File tree sorting", () => {
  it("sorts directories first, then alphabetical case-insensitively", () => {
    const raw: FileNode[] = [
      { name: "chapter2.typ", path: "D:/proj/chapter2.typ", isDir: false },
      { name: "images", path: "D:/proj/images", isDir: true },
      { name: "chapter1.typ", path: "D:/proj/chapter1.typ", isDir: false },
      { name: "Docs", path: "D:/proj/Docs", isDir: true },
    ];

    const sorted = sortFileNodes(raw);
    expect(sorted.map((n) => n.name)).toEqual([
      "Docs",
      "images",
      "chapter1.typ",
      "chapter2.typ",
    ]);
  });
});

describe("extractDialogPath", () => {
  it("extracts single string", () => {
    expect(extractDialogPath("C:/test/path")).toBe("C:/test/path");
  });

  it("extracts from array of strings", () => {
    expect(extractDialogPath(["C:/test/path", "C:/other"])).toBe("C:/test/path");
  });

  it("extracts from object with path", () => {
    expect(extractDialogPath({ path: "C:/test/path" })).toBe("C:/test/path");
  });

  it("returns null on null or empty", () => {
    expect(extractDialogPath(null)).toBeNull();
    expect(extractDialogPath([])).toBeNull();
  });
});

describe("lineSampleColumns", () => {
  it("samples every non-space column and ends on the clicked one", () => {
    expect(lineSampleColumns("a b $x$", 3)).toEqual([1, 5, 6, 7, 3]);
  });

  it("caps long lines but still includes the clicked column last", () => {
    const cols = lineSampleColumns("x".repeat(500), 250, 40);
    expect(cols.length).toBeLessThanOrEqual(41);
    expect(cols[0]).toBe(1);
    expect(cols[cols.length - 1]).toBe(250);
  });
});
