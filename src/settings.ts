import { invoke } from "@tauri-apps/api/core";

export interface AppSettings {
  theme: "light" | "dark" | "system";
  fontSize: number;
  autosave: boolean;
  wordWrap: boolean;
  recentFolders: string[];
  mainPins: Record<string, string>;
  customTypstPath?: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  fontSize: 13.5,
  autosave: true,
  wordWrap: true,
  recentFolders: [],
  mainPins: {},
  customTypstPath: "",
};

export function mergeSettings(jsonStr: string): AppSettings {
  try {
    const parsed = JSON.parse(jsonStr);
    return {
      theme: parsed.theme === "light" || parsed.theme === "dark" ? parsed.theme : "system",
      fontSize:
        typeof parsed.fontSize === "number" && parsed.fontSize >= 10 && parsed.fontSize <= 32
          ? parsed.fontSize
          : DEFAULT_SETTINGS.fontSize,
      autosave: typeof parsed.autosave === "boolean" ? parsed.autosave : DEFAULT_SETTINGS.autosave,
      wordWrap: typeof parsed.wordWrap === "boolean" ? parsed.wordWrap : DEFAULT_SETTINGS.wordWrap,
      recentFolders: Array.isArray(parsed.recentFolders) ? parsed.recentFolders : DEFAULT_SETTINGS.recentFolders,
      mainPins:
        typeof parsed.mainPins === "object" && parsed.mainPins !== null
          ? parsed.mainPins
          : DEFAULT_SETTINGS.mainPins,
      customTypstPath: typeof parsed.customTypstPath === "string" ? parsed.customTypstPath : "",
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function applyTheme(
  theme: "light" | "dark" | "system",
  doc: { documentElement: { dataset: Record<string, string | undefined> } } | null = typeof document !== "undefined" ? document : null,
): void {
  if (!doc) return;
  if (theme === "system") {
    delete doc.documentElement.dataset.theme;
  } else {
    doc.documentElement.dataset.theme = theme;
  }
}

export function applyFontSize(
  size: number,
  doc: { documentElement: { style: { setProperty: (k: string, v: string) => void } } } | null = typeof document !== "undefined" ? document : null,
): void {
  if (!doc) return;
  doc.documentElement.style.setProperty("--editor-font-size", `${size}px`);
}

let cachedSettings: AppSettings = { ...DEFAULT_SETTINGS };

export function getCachedSettings(): AppSettings {
  return cachedSettings;
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await invoke<string>("load_app_settings");
    cachedSettings = mergeSettings(raw);
  } catch {
    cachedSettings = { ...DEFAULT_SETTINGS };
  }
  applyTheme(cachedSettings.theme);
  applyFontSize(cachedSettings.fontSize);
  return cachedSettings;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  cachedSettings = settings;
  applyTheme(settings.theme);
  applyFontSize(settings.fontSize);
  await invoke("save_app_settings", { settingsJson: JSON.stringify(settings, null, 2) });
}

export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  available: boolean;
  notes: string;
  download_url?: string;
}

export async function checkForUpdates(quiet = false): Promise<UpdateInfo | null> {
  try {
    return await invoke<UpdateInfo>("check_app_update");
  } catch (err) {
    if (!quiet) {
      console.warn("Update check error:", err);
    }
    return null;
  }
}

export function initSettingsModal(onSave?: (settings: AppSettings) => void): void {
  const modal = document.getElementById("modal-settings");
  const btnSettings = document.getElementById("btn-settings");
  const btnCancel = document.getElementById("btn-settings-cancel");
  const btnSave = document.getElementById("btn-settings-save");
  const btnCheckUpdates = document.getElementById("btn-check-updates");
  const updateStatusText = document.getElementById("update-status-text");

  const selectTheme = document.getElementById("setting-theme") as HTMLSelectElement | null;
  const inputFontSize = document.getElementById("setting-fontsize") as HTMLInputElement | null;
  const checkAutosave = document.getElementById("setting-autosave") as HTMLInputElement | null;
  const checkWordWrap = document.getElementById("setting-wordwrap") as HTMLInputElement | null;
  const inputTypstPath = document.getElementById("setting-typst-path") as HTMLInputElement | null;

  if (!modal || !btnSettings || !btnCancel || !btnSave) return;

  btnSettings.addEventListener("click", () => {
    if (selectTheme) selectTheme.value = cachedSettings.theme;
    if (inputFontSize) inputFontSize.value = String(cachedSettings.fontSize);
    if (checkAutosave) checkAutosave.checked = cachedSettings.autosave;
    if (checkWordWrap) checkWordWrap.checked = cachedSettings.wordWrap;
    if (inputTypstPath) inputTypstPath.value = cachedSettings.customTypstPath || "";
    modal.classList.remove("hidden");
  });

  btnCancel.addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  btnCheckUpdates?.addEventListener("click", async () => {
    if (updateStatusText) {
      updateStatusText.textContent = "Checking for updates...";
      updateStatusText.style.color = "var(--muted)";
    }
    const info = await checkForUpdates(true);
    if (info && info.available) {
      if (updateStatusText) {
        updateStatusText.textContent = `Update available: v${info.latest_version}`;
        updateStatusText.style.color = "var(--accent)";
      }
    } else if (info) {
      if (updateStatusText) {
        updateStatusText.textContent = `You're on the latest version (v${info.current_version})`;
        updateStatusText.style.color = "var(--ok)";
      }
    } else {
      if (updateStatusText) {
        updateStatusText.textContent = "Could not check updates (offline or unreachable)";
        updateStatusText.style.color = "var(--muted)";
      }
    }
  });

  btnSave.addEventListener("click", async () => {
    const theme = (selectTheme?.value as "light" | "dark" | "system") || "system";
    const fontSize = parseFloat(inputFontSize?.value || "13.5") || 13.5;
    const autosave = checkAutosave ? checkAutosave.checked : true;
    const wordWrap = checkWordWrap ? checkWordWrap.checked : true;
    const customTypstPath = inputTypstPath?.value.trim() || "";

    const newSettings: AppSettings = {
      ...cachedSettings,
      theme,
      fontSize,
      autosave,
      wordWrap,
      customTypstPath,
    };
    await saveSettings(newSettings);
    onSave?.(newSettings);
    modal.classList.add("hidden");
  });
}
