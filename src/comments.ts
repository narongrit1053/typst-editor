// Comments left on the preview. Each one is anchored to a piece of source text and saved in a
// sidecar file next to the document (<file>.comments.json), so it survives closing the app.

/** Highlight colors offered in the preview's comment palette (key -> CSS color). */
export const COMMENT_COLORS: Record<string, string> = {
  yellow: "#ffd54a",
  green: "#7bd88f",
  blue: "#6cb6ff",
  pink: "#ff8fc8",
};

/** Where the highlight sits in the preview: page (0-based), the selected text, its index in the
 *  page's whitespace-free text, and its boxes as fractions of the page [x, y, w, h]. */
export interface PreviewAnchor {
  page: number;
  text: string;
  index: number;
  rects: number[][];
}

export interface DocComment {
  id: string;
  body: string;
  /** The source text the comment is attached to ("" when the selection had no source); used to re-find it. */
  quote: string;
  /** 1-based position of the quote when last saved. */
  line: number;
  col: number;
  created: string;
  color: string;
  preview?: PreviewAnchor;
  /** Where the user dragged the sticky note: its top-left as fractions [x, y] of the page. */
  note?: number[];
  /** Its text could not be found; kept (and listed) until the user deletes it. */
  detached?: boolean;
}

export interface CommentRange {
  id: string;
  from: number;
  to: number;
  color?: string;
}

export function sidecarPath(docPath: string): string {
  return `${docPath}.comments.json`;
}

export function parseSidecar(json: string): DocComment[] {
  if (!json.trim()) return [];
  const data = JSON.parse(json);
  if (!data || !Array.isArray(data.comments)) throw new Error("Not a comments file");
  return data.comments
    .filter((x: any) => x && typeof x.id === "string" && typeof x.body === "string" && typeof x.quote === "string")
    .map((x: any) => {
      const okNote = Array.isArray(x.note) && x.note.length === 2 && x.note.every(Number.isFinite);
      const { note, ...rest } = x;
      return { ...rest, color: x.color in COMMENT_COLORS ? x.color : "yellow", ...(okNote ? { note } : {}) };
    });
}

export function serializeSidecar(comments: DocComment[]): string {
  return JSON.stringify({ version: 1, comments }, null, 2) + "\n";
}

export function offsetOf(text: string, line: number, col: number): number {
  let pos = 0;
  for (let l = 1; l < line; l++) {
    const nl = text.indexOf("\n", pos);
    if (nl < 0) return text.length;
    pos = nl + 1;
  }
  const end = text.indexOf("\n", pos);
  const lineEnd = end < 0 ? text.length : text[end - 1] === "\r" ? end - 1 : end;
  return Math.min(pos + Math.max(0, col - 1), lineEnd);
}

export function lineColOf(text: string, offset: number): { line: number; col: number } {
  const before = text.slice(0, offset);
  const lineStart = before.lastIndexOf("\n") + 1;
  return { line: before.split("\n").length, col: offset - lineStart + 1 };
}

const WORD = /[\p{L}\p{N}_]/u;

/** The word under a click, or a single character when the click is not on a word. */
export function wordRangeAt(text: string, offset: number): { from: number; to: number } {
  let at = Math.min(offset, text.length);
  if (at === text.length || !WORD.test(text[at])) {
    if (at > 0 && WORD.test(text[at - 1])) at--;
    else return at < text.length ? { from: at, to: at + 1 } : { from: Math.max(0, at - 1), to: at };
  }
  let from = at;
  let to = at;
  while (from > 0 && WORD.test(text[from - 1])) from--;
  while (to < text.length && WORD.test(text[to])) to++;
  return { from, to };
}

/** Index of the copy of `needle` in `hay` closest to `near`, or -1. */
export function nearestIndexOf(hay: string, needle: string, near: number): number {
  let best = -1;
  if (!needle) return best;
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) {
    if (best < 0 || Math.abs(i - near) < Math.abs(best - near)) best = i;
  }
  return best;
}

/** Places each comment in `text`: at its saved spot if the quote is still there, else at the nearest copy of the quote. */
export function anchorComments(
  text: string,
  comments: DocComment[],
): { comments: DocComment[]; ranges: CommentRange[] } {
  const ranges: CommentRange[] = [];
  const out = comments.map((cm) => {
    if (!cm.quote) return cm; // preview-only: nothing to place in the editor
    const from = nearestIndexOf(text, cm.quote, offsetOf(text, cm.line, cm.col));
    if (from < 0) return { ...cm, detached: true };
    ranges.push({ id: cm.id, from, to: from + cm.quote.length, color: cm.color });
    const { detached, ...rest } = cm;
    return rest;
  });
  return { comments: out, ranges };
}

export function renderComments(
  container: HTMLElement,
  comments: DocComment[],
  actions: { select: (c: DocComment) => void; edit: (c: DocComment) => void; remove: (c: DocComment) => void },
): void {
  container.replaceChildren();
  if (comments.length === 0) {
    const empty = document.createElement("div");
    empty.className = "comments-empty";
    empty.textContent = "No comments. Turn on 💬 Comment, then select text in the preview.";
    container.appendChild(empty);
    return;
  }
  for (const cm of [...comments].sort((a, b) => a.line - b.line || a.col - b.col)) {
    const item = document.createElement("div");
    item.className = cm.detached ? "comment-item detached" : "comment-item";

    const main = document.createElement("button");
    main.type = "button";
    main.className = "comment-main";
    main.title = cm.detached ? "Its text was removed or changed" : "Show in editor and preview";
    const quote = document.createElement("span");
    quote.className = "comment-quote";
    quote.style.borderLeftColor = COMMENT_COLORS[cm.color] || COMMENT_COLORS.yellow;
    const shown = cm.quote || cm.preview?.text || "";
    quote.textContent = cm.detached
      ? `⚠ detached · “${shown}”`
      : cm.quote
        ? `Ln ${cm.line} · “${shown}”`
        : `preview only · “${shown}”`;
    const body = document.createElement("span");
    body.className = "comment-body";
    body.textContent = cm.body;
    main.append(quote, body);
    main.addEventListener("click", () => actions.select(cm));

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "btn-comment-action";
    edit.title = "Edit comment";
    edit.setAttribute("aria-label", "Edit comment");
    edit.textContent = "✎";
    edit.addEventListener("click", () => actions.edit(cm));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn-comment-action";
    del.title = "Delete comment";
    del.setAttribute("aria-label", "Delete comment");
    del.textContent = "✕";
    del.addEventListener("click", () => actions.remove(cm));

    item.append(main, edit, del);
    container.appendChild(item);
  }
}

type LspPos = { line: number; character: number };

/** Source range for text selected in the preview. `start`/`end` are the source positions Tinymist
 *  reported for the selection's first and last glyph (0-based LSP positions), when it found any. */
export function sourceRangeFor(text: string, selected: string, start?: LspPos, end?: LspPos): { from: number; to: number } | null {
  const s = start ? offsetOf(text, start.line + 1, start.character + 1) : 0;
  const quote = selected.trim();
  // Same text in the source (plain prose): exact.
  const hit = nearestIndexOf(text, quote, s);
  if (hit >= 0 && (!start || Math.abs(hit - s) < 2000)) return { from: hit, to: hit + quote.length };
  // Markup in between (*bold*, #emph[...]): span the words under the two points.
  if (start && end) {
    const from = wordRangeAt(text, s).from;
    const to = wordRangeAt(text, offsetOf(text, end.line + 1, end.character + 1)).to;
    if (to > from && to - from <= Math.max(200, quote.length * 4)) return { from, to };
  }
  return null;
}
