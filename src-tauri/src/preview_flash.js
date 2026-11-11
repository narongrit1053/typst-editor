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

  function start() {
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
