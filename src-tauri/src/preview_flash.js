// Injected into every frame; only acts inside the Tinymist preview (served from 127.0.0.1).
// Tinymist marks an editor->preview jump with a ".typst-jump-ripple" div at the target point.
// We hide that ripple and flash orange boxes over the rendered text under it instead.
(() => {
  if (location.hostname !== "127.0.0.1") return;

  // Tinymist sends one jump request per click, single or double; tell the app which clicks were
  // double so it only moves the editor on a double-click.
  document.addEventListener("dblclick", () => parent.postMessage({ type: "kong-preview-dblclick" }, "*"), true);

  // Zoom: the app's +/- buttons send "kong-zoom"; we trigger Tinymist's own Ctrl+= / Ctrl+- handler
  // (listening on document.body) and report the real level back. The level is the document's
  // rendered width relative to its width before the first zoom on this page load (fit-to-width).
  let fitWidth = 0;
  const docWidth = () => document.querySelector(".typst-doc")?.getBoundingClientRect().width || 0;
  const captureFit = () => {
    if (!fitWidth) fitWidth = docWidth();
  };
  const reportZoom = () =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const w = docWidth();
        if (w && fitWidth) parent.postMessage({ type: "kong-zoom-level", ratio: w / fitWidth }, "*");
      }),
    );

  window.addEventListener("message", (e) => {
    if (e.source !== parent || e.data?.type !== "kong-zoom") return;
    captureFit();
    const key = e.data.dir === "in" ? "=" : "-";
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true }));
    reportZoom();
  });
  // Ctrl+scroll and Ctrl+=/- inside the preview zoom natively; keep the app's label in sync.
  // Capture phase runs before Tinymist's handlers, so fitWidth is taken before the first zoom.
  document.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey) return;
      captureFit();
      reportZoom();
    },
    { capture: true, passive: true },
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (!e.isTrusted || !e.ctrlKey || (e.key !== "=" && e.key !== "-")) return;
      captureFit();
      reportZoom();
    },
    true,
  );

  // HTML export: the app sends "kong-export-html"; we answer with a standalone page built from what
  // the preview renders — vector SVG pages plus Tinymist's transparent text layer, so the result
  // looks exactly like the preview while text stays selectable/searchable and links still work.
  window.addEventListener("message", (e) => {
    if (e.source !== parent || e.data?.type !== "kong-export-html") return;
    const reply = (payload) => parent.postMessage({ type: "kong-export-html-result", id: e.data.id, ...payload }, "*");
    const svgEl = document.querySelector("#typst-app > svg");
    // Glyph outlines and clip paths live in a separate shared SVG that the pages <use>.
    const resources = document.getElementById("typst-svg-resources");
    if (!svgEl || !resources) return reply({ error: "The preview has not rendered yet." });
    const xml = new XMLSerializer();
    const tag = xml.serializeToString(svgEl);
    const openEnd = tag.indexOf(">");
    // Replace the viewer's fixed on-screen size so the page scales with the window via its viewBox.
    const svg =
      tag.slice(0, openEnd).replace(/\s(width|height|style|data-applied-[a-z-]+)="[^"]*"/g, "") +
      ' style="display:block;width:100%;height:auto"' +
      tag.slice(openEnd);
    const styles = [...document.querySelectorAll("style")]
      .map((s) => s.textContent)
      .join("\n")
      .replace(/\.hover \.typst-text\s*\{[^}]*\}/g, "") // preview-only hover highlighting
      .replace(/\.typst-text:hover\s*\{[^}]*\}/g, "");
    const pageWidthPx = Math.round(((Number(svgEl.getAttribute("data-width")) || 595) * 96) / 72);
    const title = (e.data.title || document.title || "Document").replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"));
    reply({
      html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
${styles}
/* The preview page pins html/body to the viewport; a document should scroll normally. */
html, body { margin: 0; width: auto; height: auto; background: #e8e8ec; }
body { padding: 24px 12px; }
.typst-export { width: 100%; max-width: ${pageWidthPx}px; margin: 0 auto; }
</style>
</head>
<body>
${xml.serializeToString(resources)}
<div class="typst-export">${svg}</div>
</body>
</html>
`,
    });
  });

  const css = `
    .typst-jump-ripple { visibility: hidden !important; }
    .kong-flash {
      position: absolute;
      pointer-events: none;
      border-radius: 3px;
      background: rgba(255, 140, 0, 0.45);
      animation: kong-flash 2s ease-out forwards;
      z-index: 10;
    }
    @keyframes kong-flash { to { opacity: 0; } }
  `;

  // Smallest text run containing the point, else the nearest one within 40px.
  function findText(x, y) {
    let best = null;
    let bestScore = Infinity;
    for (const el of document.querySelectorAll(".typst-text")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.bottom < 0 || r.top > innerHeight) continue;
      const dx = Math.max(r.left - x, 0, x - r.right);
      const dy = Math.max(r.top - y, 0, y - r.bottom);
      const dist = Math.hypot(dx, dy);
      if (dist > 40) continue;
      const score = dist * 1e6 + r.width * r.height;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  // The editor sends one jump per sampled column of a source line, so jump marks arrive in a
  // burst. Collect the text runs they land on and flash them together once the burst ends.
  const pending = new Set();
  let host = null;
  let timer = null;

  // Jump points don't land on every glyph (math especially), so also take every text run that
  // sits between the first and last hit in page order and inside the hits' vertical band.
  function fillBetween(hits) {
    const all = [...document.querySelectorAll(".typst-text")];
    const idx = [...hits].map((el) => all.indexOf(el)).filter((i) => i >= 0);
    if (idx.length < 2) return hits;
    const rects = [...hits].map((el) => el.getBoundingClientRect());
    const top = Math.min(...rects.map((r) => r.top)) - 6;
    const bottom = Math.max(...rects.map((r) => r.bottom)) + 6;
    const out = new Set(hits);
    for (let i = Math.min(...idx); i <= Math.max(...idx); i++) {
      const r = all[i].getBoundingClientRect();
      if (r.width > 0 && r.top >= top && r.bottom <= bottom) out.add(all[i]);
    }
    return out;
  }

  function flushFlash() {
    timer = null;
    if (!host) return;
    const h = host.getBoundingClientRect();
    for (const el of fillBetween(pending)) {
      const r = el.getBoundingClientRect();
      const box = document.createElement("div");
      box.className = "kong-flash";
      // Relative to the scroll host so boxes move with smooth scrolling.
      box.style.left = `${r.left - h.left + host.scrollLeft - 2}px`;
      box.style.top = `${r.top - h.top + host.scrollTop - 2}px`;
      box.style.width = `${r.width + 4}px`;
      box.style.height = `${r.height + 4}px`;
      box.addEventListener("animationend", () => box.remove());
      host.appendChild(box);
    }
    pending.clear();
  }

  function onRipple(ripple) {
    if (!ripple.parentElement) return;
    host = ripple.parentElement;
    const p = ripple.getBoundingClientRect();
    const el = findText(p.left, p.top);
    if (el) pending.add(el);
    clearTimeout(timer);
    timer = setTimeout(flushFlash, 150);
  }

  // ---- Comments (src/comments.ts owns the data) ----
  // The app sends the file's comments as "kong-comments"; we draw highlights and sticky notes in
  // our own layer (Tinymist redraws its SVG on every edit) and report what the user does.
  const commentCss = `
    .kong-comments-layer { position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 20; }
    .kong-hl { position: absolute; pointer-events: none; mix-blend-mode: multiply; opacity: 0.5; border-radius: 2px; }
    .kong-hl.moved { opacity: 0.25; outline: 1px dashed #777; }
    .kong-note { position: absolute; width: 200px; box-sizing: border-box; padding: 4px 8px 8px; background: #fffdf3;
      border: 1px solid rgba(0,0,0,.15); border-top: 5px solid var(--c); border-radius: 6px;
      box-shadow: 0 4px 14px rgba(0,0,0,.2); font: 13px/1.4 system-ui, sans-serif; color: #222; }
    .kong-note.moved { border-style: dashed; border-top-style: solid; }
    .kong-note-head { display: flex; align-items: center; gap: 2px; margin: 0 -4px 2px; font-size: 11px; color: #a06000; }
    .kong-note-head span { flex: 1; }
    .kong-note-head button, .kong-note-actions button { border: none; background: none; cursor: pointer; color: #555; font: inherit; padding: 1px 5px; border-radius: 4px; }
    .kong-note-head button:hover, .kong-note-actions button:hover { background: rgba(0,0,0,.08); }
    .kong-note-actions .primary { background: #1f7a8c; color: #fff; }
    .kong-note-body { white-space: pre-wrap; overflow-wrap: anywhere; cursor: pointer; max-height: 180px; overflow: auto; }
    .kong-note textarea { width: 100%; box-sizing: border-box; min-height: 64px; font: inherit; resize: vertical; }
    .kong-note-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 4px; }
    .kong-note-tab { position: absolute; width: 24px; height: 24px; border: none; border-radius: 5px; background: var(--c);
      cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,.25); font-size: 12px; padding: 0; }
    .kong-palette { position: fixed; top: 10px; right: 16px; z-index: 30; display: flex; gap: 8px; align-items: center;
      background: #fff; color: #333; border-radius: 8px; padding: 6px 10px; box-shadow: 0 3px 12px rgba(0,0,0,.25);
      font: 12px system-ui, sans-serif; }
    .kong-palette[hidden] { display: none; }
    .kong-swatch { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #fff; outline: 1px solid #aaa; cursor: pointer; padding: 0; }
    .kong-swatch.active { outline: 2px solid #222; }
    .kong-drag-handle { cursor: move; user-select: none; }
    .kong-links { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; }
    .kong-tool-on #typst-container-main { cursor: text; }
    .kong-tool-on .tsel::selection { background: transparent; }
  `;
  const COLORS = { yellow: "#ffd54a", green: "#7bd88f", blue: "#6cb6ff", pink: "#ff8fc8" };
  let comments = [];
  let tool = { on: false, color: "yellow" };
  let draft = null; // { anchor, color, body }: a selection waiting for its note text
  let editing = null; // { id, body }: a note being edited
  const collapsed = new Set();
  let layer = null;
  let palette = null;
  let redrawTimer = null;
  const toApp = (msg) => parent.postMessage(msg, "*");
  const scroller = () => document.getElementById("typst-container-main");
  const pageBox = (n) => document.querySelector(`.typst-page-inner[data-page-number="${n}"]`)?.getBoundingClientRect();
  const strip = (s) => s.replace(/\s+/g, "");
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  // A page's text without whitespace, plus where each character lives, so text can be matched
  // however Tinymist splits it into lines.
  function pageChars(n) {
    const chars = [];
    let text = "";
    for (const div of document.querySelectorAll(`g.typst-page[data-page-number="${n}"] .tsel`)) {
      const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
      for (let node; (node = walker.nextNode()); ) {
        for (let i = 0; i < node.data.length; i++) {
          if (/\s/.test(node.data[i])) continue;
          text += node.data[i];
          chars.push([node, i]);
        }
      }
    }
    return { text, chars };
  }

  // Range boxes for styled text include per-glyph boxes inside the line box; drop those so the
  // highlight doesn't stack darker.
  function outerRects(list) {
    const rs = [...list].filter((r) => r.width > 0 && r.height > 0);
    const inside = (a, b) => a !== b && a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5;
    return rs.filter((a, i) => !rs.some((b, j) => inside(a, b) && (!inside(b, a) || j < i)));
  }

  function nearest(hay, needle, near) {
    let best = -1;
    for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) {
      if (best < 0 || Math.abs(i - near) < Math.abs(best - near)) best = i;
    }
    return best;
  }

  // The anchor's text found again in the current render: { page, rects } in client coords, or null.
  function locate(a) {
    const needle = strip(a.text || "");
    if (!needle) return null;
    const pages = a.page != null ? [a.page] : [...document.querySelectorAll("g.typst-page")].map((g) => g.getAttribute("data-page-number"));
    for (const n of pages) {
      const { text, chars } = pageChars(n);
      const i = nearest(text, needle, a.index || 0);
      if (i < 0) continue;
      const last = chars[i + needle.length - 1];
      const r = document.createRange();
      r.setStart(chars[i][0], chars[i][1]);
      r.setEnd(last[0], last[1] + 1);
      const rects = outerRects(r.getClientRects());
      if (rects.length) return { page: Number(n), rects };
    }
    return null;
  }

  // Where the anchor was when saved (its text is gone or changed).
  function savedRects(a) {
    const p = a.page != null && pageBox(a.page);
    if (!p || !a.rects) return [];
    return a.rects.map(([x, y, w, h]) => new DOMRect(p.left + x * p.width, p.top + y * p.height, w * p.width, h * p.height));
  }

  function scheduleRedraw() {
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(redraw, 80);
  }

  function noteCard(it, color) {
    const c = it.c;
    const card = el("div", it.found ? "kong-note" : "kong-note moved");
    card.style.setProperty("--c", color);
    const head = el("div", "kong-note-head");
    head.append(el("span", null, it.found ? "" : "text changed"));
    const btn = (label, title, fn) => {
      const b = el("button", null, label);
      b.type = "button";
      b.title = title;
      b.setAttribute("aria-label", title);
      b.addEventListener("click", fn);
      return b;
    };
    const isDraft = c.id === "__draft";
    const isEditing = isDraft || editing?.id === c.id;
    if (!isDraft) {
      head.classList.add("kong-drag-handle");
      head.title = "Drag to move the note on this page";
      head.addEventListener("mousedown", (e) => startNoteDrag(e, card, it));
    }
    if (!isEditing) {
      if (c.note) head.append(btn("↺", "Put the note back beside its text", () => moveNote(c, null)));
      head.append(
        btn("✎", "Edit note", () => {
          editing = { id: c.id, body: c.body };
          draft = null;
          redraw();
        }),
        btn("–", "Collapse note", () => {
          collapsed.add(c.id);
          redraw();
        }),
        btn("✕", "Delete note", () => toApp({ type: "kong-comment-delete", id: c.id })),
      );
    }
    card.append(head);
    if (isEditing) {
      const state = isDraft ? draft : editing;
      const ta = el("textarea");
      ta.placeholder = "Write a note… (Ctrl+Enter to save)";
      ta.value = state.body;
      ta.addEventListener("input", () => (state.body = ta.value));
      const save = () => {
        const body = ta.value.trim();
        if (!body) return;
        if (isDraft) {
          toApp({ type: "kong-comment-create", color: draft.color, preview: draft.anchor, body });
          draft = null;
        } else {
          if (body !== c.body) toApp({ type: "kong-comment-edit", id: c.id, body });
          editing = null;
        }
        redraw();
      };
      const cancel = () => {
        if (isDraft) draft = null;
        else editing = null;
        redraw();
      };
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.ctrlKey) save();
        if (e.key === "Escape") cancel();
      });
      // Tinymist binds space, g/h/j/k/l/t… on window/body and cancels them; keep typing to ourselves.
      for (const type of ["keydown", "keypress", "keyup"]) ta.addEventListener(type, (e) => e.stopPropagation());
      const actions = el("div", "kong-note-actions");
      const ok = btn("Save", "Save note", save);
      ok.className = "primary";
      actions.append(btn("Cancel", "Cancel", cancel), ok);
      card.append(ta, actions);
      requestAnimationFrame(() => ta.isConnected && ta.focus());
    } else {
      const body = el("div", "kong-note-body", c.body);
      body.title = "Show in editor";
      body.addEventListener("click", () => toApp({ type: "kong-comment-select", id: c.id }));
      card.append(body);
    }
    return card;
  }

  // ---- Moving a sticky note (within its page; saved as fractions of the page) ----
  let noteDrag = null; // { node, it, dx, dy, pos }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));

  function startNoteDrag(e, node, it) {
    if (e.button !== 0 || e.target.closest("button")) return;
    e.preventDefault();
    const r = node.getBoundingClientRect();
    noteDrag = { node, it, dx: e.clientX - r.left, dy: e.clientY - r.top, pos: null };
    layer?.querySelector(`[data-link="${CSS.escape(it.c.id)}"]`)?.remove();
  }

  function onNoteDragMove(e) {
    if (!noteDrag) return;
    const { node, it } = noteDrag;
    const p = pageBox(it.page);
    const host = scroller();
    if (!p || !host) return;
    const h = host.getBoundingClientRect();
    const x = clamp(e.clientX - noteDrag.dx, p.left, p.right - node.offsetWidth);
    const y = clamp(e.clientY - noteDrag.dy, p.top, p.bottom - node.offsetHeight);
    node.style.left = `${x - h.left + host.scrollLeft}px`;
    node.style.top = `${y - h.top + host.scrollTop}px`;
    noteDrag.pos = [(x - p.left) / p.width, (y - p.top) / p.height];
  }

  function onNoteDragEnd() {
    const d = noteDrag;
    noteDrag = null;
    if (!d) return;
    if (d.pos) moveNote(d.it.c, d.pos.map((v) => Math.round(v * 1e4) / 1e4));
    else redraw();
  }

  function moveNote(c, note) {
    if (note) c.note = note;
    else delete c.note;
    toApp({ type: "kong-comment-move", id: c.id, note });
    redraw();
  }

  function redraw() {
    const host = scroller();
    if (!host || noteDrag) return; // don't rebuild the note under the pointer
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    if (!layer || !layer.isConnected) {
      layer = el("div", "kong-comments-layer");
      // Keep Tinymist's drag-to-pan off our notes so their buttons and text boxes work.
      layer.addEventListener("mousedown", (e) => e.stopPropagation());
      host.appendChild(layer);
    }
    layer.replaceChildren();
    // Mid re-render the pages can be briefly missing; try again shortly.
    if ((comments.length || draft) && !document.querySelector(".typst-page-inner")) return scheduleRedraw();
    const h = host.getBoundingClientRect();
    const local = (x, y) => [x - h.left + host.scrollLeft, y - h.top + host.scrollTop];

    const items = [];
    for (const c of comments) {
      const a = c.preview || (c.quote ? { text: c.quote, page: null, index: 0 } : null); // v1 comments: find by text
      if (!a) continue;
      const found = locate(a);
      items.push({ c, found: !!found, page: found ? found.page : a.page, rects: found ? found.rects : savedRects(a) });
    }
    if (draft) {
      const found = locate(draft.anchor);
      items.push({ c: { id: "__draft", color: draft.color, body: "" }, found: true, page: draft.anchor.page, rects: found ? found.rects : savedRects(draft.anchor) });
    }

    const placed = items.filter((it) => it.rects.length);
    for (const it of placed) {
      for (const r of it.rects) {
        const b = el("div", it.found ? "kong-hl" : "kong-hl moved");
        const [x, y] = local(r.left, r.top);
        Object.assign(b.style, { left: `${x}px`, top: `${y}px`, width: `${r.width}px`, height: `${r.height}px`, background: COLORS[it.c.color] || COLORS.yellow });
        layer.appendChild(b);
      }
    }

    // Moved notes get a dashed line back to their highlight.
    const links = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    links.setAttribute("class", "kong-links");
    layer.appendChild(links);

    // Notes sit beside the page when there is room, else inside its right edge; stacked so they don't overlap.
    // A note the user moved stays where it was dropped instead.
    placed.sort((a, b) => a.rects[0].top - b.rects[0].top);
    let bottom = -Infinity;
    for (const it of placed) {
      const color = COLORS[it.c.color] || COLORS.yellow;
      const p = pageBox(it.page) || it.rects[0];
      const isOpen = it.c.id === "__draft" || editing?.id === it.c.id || !collapsed.has(it.c.id);
      let node;
      if (isOpen) {
        node = noteCard(it, color);
      } else {
        node = el("button", "kong-note-tab", "💬");
        node.type = "button";
        node.title = it.c.body;
        node.setAttribute("aria-label", "Open note");
        node.style.setProperty("--c", color);
        node.addEventListener("click", () => {
          collapsed.delete(it.c.id);
          redraw();
        });
      }
      layer.appendChild(node);
      const w = node.offsetWidth;
      const pb = it.c.note && pageBox(it.page);
      if (pb) {
        const x = clamp(pb.left + it.c.note[0] * pb.width, pb.left, pb.right - w);
        const y = clamp(pb.top + it.c.note[1] * pb.height, pb.top, pb.bottom - node.offsetHeight);
        const [lx, ly] = local(x, y);
        node.style.left = `${lx}px`;
        node.style.top = `${ly}px`;
        const r0 = it.rects[0];
        const [hx, hy] = local(r0.left + r0.width / 2, r0.top + r0.height / 2);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("data-link", it.c.id);
        line.setAttribute("x1", hx);
        line.setAttribute("y1", hy);
        line.setAttribute("x2", clamp(hx, lx, lx + w));
        line.setAttribute("y2", clamp(hy, ly, ly + node.offsetHeight));
        line.setAttribute("stroke", color);
        line.setAttribute("stroke-width", "2");
        line.setAttribute("stroke-dasharray", "5 4");
        links.appendChild(line);
        continue;
      }
      const viewRight = Math.min(h.right, innerWidth); // the host can be wider than the window
      const roomRight = viewRight - p.right >= w + 16;
      const [px] = local(roomRight ? p.right + 8 : Math.min(p.right, viewRight) - w - 8, 0);
      const [, ty] = local(0, it.rects[0].top - 4);
      const top = Math.max(ty, bottom + 6);
      node.style.left = `${px}px`;
      node.style.top = `${top}px`;
      bottom = top + node.offsetHeight;
    }
  }

  function drawPalette() {
    if (!palette) {
      palette = el("div", "kong-palette");
      palette.addEventListener("mousedown", (e) => e.stopPropagation());
      document.body.appendChild(palette);
    }
    palette.hidden = !tool.on;
    palette.replaceChildren(el("span", null, "Select text to highlight"));
    for (const [key, css] of Object.entries(COLORS)) {
      const s = el("button", key === tool.color ? "kong-swatch active" : "kong-swatch");
      s.type = "button";
      s.title = `${key[0].toUpperCase()}${key.slice(1)} highlight`;
      s.setAttribute("aria-label", s.title);
      s.setAttribute("aria-pressed", String(key === tool.color));
      s.style.background = css;
      s.addEventListener("click", () => {
        tool.color = key;
        toApp({ type: "kong-comment-tool", color: key });
        if (draft) draft.color = key;
        drawPalette();
        redraw();
      });
      palette.appendChild(s);
    }
  }

  // Highlighter drags are tracked here rather than with the browser's selection: Tinymist's text
  // layer boxes overlap on lines with mixed styles, so native hit-testing picks the wrong run.
  // We pick characters by their own on-screen boxes instead.
  let drag = null; // { page, chars, boxes, a, b } (a/b: indices of the first/last character under the drag)

  function pageAt(x, y) {
    let best = null;
    let bestDist = Infinity;
    for (const r of document.querySelectorAll(".typst-page-inner")) {
      const b = r.getBoundingClientRect();
      const d = y < b.top ? b.top - y : y > b.bottom ? y - b.bottom : 0;
      if (d < bestDist) {
        bestDist = d;
        best = Number(r.getAttribute("data-page-number"));
      }
    }
    return best;
  }

  function charAt(boxes, x, y) {
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (!b.width) continue;
      const dx = x < b.left ? b.left - x : x > b.right ? x - b.right : 0;
      const dy = y < b.top ? b.top - y : y > b.bottom ? y - b.bottom : 0;
      const score = dy * 10 + dx; // stay on the pointer's line first
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  function dragRange(d) {
    const lo = Math.min(d.a, d.b);
    const hi = Math.max(d.a, d.b);
    const r = document.createRange();
    r.setStart(d.chars[lo][0], d.chars[lo][1]);
    r.setEnd(d.chars[hi][0], d.chars[hi][1] + 1);
    return { r, lo };
  }

  function drawDrag() {
    if (!drag || !layer) return;
    for (const old of layer.querySelectorAll(".kong-drag")) old.remove();
    const host = scroller();
    const h = host.getBoundingClientRect();
    for (const rc of outerRects(dragRange(drag).r.getClientRects())) {
      const b = el("div", "kong-hl kong-drag");
      Object.assign(b.style, {
        left: `${rc.left - h.left + host.scrollLeft}px`,
        top: `${rc.top - h.top + host.scrollTop}px`,
        width: `${rc.width}px`,
        height: `${rc.height}px`,
        background: COLORS[tool.color],
      });
      layer.appendChild(b);
    }
  }

  const ours = (t) => layer?.contains(t) || palette?.contains(t);

  function onToolDown(e) {
    if (!tool.on || e.button !== 0 || ours(e.target)) return;
    // Capture phase on window: keeps Tinymist from panning or jumping while highlighting.
    e.stopPropagation();
    e.preventDefault();
    const page = pageAt(e.clientX, e.clientY);
    if (page == null) return;
    const { chars } = pageChars(page);
    const r = document.createRange();
    const boxes = chars.map(([n, i]) => {
      r.setStart(n, i);
      r.setEnd(n, i + 1);
      return r.getBoundingClientRect();
    });
    const a = charAt(boxes, e.clientX, e.clientY);
    if (a < 0) return;
    if (!layer) redraw();
    drag = { page, chars, boxes, a, b: a, moved: false };
    drawDrag();
  }

  function onToolMove(e) {
    if (!drag) return;
    e.stopPropagation();
    const b = charAt(drag.boxes, e.clientX, e.clientY);
    if (b >= 0 && b !== drag.b) {
      drag.b = b;
      drag.moved = true;
      drawDrag();
    }
  }

  function onToolUp(e) {
    if (!drag) return;
    e.stopPropagation();
    const d = drag;
    drag = null;
    if (!d.moved) {
      redraw(); // a plain click: nothing to highlight
      return;
    }
    const { r, lo } = dragRange(d);
    const p = pageBox(d.page);
    const text = r.toString().trim();
    if (!strip(text) || !p) return redraw();
    const round = (v) => Math.round(v * 1e4) / 1e4;
    const rects = outerRects(r.getClientRects()).map((x) => [(x.left - p.left) / p.width, (x.top - p.top) / p.height, x.width / p.width, x.height / p.height].map(round));
    draft = { anchor: { page: d.page, text, index: lo, rects }, color: tool.color, body: "" };
    editing = null;
    redraw();
  }

  // Ask Tinymist (over its own websocket, as its click handler does) for the source position of a page point.
  function sendSrcPoint(page, x, y) {
    const sock = document.getElementById("typst-container")?.typstWebsocket;
    const g = document.querySelector(`g.typst-page[data-page-number="${page}"]`);
    const p = pageBox(page);
    if (!sock || sock.readyState !== 1 || !g || !p) return false;
    const w = parseFloat(g.getAttribute("data-page-width"));
    const ht = parseFloat(g.getAttribute("data-page-height"));
    sock.send(`src-point ${JSON.stringify({ page_no: page + 1, x: ((x - p.left) / p.width) * w, y: ((y - p.top) / p.height) * ht })}`);
    return true;
  }

  window.addEventListener("message", (e) => {
    if (e.source !== parent || !e.data) return;
    if (e.data.type === "kong-comments") {
      comments = e.data.comments || [];
      tool = e.data.tool || tool;
      if (!tool.on) draft = null;
      document.body.classList.toggle("kong-tool-on", !!tool.on);
      if (editing && !comments.some((c) => c.id === editing.id)) editing = null;
      drawPalette();
      redraw();
    } else if (e.data.type === "kong-src-request") {
      // The app pairs the next two source positions it receives with this new comment: start, then end.
      const a = e.data.anchor;
      const rects = locate(a)?.rects || savedRects(a);
      const first = rects[0];
      const last = rects[rects.length - 1];
      const ok =
        first &&
        sendSrcPoint(a.page, first.left + 1, first.top + first.height / 2) &&
        sendSrcPoint(a.page, last.right - 1, last.top + last.height / 2);
      if (!ok) toApp({ type: "kong-src-none" });
    }
  });

  function startComments() {
    const style = document.createElement("style");
    style.textContent = commentCss;
    document.head.appendChild(style);
    window.addEventListener("mousedown", onToolDown, true);
    window.addEventListener("mousemove", onToolMove, true);
    window.addEventListener("mouseup", onToolUp, true);
    window.addEventListener("mousemove", onNoteDragMove);
    window.addEventListener("mouseup", onNoteDragEnd);
    // While highlighting, a click must not also become a Tinymist jump.
    window.addEventListener("click", (e) => tool.on && !ours(e.target) && e.stopPropagation(), true);
    // Re-place everything after Tinymist re-renders or zooms (but not for our own drawing).
    new MutationObserver((records) => {
      if (!comments.length && !draft) return;
      if (records.some((r) => !ours(r.target) && r.target !== layer)) scheduleRedraw();
    }).observe(document.body, { childList: true, subtree: true, attributes: true });
    window.addEventListener("resize", scheduleRedraw);
    // Notes stay inside the visible width, so follow horizontal scrolling.
    document.addEventListener("scroll", () => (comments.length || draft) && scheduleRedraw(), true);
    toApp({ type: "kong-preview-ready" });
  }

  function start() {
    startComments();
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    new MutationObserver((records) => {
      for (const rec of records) {
        for (const n of rec.addedNodes) {
          if (n.nodeType === 1 && n.classList.contains("typst-jump-ripple")) onRipple(n);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
