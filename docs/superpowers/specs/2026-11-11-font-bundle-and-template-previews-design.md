# Design: App-Managed Font Provisioning & Template Market Image Previews

## Problem Statement

1. **Font Diagnostics Warning**: When opening documents or templates utilizing standard academic fonts (e.g. `@preview/revtyp:0.15.0`), users receive warnings such as `unknown font family: tex gyre termes`. While the official Typst Web App preinstalls the TeX Gyre font collection on its servers, local Typst CLI and Tinymist binary installations only bundle 4 basic fonts (*Libertinus Serif*, *New Computer Modern*, *New Computer Modern Math*, *DejaVu Sans Mono*).
2. **Template Market Visuals**: The template marketplace currently shows simulated blank A4 containers with text badges, lacking visual previews of what the rendered templates actually look like.

---

## Goals

1. **Parity with Typst Web App Fonts**: Automatically provision the core TeX Gyre OpenType fonts (*Termes* family) into an app-managed font directory, and configure Tinymist LSP, live preview, and export CLI to discover them seamlessly.
2. **Visual Template Previews**: Display official Typst Universe WebP template thumbnails in the template market grid cards and details modal with lazy loading and graceful offline fallbacks.

## Non-Goals

- Bundling every conceivable font in existence (focus on the core Typst Web App open-source academic collection: *TeX Gyre Termes*).
- Requiring administrative privileges or installing fonts into Windows system font directories (`C:\Windows\Fonts`).

---

## Approaches Considered

1. **Option A: App-Managed Fonts Directory (Chosen)**
   - Maintain a dedicated user-space fonts folder in `AppData/Local/typst-editor/fonts` (and dev fallback in `tools/fonts`).
   - Automatically seed or download the TeX Gyre Termes family into this directory.
   - Inject `--font-path` and `TYPST_FONT_PATHS` into Tinymist LSP, preview tasks, and export CLI commands.
   - *Trade-offs*: Zero friction for users, works without admin privileges, avoids polluting system fonts, exact web app compatibility.
2. **Option B: Manual Settings Configuration**
   - Require users to manually download font files and configure font directory paths in Settings.
   - *Rejected*: High friction for newcomers encountering font warnings on standard templates.
3. **Option C: Direct System Font Installation**
   - Attempt to register fonts in Windows registry/system fonts.
   - *Rejected*: Requires elevation/admin rights, complex uninstall cleanup, platform-dependent.

---

## Technical Specification

### 1. App-Managed Fonts Provisioning (Rust Backend)

- **Directory Location**:
  - Production: `{local_app_data_dir}/typst-editor/fonts`
  - Development / fallback: `tools/fonts` relative to project / binary.
- **Tauri Command & Helper**:
  - Add `commands::ensure_app_fonts(app: &AppHandle) -> PathBuf`
  - Verifies presence of `texgyretermes-regular.otf`, `texgyretermes-bold.otf`, `texgyretermes-italic.otf`, `texgyretermes-bolditalic.otf`.
  - If missing, seeds them from `tools/fonts` or downloads them from official CTAN mirrors into the app font directory.
- **Tinymist LSP & Environment Wiring**:
  - In `src-tauri/src/lsp_bridge.rs`:
    - Call `ensure_app_fonts` before spawning Tinymist.
    - Set environment variable `TYPST_FONT_PATHS = <app_fonts_dir>`.
    - Pass `--font-path <app_fonts_dir>` argument to `tinymist lsp`.
- **Export CLI Wiring**:
  - In `src-tauri/src/commands.rs` (`export_file`):
    - Include `--font-path <app_fonts_dir>` when calling `typst compile`.

### 2. Template Market Image Previews (Frontend)

- **Data Model (`src/templates.ts`)**:
  - Extend `TypstTemplate`:
    ```ts
    export interface TypstTemplate {
      // ...
      thumbnailUrl?: string;
    }
    ```
  - In `parseTemplateCatalog(jsonStr)`:
    - If `item.template` is present:
      `thumbnailUrl = "https://packages.typst.org/preview/thumbnails/" + item.name + "-" + (item.version || "0.1.0") + ".webp"`
- **Grid Card Thumbnail (`renderGrid`)**:
  - Inside `.template-thumbnail`:
    ```html
    <div class="template-thumbnail">
      <img class="template-thumbnail-img" src="..." loading="lazy" alt="..." />
      <span class="template-thumb-badge">Category</span>
    </div>
    ```
  - Handle `onerror`: If image fails to load or app is offline, hide `img` and display fallback category badge.
  - Handle `onload`: Fade in image smoothly.
- **Details Modal (`showTemplateDetailsModal`)**:
  - Show full-width preview image banner at the top of the modal if `thumbnailUrl` exists.
- **Styling (`src/styles.css`)**:
  - Style `.template-thumbnail-img` with `width: 100%; height: 100%; object-fit: contain; background: #ffffff; border-radius: 4px;`.
  - Overlay `.template-thumb-badge` in top-right corner.

---

## Verification & Testing Plan

1. **Font Discovery Verification**:
   - Verify `texgyretermes-*.otf` files are provisioned into the font directory.
   - Verify `typst-editor` launches Tinymist with `--font-path` and `TYPST_FONT_PATHS`.
   - Open a document with `#import "@preview/revtyp:0.15.0": *` and confirm zero `unknown font family: tex gyre termes` warnings in the Problems panel.
   - Run export to PDF and confirm font renders without substitution warnings.
2. **Template Preview Verification**:
   - Open the Template Market.
   - Confirm official WebP thumbnails load for template packages.
   - Confirm offline fallback works gracefully when network is disconnected.
3. **Unit Tests**:
   - Test `parseTemplateCatalog` extracts `thumbnailUrl` accurately.
   - Test font directory resolver logic and error handling.
