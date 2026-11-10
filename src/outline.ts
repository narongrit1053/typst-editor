export interface OutlineItem {
  title: string;
  level: number;
  line: number;
  col: number;
  children?: OutlineItem[];
}

export function parseOutlineSymbols(symbols: any[], level = 1): OutlineItem[] {
  if (!Array.isArray(symbols) || symbols.length === 0) return [];

  const items: OutlineItem[] = [];

  for (const s of symbols) {
    if (!s || !s.name) continue;

    // Detect heading level from prefix if name starts with '='
    let detectedLevel = level;
    const match = s.name.match(/^(=+)\s*(.*)$/);
    let title = s.name;
    if (match) {
      detectedLevel = match[1].length;
      title = match[2] || s.name;
    }

    const startLine = (s.range?.start?.line ?? s.location?.range?.start?.line ?? 0) + 1;
    const startCol = (s.range?.start?.character ?? s.location?.range?.start?.character ?? 0) + 1;

    const children = s.children && Array.isArray(s.children)
      ? parseOutlineSymbols(s.children, detectedLevel + 1)
      : undefined;

    items.push({
      title,
      level: detectedLevel,
      line: startLine,
      col: startCol,
      children,
    });
  }

  return items;
}

export function renderOutline(
  container: HTMLElement,
  items: OutlineItem[],
  onSelect: (item: OutlineItem) => void,
): void {
  container.replaceChildren();

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.style.padding = "10px";
    empty.style.color = "var(--muted)";
    empty.textContent = "No outline";
    container.appendChild(empty);
    return;
  }

  function appendItems(list: OutlineItem[]) {
    for (const item of list) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tree-item";
      const indent = Math.max(0, (item.level - 1) * 12);
      btn.style.paddingLeft = `${indent + 8}px`;
      btn.textContent = item.title;
      btn.addEventListener("click", () => {
        onSelect(item);
      });
      container.appendChild(btn);

      if (item.children && item.children.length > 0) {
        appendItems(item.children);
      }
    }
  }

  appendItems(items);
}
