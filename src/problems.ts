import { Problem } from "./editor";

export function formatProblem(p: Problem, rootPath: string): string {
  let rel = p.path;
  const normalizedRoot = rootPath.replace(/\\/g, "/").replace(/\/$/, "");
  const normalizedPath = p.path.replace(/\\/g, "/");

  if (normalizedPath.startsWith(normalizedRoot + "/")) {
    rel = normalizedPath.slice(normalizedRoot.length + 1);
  } else if (normalizedPath === normalizedRoot) {
    rel = normalizedPath.split("/").pop() || normalizedPath;
  }

  // Restore Windows backslashes if original path had backslashes
  if (p.path.includes("\\")) {
    rel = rel.replace(/\//g, "\\");
  }

  return `${rel}:${p.line}:${p.col}  ${p.message}`;
}

export function summarise(problems: Problem[]): string {
  let errors = 0;
  let warnings = 0;

  for (const p of problems) {
    if (p.severity === "error") {
      errors++;
    } else {
      warnings++;
    }
  }

  if (errors === 0 && warnings === 0) {
    return "No problems";
  }

  const parts: string[] = [];
  if (errors > 0) {
    parts.push(`${errors} error${errors > 1 ? "s" : ""}`);
  }
  if (warnings > 0) {
    parts.push(`${warnings} warning${warnings > 1 ? "s" : ""}`);
  }

  return parts.join(", ");
}

export function renderProblems(
  panel: HTMLElement,
  problems: Problem[],
  rootPath: string,
  onPick: (p: Problem) => void,
): void {
  const listEl = panel.querySelector(".problems-list") || panel;

  if (problems.length === 0) {
    panel.classList.add("hidden");
    listEl.replaceChildren();
    return;
  }

  panel.classList.remove("hidden");
  listEl.replaceChildren();

  // Sort: errors first
  const sorted = [...problems].sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === "error" ? -1 : 1;
  });

  for (const p of sorted) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `problem-item ${p.severity}`;
    row.textContent = `${p.severity === "error" ? "✕" : "⚠"} ${formatProblem(p, rootPath)}`;
    row.addEventListener("click", () => {
      onPick(p);
    });
    listEl.appendChild(row);
  }
}
