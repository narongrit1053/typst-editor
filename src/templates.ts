import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { extractDialogPath } from "./main";
import { getCachedSettings } from "./settings";

export interface TypstTemplate {
  name: string;
  version: string;
  description: string;
  authors?: string[];
  license?: string;
  category: string;
  isLocal?: boolean;
  thumbnailUrl?: string;
}

const TEMPLATE_CATEGORIES = new Set([
  "thesis",
  "paper",
  "report",
  "cv",
  "slides",
  "presentation",
  "book",
  "poster",
  "flyer",
  "office",
]);

export function parseTemplateCatalog(jsonStr: string): TypstTemplate[] {
  try {
    const raw = JSON.parse(jsonStr);
    if (!Array.isArray(raw)) return [];

    const templates: TypstTemplate[] = [];
    for (const item of raw) {
      if (!item || !item.name) continue;

      const cats: string[] = Array.isArray(item.categories)
        ? item.categories.map((c: string) => c.toLowerCase())
        : [];

      const hasTemplate = !!item.template;
      const isTemplateCat = cats.some((c) => TEMPLATE_CATEGORIES.has(c));

      if (hasTemplate || isTemplateCat) {
        let displayCat = "Other";
        if (cats.includes("thesis")) displayCat = "Thesis";
        else if (cats.includes("paper")) displayCat = "Paper";
        else if (cats.includes("report")) displayCat = "Report";
        else if (cats.includes("cv")) displayCat = "CV";
        else if (cats.includes("slides") || cats.includes("presentation")) displayCat = "Slides";
        else if (cats.length > 0) {
          displayCat = cats[0].charAt(0).toUpperCase() + cats[0].slice(1);
        }

        templates.push({
          name: item.name,
          version: item.version || "0.1.0",
          description: item.description || "No description provided",
          authors: item.authors,
          license: item.license,
          category: displayCat,
          isLocal: false,
          thumbnailUrl: hasTemplate
            ? `https://packages.typst.org/preview/thumbnails/${item.name}-${item.version || "0.1.0"}.webp`
            : undefined,
        });
      }
    }
    return templates;
  } catch {
    return [];
  }
}

export function filterTemplates(
  templates: TypstTemplate[],
  category: string,
  query: string,
): TypstTemplate[] {
  const q = query.trim().toLowerCase();

  return templates.filter((item) => {
    if (category === "My templates") {
      if (!item.isLocal) return false;
    } else if (category !== "All") {
      if (item.category.toLowerCase() !== category.toLowerCase()) return false;
    }

    if (!q) return true;

    return (
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
  });
}

let cachedTemplates: TypstTemplate[] = [];
let activeCategory = "All";

export async function loadTemplates(): Promise<TypstTemplate[]> {
  const list: TypstTemplate[] = [];

  // Load online / cached catalog
  try {
    const catalogJson = await invoke<string>("fetch_template_catalog");
    const parsed = parseTemplateCatalog(catalogJson);
    list.push(...parsed);
  } catch (e) {
    console.warn("Could not fetch template catalog:", e);
  }

  // Load local user templates
  try {
    const localNames = await invoke<string[]>("list_my_templates");
    for (const name of localNames) {
      list.push({
        name,
        version: "local",
        description: "Local user template",
        category: "My templates",
        isLocal: true,
      });
    }
  } catch (e) {
    console.warn("Could not list local templates:", e);
  }

  cachedTemplates = list;
  return list;
}

export function openTemplateMarket(onOpenProject: (path: string) => void): void {
  const marketView = document.getElementById("template-market-view");
  if (!marketView) return;

  marketView.classList.remove("hidden");
  renderMarket(onOpenProject);
}

export function closeTemplateMarket(): void {
  const marketView = document.getElementById("template-market-view");
  if (!marketView) return;
  marketView.classList.add("hidden");
}

export function initTemplateMarket(onOpenProject: (path: string) => void): void {
  const marketView = document.getElementById("template-market-view");
  const btnBack = document.getElementById("btn-template-back");
  const searchInput = document.getElementById("template-search") as HTMLInputElement | null;
  const btnSaveCurrent = document.getElementById("btn-save-as-template");
  const pillsContainer = document.getElementById("template-pills");

  if (!marketView) return;

  btnBack?.addEventListener("click", () => {
    closeTemplateMarket();
  });

  searchInput?.addEventListener("input", () => {
    renderGrid(onOpenProject, searchInput.value);
  });

  pillsContainer?.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest(".pill-btn") as HTMLElement | null;
    if (!target) return;

    pillsContainer.querySelectorAll(".pill-btn").forEach((p) => p.classList.remove("active"));
    target.classList.add("active");
    activeCategory = target.dataset.category || "All";
    renderGrid(onOpenProject, searchInput?.value || "");
  });

  btnSaveCurrent?.addEventListener("click", async () => {
    const name = window.prompt("Template name for current project:");
    if (!name || !name.trim()) return;

    try {
      await invoke("save_as_my_template", { name: name.trim() });
      window.alert(`Saved template "${name.trim()}" successfully!`);
      await loadTemplates();
      renderGrid(onOpenProject, searchInput?.value || "");
    } catch (err: any) {
      window.alert(`Failed to save template: ${err?.message || err}`);
    }
  });
}

function renderMarket(onOpenProject: (path: string) => void) {
  loadTemplates().then(() => {
    const searchInput = document.getElementById("template-search") as HTMLInputElement | null;
    renderGrid(onOpenProject, searchInput?.value || "");
  });
}

function renderGrid(onOpenProject: (path: string) => void, query: string) {
  const gridEl = document.getElementById("template-grid");
  if (!gridEl) return;

  gridEl.replaceChildren();

  const filtered = filterTemplates(cachedTemplates, activeCategory, query);

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.style.gridColumn = "1 / -1";
    empty.style.padding = "40px";
    empty.style.textAlign = "center";
    empty.style.color = "var(--muted)";
    empty.textContent = "No templates found matching your criteria.";
    gridEl.appendChild(empty);
    return;
  }

  for (const t of filtered) {
    const card = document.createElement("div");
    card.className = "template-card";

    // Aspect-ratio 210/297 (A4 paper simulation)
    const previewBox = document.createElement("div");
    previewBox.className = "template-thumbnail";

    if (t.thumbnailUrl) {
      const img = document.createElement("img");
      img.className = "template-thumbnail-img";
      img.src = t.thumbnailUrl;
      img.alt = t.name;
      img.loading = "lazy";
      img.onerror = () => {
        img.remove();
      };
      previewBox.appendChild(img);
    }

    const badge = document.createElement("span");
    badge.className = "template-thumb-badge";
    badge.textContent = t.category;
    previewBox.appendChild(badge);

    const title = document.createElement("div");
    title.className = "template-card-title";
    title.textContent = t.name;

    const meta = document.createElement("div");
    meta.className = "template-card-meta";
    meta.textContent = `${t.category} · v${t.version}`;

    const desc = document.createElement("div");
    desc.className = "template-card-desc";
    desc.textContent = t.description;

    const btnUse = document.createElement("button");
    btnUse.className = "btn btn-sm btn-primary";
    btnUse.style.marginTop = "8px";
    btnUse.style.width = "100%";
    btnUse.textContent = "Use Template";

    btnUse.addEventListener("click", async (e) => {
      e.stopPropagation();
      await instantiateTemplate(t, onOpenProject);
    });

    card.appendChild(previewBox);
    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(desc);
    card.appendChild(btnUse);

    card.addEventListener("click", () => {
      showTemplateDetailsModal(t, onOpenProject);
    });

    gridEl.appendChild(card);
  }
}

async function instantiateTemplate(t: TypstTemplate, onOpenProject: (path: string) => void) {
  const selected = await openDialog({
    directory: true,
    title: `Select destination directory for "${t.name}"`,
  });

  const destDir = extractDialogPath(selected);
  if (!destDir) return;

  try {
    if (t.isLocal) {
      await invoke("use_my_template", {
        templateName: t.name,
        targetDir: destDir,
      });
    } else {
      const settings = getCachedSettings();
      await invoke("create_from_template", {
        targetDir: destDir,
        packageSpec: `@preview/${t.name}:${t.version}`,
        customBinary: settings.customTypstPath || null,
      });
    }

    closeTemplateMarket();
    onOpenProject(destDir);
  } catch (err: any) {
    window.alert(`Could not create project from template: ${err?.message || err}`);
  }
}

function showTemplateDetailsModal(t: TypstTemplate, onOpenProject: (path: string) => void) {
  const modal = document.getElementById("modal-template-details");
  if (!modal) return;

  const titleEl = document.getElementById("template-detail-title");
  const metaEl = document.getElementById("template-detail-meta");
  const descEl = document.getElementById("template-detail-desc");
  const authorEl = document.getElementById("template-detail-author");
  const previewEl = document.getElementById("template-detail-preview") as HTMLImageElement | null;
  const btnUse = document.getElementById("btn-template-detail-use");
  const btnClose = document.getElementById("btn-template-detail-close");

  if (titleEl) titleEl.textContent = t.name;
  if (metaEl) metaEl.textContent = `${t.category} · Version ${t.version} · License: ${t.license || "Not specified"}`;
  if (descEl) descEl.textContent = t.description;
  if (authorEl) {
    authorEl.textContent = t.authors && t.authors.length > 0 ? `Author(s): ${t.authors.join(", ")}` : "";
  }
  if (previewEl) {
    if (t.thumbnailUrl) {
      previewEl.src = t.thumbnailUrl;
      previewEl.classList.remove("hidden");
    } else {
      previewEl.classList.add("hidden");
      previewEl.src = "";
    }
  }

  modal.classList.remove("hidden");

  const close = () => {
    modal.classList.add("hidden");
  };

  btnClose!.onclick = close;
  modal.onclick = (e) => {
    if (e.target === modal) close();
  };

  btnUse!.onclick = async () => {
    close();
    await instantiateTemplate(t, onOpenProject);
  };
}
