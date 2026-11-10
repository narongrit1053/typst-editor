import { invoke } from "@tauri-apps/api/core";

export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}

export function sortFileNodes(nodes: FileNode[]): FileNode[] {
  return [...nodes].sort((a, b) => {
    if (a.isDir !== b.isDir) {
      return a.isDir ? -1 : 1;
    }
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}

export function toggleSidebar(): boolean {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return false;
  sidebar.classList.toggle("hidden");
  return !sidebar.classList.contains("hidden");
}

export async function fetchDirectoryEntries(subPath?: string): Promise<FileNode[]> {
  const raw = await invoke<Array<{ name: string; path: string; is_dir: boolean }>>("list_dir", {
    path: subPath,
  });
  const nodes: FileNode[] = raw.map((r) => ({
    name: r.name,
    path: r.path,
    isDir: r.is_dir,
  }));
  return sortFileNodes(nodes);
}

// Folders the user has expanded; survives tree refreshes (create/rename/delete).
const expandedDirs = new Set<string>();

export function renderFileTree(
  container: HTMLElement,
  entries: FileNode[],
  activePath: string | null,
  pinnedPath: string | null,
  onSelect: (path: string) => void,
  onPin: (path: string) => void,
  onDelete: (path: string) => void,
  onRename: (path: string) => void,
): void {
  container.replaceChildren();

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "tree-empty";
    empty.style.padding = "10px";
    empty.style.color = "var(--muted)";
    empty.textContent = "No files";
    container.appendChild(empty);
    return;
  }

  renderNodes(container, entries, 0, activePath, pinnedPath, onSelect, onPin, onDelete, onRename);
}

function renderNodes(
  container: HTMLElement,
  entries: FileNode[],
  depth: number,
  activePath: string | null,
  pinnedPath: string | null,
  onSelect: (path: string) => void,
  onPin: (path: string) => void,
  onDelete: (path: string) => void,
  onRename: (path: string) => void,
): void {
  for (const node of entries) {
    const row = document.createElement("div");
    row.className = "tree-item-row";
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.justifyContent = "space-between";
    row.style.padding = "2px 6px";
    row.style.paddingLeft = `${6 + depth * 14}px`;
    row.style.borderRadius = "4px";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tree-item";
    btn.style.flex = "1";
    btn.style.padding = "2px 4px";

    const isPinned = pinnedPath && (node.path === pinnedPath || node.path.replace(/\//g, "\\") === pinnedPath.replace(/\//g, "\\"));
    const isActive = activePath && (node.path === activePath || node.path.replace(/\//g, "\\") === activePath.replace(/\//g, "\\"));

    if (isActive) {
      btn.classList.add("active");
    }

    const isOpen = node.isDir && expandedDirs.has(node.path);
    const icon = node.isDir ? (isOpen ? "▾ 📂" : "▸ 📁") : isPinned ? "📌" : "📄";
    btn.textContent = `${icon} ${node.name}`;

    // Holds a folder's children; filled lazily on first expand.
    const childBox = document.createElement("div");

    const renderChildren = async () => {
      try {
        const children = await fetchDirectoryEntries(node.path);
        childBox.replaceChildren();
        renderNodes(childBox, children, depth + 1, activePath, pinnedPath, onSelect, onPin, onDelete, onRename);
      } catch (err) {
        console.warn("Failed to list folder:", err);
      }
    };

    btn.addEventListener("click", () => {
      if (!node.isDir) {
        onSelect(node.path);
        return;
      }
      if (expandedDirs.has(node.path)) {
        expandedDirs.delete(node.path);
        childBox.replaceChildren();
        btn.textContent = `▸ 📁 ${node.name}`;
      } else {
        expandedDirs.add(node.path);
        btn.textContent = `▾ 📂 ${node.name}`;
        renderChildren();
      }
    });

    // Right-click / contextmenu for setting as main file
    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (!node.isDir && node.name.endsWith(".typ")) {
        onPin(node.path);
      }
    });

    row.appendChild(btn);

    // Mini actions on hover
    const actions = document.createElement("div");
    actions.className = "tree-item-actions";
    actions.style.display = "flex";
    actions.style.gap = "2px";

    if (!node.isDir && node.name.endsWith(".typ")) {
      const pinBtn = document.createElement("button");
      pinBtn.type = "button";
      pinBtn.className = "btn btn-sm";
      pinBtn.title = "Set as main file";
      pinBtn.textContent = "📌";
      pinBtn.style.padding = "1px 4px";
      pinBtn.style.fontSize = "11px";
      pinBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        onPin(node.path);
      });
      actions.appendChild(pinBtn);
    }

    const renBtn = document.createElement("button");
    renBtn.type = "button";
    renBtn.className = "btn btn-sm";
    renBtn.title = "Rename";
    renBtn.textContent = "✏";
    renBtn.style.padding = "1px 4px";
    renBtn.style.fontSize = "11px";
    renBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onRename(node.path);
    });
    actions.appendChild(renBtn);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn btn-sm";
    delBtn.title = "Delete";
    delBtn.textContent = "🗑";
    delBtn.style.padding = "1px 4px";
    delBtn.style.fontSize = "11px";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onDelete(node.path);
    });
    actions.appendChild(delBtn);

    row.appendChild(actions);
    container.appendChild(row);
    container.appendChild(childBox);
    if (isOpen) renderChildren();
  }
}
