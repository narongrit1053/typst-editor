import { describe, it, expect } from "vitest";
import { parseOutlineSymbols } from "./outline";

describe("Document outline parsing", () => {
  it("converts nested LSP document symbols into OutlineItem hierarchy", () => {
    const rawSymbols = [
      {
        name: "1 Introduction",
        range: { start: { line: 2, character: 0 }, end: { line: 2, character: 14 } },
        children: [
          {
            name: "1.1 Motivation",
            range: { start: { line: 5, character: 0 }, end: { line: 5, character: 12 } },
          },
        ],
      },
      {
        name: "2 Method",
        range: { start: { line: 12, character: 0 }, end: { line: 12, character: 8 } },
      },
    ];

    const parsed = parseOutlineSymbols(rawSymbols);
    expect(parsed.length).toBe(2);
    expect(parsed[0].title).toBe("1 Introduction");
    expect(parsed[0].level).toBe(1);
    expect(parsed[0].line).toBe(3); // 1-based
    expect(parsed[0].children?.length).toBe(1);
    expect(parsed[0].children?.[0].title).toBe("1.1 Motivation");
    expect(parsed[0].children?.[0].level).toBe(2);
    expect(parsed[0].children?.[0].line).toBe(6);
    expect(parsed[1].title).toBe("2 Method");
    expect(parsed[1].level).toBe(1);
    expect(parsed[1].line).toBe(13);
  });

  it("handles empty symbols array safely", () => {
    expect(parseOutlineSymbols([])).toEqual([]);
    expect(parseOutlineSymbols(null as any)).toEqual([]);
  });
});
