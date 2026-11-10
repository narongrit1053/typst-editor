import { describe, it, expect } from "vitest";
import { filterFiles } from "./quick_open";

describe("Quick open filterFiles", () => {
  const files = [
    "D:/project/main.typ",
    "D:/project/chapter1.typ",
    "D:/project/chapter2.typ",
    "D:/project/refs.bib",
    "D:/project/images/plot.png",
  ];

  it("returns all files when query is empty", () => {
    expect(filterFiles(files, "")).toEqual(files);
  });

  it("filters files matching query case-insensitively", () => {
    const res = filterFiles(files, "chap");
    expect(res).toEqual([
      "D:/project/chapter1.typ",
      "D:/project/chapter2.typ",
    ]);
  });

  it("matches anywhere in filename or path", () => {
    const res = filterFiles(files, ".bib");
    expect(res).toEqual(["D:/project/refs.bib"]);
  });
});
