import { describe, it, expect } from "vitest";
import { sortFileNodes, FileNode } from "./files";

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
