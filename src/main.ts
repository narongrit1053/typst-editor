function initSplitter() {
  const splitter = document.getElementById("splitter");
  const editorPane = document.getElementById("editor") as HTMLElement;
  const workspace = document.querySelector(".workspace") as HTMLElement;

  if (!splitter || !editorPane || !workspace) return;

  let isDragging = false;

  splitter.addEventListener("pointerdown", (e) => {
    isDragging = true;
    splitter.classList.add("dragging");
    splitter.setPointerCapture(e.pointerId);
  });

  splitter.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const rect = workspace.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const minWidth = rect.width * 0.2;
    const maxWidth = rect.width * 0.8;
    const clamped = Math.max(minWidth, Math.min(maxWidth, x));
    const percent = (clamped / rect.width) * 100;
    editorPane.style.flex = `0 0 ${percent}%`;
  });

  const stopDrag = (e: PointerEvent) => {
    if (isDragging) {
      isDragging = false;
      splitter.classList.remove("dragging");
      try {
        splitter.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  splitter.addEventListener("pointerup", stopDrag);
  splitter.addEventListener("pointercancel", stopDrag);
}

window.addEventListener("DOMContentLoaded", () => {
  initSplitter();
});
