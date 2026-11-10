import { describe, it, expect } from "vitest";
import { parseTemplateCatalog, filterTemplates, TypstTemplate } from "./templates";

describe("Template market logic", () => {
  const sampleJson = JSON.stringify([
    {
      name: "charged-ieee",
      version: "0.1.3",
      description: "An IEEE paper template",
      categories: ["paper"],
      template: { path: "template" },
    },
    {
      name: "modern-cv",
      version: "1.0.0",
      description: "A clean curriculum vitae template",
      categories: ["cv"],
      template: { path: "template" },
    },
    {
      name: "oxford-thesis",
      version: "2.1.0",
      description: "Oxford University doctoral thesis template",
      categories: ["thesis"],
    },
    {
      name: "utility-math-calc",
      version: "0.5.0",
      description: "Mathematical utility library (not a template)",
      categories: ["utility"],
    },
  ]);

  it("parses catalog and identifies template packages", () => {
    const list = parseTemplateCatalog(sampleJson);
    expect(list.length).toBe(3);
    expect(list.map((t) => t.name)).toContain("charged-ieee");
    expect(list.map((t) => t.name)).toContain("modern-cv");
    expect(list.map((t) => t.name)).toContain("oxford-thesis");
    expect(list.map((t) => t.name)).not.toContain("utility-math-calc");
  });

  it("extracts thumbnailUrl for packages with a template field", () => {
    const list = parseTemplateCatalog(sampleJson);
    const ieee = list.find((t) => t.name === "charged-ieee");
    expect(ieee?.thumbnailUrl).toBe(
      "https://packages.typst.org/preview/thumbnails/charged-ieee-0.1.3.webp",
    );
    const thesis = list.find((t) => t.name === "oxford-thesis");
    expect(thesis?.thumbnailUrl).toBeUndefined();
  });

  it("filters templates by category", () => {
    const list = parseTemplateCatalog(sampleJson);
    const cvs = filterTemplates(list, "CV", "");
    expect(cvs.length).toBe(1);
    expect(cvs[0].name).toBe("modern-cv");

    const papers = filterTemplates(list, "Paper", "");
    expect(papers.length).toBe(1);
    expect(papers[0].name).toBe("charged-ieee");

    const all = filterTemplates(list, "All", "");
    expect(all.length).toBe(3);
  });

  it("filters templates by query search", () => {
    const list = parseTemplateCatalog(sampleJson);
    const matches = filterTemplates(list, "All", "oxford");
    expect(matches.length).toBe(1);
    expect(matches[0].name).toBe("oxford-thesis");
  });

  it("includes local templates when category is My templates", () => {
    const list: TypstTemplate[] = [
      { name: "charged-ieee", version: "0.1.3", description: "IEEE", category: "Paper" },
      { name: "my-custom-report", version: "1.0.0", description: "Internal lab report", category: "Report", isLocal: true },
    ];
    const myTemplates = filterTemplates(list, "My templates", "");
    expect(myTemplates.length).toBe(1);
    expect(myTemplates[0].name).toBe("my-custom-report");
  });
});
