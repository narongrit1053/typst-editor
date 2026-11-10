export function filterFiles(files: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...files];

  return files.filter((f) => {
    const lower = f.toLowerCase();
    const baseName = lower.split(/[\\/]/).pop() || lower;
    return baseName.includes(q) || lower.includes(q);
  });
}

export function showQuickOpen(files: string[], onSelect: (path: string) => void): void {
  const modal = document.getElementById("modal-quick-open");
  const input = document.getElementById("quick-open-input") as HTMLInputElement | null;
  const listEl = document.getElementById("quick-open-list");

  if (!modal || !input || !listEl) return;

  modal.classList.remove("hidden");
  input.value = "";
  input.focus();

  let selectedIndex = 0;
  let currentFiltered = filterFiles(files, "");

  function render() {
    listEl!.replaceChildren();
    if (currentFiltered.length === 0) {
      const empty = document.createElement("div");
      empty.style.padding = "10px 16px";
      empty.style.color = "var(--muted)";
      empty.textContent = "No matching files";
      listEl!.appendChild(empty);
      return;
    }

    currentFiltered.forEach((file, idx) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "quick-open-item";
      if (idx === selectedIndex) {
        item.classList.add("selected");
      }

      const baseName = file.split(/[\\/]/).pop() || file;
      const span = document.createElement("span");
      const strong = document.createElement("strong");
      strong.textContent = baseName;
      span.appendChild(strong);
      const small = document.createElement("small");
      small.style.color = "var(--muted)";
      small.textContent = file;
      item.appendChild(span);
      item.appendChild(small);

      item.addEventListener("click", () => {
        close();
        onSelect(file);
      });

      listEl!.appendChild(item);
    });
  }

  function close() {
    modal!.classList.add("hidden");
    input!.removeEventListener("input", handleInput);
    input!.removeEventListener("keydown", handleKeydown);
    modal!.removeEventListener("click", handleBackdropClick);
  }

  function handleInput() {
    currentFiltered = filterFiles(files, input!.value);
    selectedIndex = 0;
    render();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (currentFiltered.length > 0) {
        selectedIndex = (selectedIndex + 1) % currentFiltered.length;
        render();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (currentFiltered.length > 0) {
        selectedIndex = (selectedIndex - 1 + currentFiltered.length) % currentFiltered.length;
        render();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (currentFiltered.length > 0 && currentFiltered[selectedIndex]) {
        const picked = currentFiltered[selectedIndex];
        close();
        onSelect(picked);
      }
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === modal) {
      close();
    }
  }

  input.addEventListener("input", handleInput);
  input.addEventListener("keydown", handleKeydown);
  modal.addEventListener("click", handleBackdropClick);

  render();
}
