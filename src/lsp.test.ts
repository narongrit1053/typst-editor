import { describe, it, expect } from "vitest";
import { pathToUri, uriToPath } from "./lsp";

describe("pathToUri and uriToPath", () => {
  it("converts windows paths properly", () => {
    expect(pathToUri("D:\\Try\\Typst\\main.typ")).toBe("file:///D:/Try/Typst/main.typ");
    expect(pathToUri("D:\\งาน\\my doc.typ")).toBe("file:///D:/%E0%B8%87%E0%B8%B2%E0%B8%99/my%20doc.typ");
    expect(pathToUri("C:\\a#b\\c%d.typ")).toBe("file:///C:/a%23b/c%25d.typ");
  });

  it("converts file URIs back to Windows paths", () => {
    expect(uriToPath("file:///D:/Try/Typst/main.typ")).toBe("D:\\Try\\Typst\\main.typ");
    expect(uriToPath("file:///D:/%E0%B8%87%E0%B8%B2%E0%B8%99/my%20doc.typ")).toBe("D:\\งาน\\my doc.typ");
  });
});
