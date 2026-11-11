import { describe, it, expect } from "vitest";
import {
  sidecarPath,
  parseSidecar,
  serializeSidecar,
  wordRangeAt,
  anchorComments,
  offsetOf,
  lineColOf,
  nearestIndexOf,
  sourceRangeFor,
  type DocComment,
} from "./comments";

const c = (over: Partial<DocComment>): DocComment => ({
  id: "a",
  body: "note",
  quote: "world",
  line: 1,
  col: 7,
  created: "2026-11-11T00:00:00.000Z",
  color: "yellow",
  ...over,
});

describe("comments sidecar", () => {
  it("names the sidecar after the document", () => {
    expect(sidecarPath("D:\\p\\main.typ")).toBe("D:\\p\\main.typ.comments.json");
  });

  it("round-trips through serialize/parse", () => {
    const list = [c({}), c({ id: "b", detached: true })];
    expect(parseSidecar(serializeSidecar(list))).toEqual(list);
  });

  it("reads v1 comments (no color) as yellow", () => {
    const { color, ...v1 } = c({});
    expect(parseSidecar(JSON.stringify({ version: 1, comments: [v1] }))[0].color).toBe("yellow");
    expect(parseSidecar(JSON.stringify({ version: 1, comments: [{ ...v1, color: "nope" }] }))[0].color).toBe("yellow");
  });

  it("keeps the preview anchor", () => {
    const preview = { page: 1, text: "world", index: 5, rects: [[0.1, 0.2, 0.05, 0.01]] };
    expect(parseSidecar(serializeSidecar([c({ preview })]))[0].preview).toEqual(preview);
  });

  it("keeps a moved note's position and drops a malformed one", () => {
    expect(parseSidecar(serializeSidecar([c({ note: [0.5, 0.25] })]))[0].note).toEqual([0.5, 0.25]);
    const bad = JSON.stringify({ version: 1, comments: [{ ...c({}), note: ["x", 1] }] });
    expect(parseSidecar(bad)[0].note).toBeUndefined();
  });

  it("treats empty text as no comments", () => {
    expect(parseSidecar("")).toEqual([]);
  });

  it("throws on a corrupt sidecar so the caller never overwrites it", () => {
    expect(() => parseSidecar("{not json")).toThrow();
    expect(() => parseSidecar('{"version":1,"comments":"x"}')).toThrow();
  });
});

describe("nearestIndexOf", () => {
  it("picks the copy closest to the hint", () => {
    expect(nearestIndexOf("ab ab ab", "ab", 4)).toBe(3);
    expect(nearestIndexOf("ab ab ab", "ab", 100)).toBe(6);
    expect(nearestIndexOf("ab", "zz", 0)).toBe(-1);
    expect(nearestIndexOf("ab", "", 0)).toBe(-1);
  });
});

describe("positions", () => {
  const text = "hello world\r\nsecond line";
  it("converts line/col to offset and back", () => {
    expect(offsetOf(text, 2, 1)).toBe(13);
    expect(lineColOf(text, 13)).toEqual({ line: 2, col: 1 });
    expect(offsetOf(text, 99, 99)).toBe(text.length);
  });

  it("expands a click to the word under it", () => {
    expect(wordRangeAt("hello world", 8)).toEqual({ from: 6, to: 11 });
    // Not on a word: one character.
    expect(wordRangeAt("a  b", 2)).toEqual({ from: 2, to: 3 });
    // Just after a word: that word.
    expect(wordRangeAt("a  b", 1)).toEqual({ from: 0, to: 1 });
    // End of text: the character before.
    expect(wordRangeAt("ab", 2)).toEqual({ from: 0, to: 2 });
  });
});

describe("anchorComments", () => {
  it("keeps a comment whose quote is still at its position", () => {
    const r = anchorComments("hello world", [c({})]);
    expect(r.ranges).toEqual([{ id: "a", from: 6, to: 11, color: "yellow" }]);
    expect(r.comments[0].detached).toBeFalsy();
  });

  it("re-finds moved text, preferring the nearest match", () => {
    const text = "world\nnew line\nhello world";
    const r = anchorComments(text, [c({ line: 1, col: 7 })]);
    expect(r.ranges[0]).toMatchObject({ id: "a", from: 0, to: 5 });
    const r2 = anchorComments(text, [c({ line: 3, col: 1 })]);
    expect(r2.ranges[0]).toMatchObject({ id: "a", from: 21, to: 26 });
  });

  it("marks a comment detached when its text is gone, but keeps it", () => {
    const r = anchorComments("hello there", [c({})]);
    expect(r.ranges).toEqual([]);
    expect(r.comments).toHaveLength(1);
    expect(r.comments[0].detached).toBe(true);
  });

  it("leaves preview-only comments (no source text) alone", () => {
    const r = anchorComments("hello", [c({ quote: "" })]);
    expect(r.ranges).toEqual([]);
    expect(r.comments[0].detached).toBeFalsy();
  });

  it("re-attaches a detached comment when its text comes back", () => {
    const r = anchorComments("hello world", [c({ detached: true })]);
    expect(r.ranges).toHaveLength(1);
    expect(r.comments[0].detached).toBeFalsy();
  });
});

describe("comment anchors in the editor", async () => {
  const { EditorState } = await import("@codemirror/state");
  const { commentField, setComments } = await import("./editor");
  const start = () =>
    EditorState.create({ doc: "hello world", extensions: [commentField] }).update({
      effects: setComments.of([{ id: "a", from: 6, to: 11 }]),
    }).state;

  it("moves with text typed before it and does not grow when typing at its edges", () => {
    let s = start().update({ changes: { from: 0, insert: "say " } }).state;
    expect(s.field(commentField)).toEqual([{ id: "a", from: 10, to: 15 }]);
    s = s.update({ changes: [{ from: 10, insert: "<" }, { from: 15, insert: ">" }] }).state;
    const [r] = s.field(commentField);
    expect(s.doc.sliceString(r.from, r.to)).toBe("world");
  });

  it("drops the anchor when its text is deleted (the list then shows it detached)", () => {
    const s = start().update({ changes: { from: 5, to: 11 } }).state;
    expect(s.field(commentField)).toEqual([]);
  });
});

describe("sourceRangeFor", () => {
  const src = "= Intro\nSome *bold* text here.\nSome text again.";
  const at = (off: number) => {
    const { line, col } = lineColOf(src, off);
    return { line: line - 1, character: col - 1 };
  };

  it("prefers the selected text verbatim, nearest the start point", () => {
    const second = src.lastIndexOf("Some text");
    expect(sourceRangeFor(src, "Some text", at(second))).toEqual({ from: second, to: second + 9 });
  });

  it("falls back to the word span between the two points when markup differs", () => {
    const from = src.indexOf("Some *bold*");
    const end = src.indexOf("bold*") + 2;
    expect(sourceRangeFor(src, "Some bold", at(from), at(end))).toEqual({ from, to: from + 10 });
  });

  it("finds verbatim text with no points, and gives up when nothing fits", () => {
    expect(sourceRangeFor(src, "again", undefined, undefined)).toEqual({ from: src.indexOf("again"), to: src.indexOf("again") + 5 });
    expect(sourceRangeFor(src, "missing words", undefined, undefined)).toBeNull();
  });

  it("rejects a point span far longer than the selection", () => {
    const long = "word ".repeat(100);
    expect(sourceRangeFor(long, "zq", { line: 0, character: 0 }, { line: 0, character: 490 })).toBeNull();
  });
});
