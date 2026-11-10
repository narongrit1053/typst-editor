import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings, applyTheme, applyFontSize, AppSettings } from "./settings";

describe("Settings logic", () => {
  it("merges partial settings with defaults", () => {
    const partial: Partial<AppSettings> = {
      theme: "dark",
      fontSize: 16,
    };
    const merged = mergeSettings(JSON.stringify(partial));
    expect(merged.theme).toBe("dark");
    expect(merged.fontSize).toBe(16);
    expect(merged.autosave).toBe(true);
    expect(merged.recentFolders).toEqual([]);
    expect(merged.mainPins).toEqual({});
  });

  it("falls back to default settings on invalid json", () => {
    const merged = mergeSettings("invalid json string");
    expect(merged).toEqual(DEFAULT_SETTINGS);
  });

  it("applies light and dark themes to documentElement data-theme", () => {
    const mockDoc = {
      documentElement: {
        dataset: {} as Record<string, string | undefined>,
      },
    };

    applyTheme("dark", mockDoc);
    expect(mockDoc.documentElement.dataset.theme).toBe("dark");

    applyTheme("light", mockDoc);
    expect(mockDoc.documentElement.dataset.theme).toBe("light");

    applyTheme("system", mockDoc);
    expect(mockDoc.documentElement.dataset.theme).toBeUndefined();
  });

  it("applies font size css property", () => {
    const properties: Record<string, string> = {};
    const mockDoc = {
      documentElement: {
        style: {
          setProperty: (k: string, v: string) => {
            properties[k] = v;
          },
        },
      },
    };

    applyFontSize(15, mockDoc);
    expect(properties["--editor-font-size"]).toBe("15px");
  });
});
