// Figure 3.1: highlight words in a sample paragraph and pin a note to them, like the editor does
// on its preview. Nothing is stored.
(() => {
  const text = document.getElementById("demo-text");
  const notesEl = document.getElementById("demo-notes");
  const markBtn = document.getElementById("demo-mark");
  const swatches = [...document.querySelectorAll(".swatch")];
  if (!text || !notesEl) return;

  const source = text.textContent;
  let color = "yellow";
  let highlights = []; // { id, start, end, color, body, editing, draft }
  let lastRange = null; // the selection inside the paragraph, kept for the keyboard button
  let nextId = 1;

  // Character offset of a boundary point within the paragraph.
  const offsetOf = (node, offset) => {
    const r = document.createRange();
    r.selectNodeContents(text);
    r.setEnd(node, offset);
    return r.toString().length;
  };

  function selectionOffsets(range) {
    if (!range || range.collapsed || !text.contains(range.commonAncestorContainer)) return null;
    let start = offsetOf(range.startContainer, range.startOffset);
    let end = offsetOf(range.endContainer, range.endOffset);
    while (start < end && /\s/.test(source[start])) start++;
    while (end > start && /\s/.test(source[end - 1])) end--;
    return end > start ? { start, end } : null;
  }

  function addHighlight(range) {
    const span = selectionOffsets(range);
    if (!span) return;
    // A new highlight replaces any it overlaps; an open draft is dropped.
    highlights = highlights.filter((h) => !h.draft && (h.end <= span.start || h.start >= span.end));
    highlights.push({ id: nextId++, ...span, color, body: "", editing: true, draft: true });
    window.getSelection()?.removeAllRanges();
    lastRange = null;
    render();
  }

  function render() {
    // Paragraph: plain text with <mark>s, rebuilt from the source string.
    const sorted = [...highlights].sort((a, b) => a.start - b.start);
    text.replaceChildren();
    let at = 0;
    for (const h of sorted) {
      text.append(source.slice(at, h.start));
      const m = document.createElement("mark");
      m.dataset.color = h.color;
      m.dataset.id = h.id;
      m.textContent = source.slice(h.start, h.end);
      text.append(m);
      at = h.end;
    }
    text.append(source.slice(at));

    // Notes, stacked beside their marks without overlapping.
    notesEl.replaceChildren();
    let bottom = -Infinity;
    const stacked = matchMedia("(min-width: 721px)").matches;
    for (const h of sorted) {
      const note = noteFor(h);
      notesEl.append(note);
      if (stacked) {
        const mark = text.querySelector(`mark[data-id="${h.id}"]`);
        const top = Math.max(mark.offsetTop + text.offsetTop - 6, bottom + 8);
        note.style.top = `${top}px`;
        bottom = top + note.offsetHeight;
      }
    }
    const ta = notesEl.querySelector("textarea");
    if (ta) ta.focus({ preventScroll: true });
  }

  function button(label, title, onClick, cls) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    if (title) {
      b.title = title;
      b.setAttribute("aria-label", title);
    }
    if (cls) b.className = cls;
    b.addEventListener("click", onClick);
    return b;
  }

  function noteFor(h) {
    const note = document.createElement("div");
    note.className = "note";
    note.style.setProperty("--c", `var(--hl-${h.color})`);
    const quote = source.slice(h.start, h.end);
    if (h.editing) {
      const ta = document.createElement("textarea");
      ta.value = h.body;
      ta.placeholder = "Write a note…";
      ta.setAttribute("aria-label", `Note on “${quote}”`);
      const save = () => {
        const body = ta.value.trim();
        if (!body) return ta.focus();
        Object.assign(h, { body, editing: false, draft: false });
        render();
      };
      const cancel = () => {
        if (h.draft) highlights = highlights.filter((x) => x !== h);
        else h.editing = false;
        render();
      };
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
        if (e.key === "Escape") cancel();
      });
      const actions = document.createElement("div");
      actions.className = "note-actions";
      actions.append(button("Cancel", "", cancel), button("Save", "", save, "primary"));
      note.append(ta, actions);
    } else {
      const head = document.createElement("div");
      head.className = "note-head";
      head.append(
        button("Edit", `Edit the note on “${quote}”`, () => {
          h.editing = true;
          render();
        }),
        button("Delete", `Delete the note on “${quote}”`, () => {
          highlights = highlights.filter((x) => x !== h);
          render();
        }),
      );
      const body = document.createElement("div");
      body.className = "note-body";
      body.textContent = h.body;
      note.append(head, body);
    }
    return note;
  }

  for (const s of swatches) {
    s.addEventListener("click", () => {
      color = s.dataset.color;
      for (const o of swatches) o.setAttribute("aria-pressed", String(o === s));
      const draft = highlights.find((h) => h.draft);
      if (draft) {
        draft.color = color;
        render();
      }
    });
  }

  document.addEventListener("selectionchange", () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && text.contains(sel.anchorNode)) lastRange = sel.getRangeAt(0).cloneRange();
  });
  text.addEventListener("pointerup", () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && !sel.isCollapsed) addHighlight(sel.getRangeAt(0));
  });
  markBtn?.addEventListener("click", () => addHighlight(lastRange));
  window.addEventListener("resize", () => highlights.length && render());
})();
