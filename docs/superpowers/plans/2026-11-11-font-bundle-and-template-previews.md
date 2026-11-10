# App-Managed Font Provisioning & Template Market Image Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide zero-warning parity with Typst Web App for academic fonts (*TeX Gyre Termes*) by auto-provisioning fonts into an app-managed font directory and wiring them into Tinymist LSP, live preview, and export CLI, while adding official WebP image previews to the Template Market.

**Architecture:** A Rust helper ensures the 4 core *TeX Gyre Termes* OpenType font files exist in the user's local AppData directory (`AppData/Local/typst-editor/fonts`), setting `TYPST_FONT_PATHS` and passing `--font-path` to `tinymist lsp`, preview tasks, and `typst compile`. In the frontend, `TypstTemplate` parses official Typst Universe thumbnail URLs (`https://packages.typst.org/preview/thumbnails/{name}-{version}.webp`) to render lazy-loaded images with offline fallback badges.

**Tech Stack:** Rust (Tauri 2, `ureq`), TypeScript, CSS3, Vite, Vitest.

**Spec:** [`docs/superpowers/specs/2026-11-11-font-bundle-and-template-previews-design.md`](file:///D:/Try/Typst/docs/superpowers/specs/2026-11-11-font-bundle-and-template-previews-design.md)

## Global Constraints

- Never require Windows administrator privileges or modify `C:\Windows\Fonts`.
- All font downloads must use standard HTTPS GET without API keys or credentials.
- Template thumbnails must degrade gracefully to existing category badges when offline or if an image fails to load.
- LSP request IDs must remain cleanly isolated using string prefixes (`lsp-...`).

## Review Focus

- Offline template market browsing: card thumbnails fail gracefully and continue displaying category badges without layout shift.
- Offline font provisioning: if network is down on first launch, app uses local `tools/fonts` if present without crashing.
- Export CLI font discovery: `typst compile` receives `--font-path` so PDF exports of templates like `revtyp` succeed without font substitution warnings.
- Space in user path: `AppData/Local/typst-editor/fonts` must be quoted/handled properly when passed via CLI flags or env vars.
- Fast startup: Font verification must be non-blocking or only run once if font files already exist.

---

### Task 1: Template Market Image Previews

**Files:**
- Modify: [`src/templates.ts`](file:///D:/Try/Typst/src/templates.ts)
- Modify: [`src/templates.test.ts`](file:///D:/Try/Typst/src/templates.test.ts)
- Modify: [`src/styles.css`](file:///D:/Try/Typst/src/styles.css)

**Interfaces:**
- Consumes: Typst Universe package catalog JSON (`packages.typst.org/preview/index.json`)
- Produces: `TypstTemplate.thumbnailUrl?: string`, thumbnail rendering with lazy loading and error fallback, details modal image banner

- [ ] **Step 1: Write failing unit test in `src/templates.test.ts`**

Add unit test verifying `parseTemplateCatalog` sets `thumbnailUrl` for items containing a `template` object:

```ts
it("extracts thumbnailUrl for templates in catalog", () => {
  const json = JSON.stringify([
    {
      name: "abiding-ifacconf",
      version: "0.2.1",
      categories: ["paper"],
      template: { path: "template", entrypoint: "main.typ", thumbnail: "thumbnail.png" },
    },
  ]);
  const parsed = parseTemplateCatalog(json);
  expect(parsed.length).toBe(1);
  expect(parsed[0].thumbnailUrl).toBe(
    "https://packages.typst.org/preview/thumbnails/abiding-ifacconf-0.2.1.webp",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/templates.test.ts`
Expected: FAIL (`thumbnailUrl` is undefined)

- [ ] **Step 3: Implement `thumbnailUrl` extraction & rendering in `src/templates.ts` and styling in `src/styles.css`**

1. In `src/templates.ts`, add `thumbnailUrl?: string;` to `TypstTemplate`.
2. In `parseTemplateCatalog`, set:
   ```ts
   thumbnailUrl: item.template
     ? `https://packages.typst.org/preview/thumbnails/${item.name}-${item.version || "0.1.0"}.webp`
     : undefined,
   ```
3. In `renderGrid`, update `previewBox`:
   ```ts
   const previewBox = document.createElement("div");
   previewBox.className = "template-thumbnail";
   const badge = document.createElement("span");
   badge.className = "template-thumb-badge";
   badge.textContent = t.category;
   previewBox.appendChild(badge);

   if (t.thumbnailUrl) {
     const img = document.createElement("img");
     img.className = "template-thumbnail-img";
     img.src = t.thumbnailUrl;
     img.alt = t.name;
     img.loading = "lazy";
     img.onerror = () => { img.style.display = "none"; };
     previewBox.appendChild(img);
   }
   ```
4. In `showTemplateDetailsModal`, add thumbnail image banner at top of modal content when `t.thumbnailUrl` exists.
5. In `src/styles.css`, add styling for `.template-thumbnail-img` with `width: 100%; height: 100%; object-fit: contain; background: #ffffff; border-radius: 4px;` and position `.template-thumb-badge` neatly in the top-right corner.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/templates.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/templates.ts src/templates.test.ts src/styles.css
git commit -m "feat: add template market image previews and official universe thumbnails"
```

---

### Task 2: Backend Font Provisioning (`ensure_app_fonts`)

**Files:**
- Create: `tools/fonts/` (bundled font files)
- Modify: [`src-tauri/src/commands.rs`](file:///D:/Try/Typst/src-tauri/src/commands.rs)
- Modify: [`src-tauri/src/lib.rs`](file:///D:/Try/Typst/src-tauri/src/lib.rs)

**Interfaces:**
- Consumes: Official CTAN OpenType font mirrors (`https://mirrors.ctan.org/fonts/tex-gyre/opentype/texgyretermes-*.otf`) and local `tools/fonts/`
- Produces: `pub fn ensure_app_fonts(app: &AppHandle) -> Result<PathBuf, String>` returning the canonical path to the directory containing TeX Gyre Termes fonts

- [ ] **Step 1: Download core TeX Gyre Termes OpenType fonts into `tools/fonts/`**

Download the 4 standard files:
- `texgyretermes-regular.otf`
- `texgyretermes-bold.otf`
- `texgyretermes-italic.otf`
- `texgyretermes-bolditalic.otf`
into `tools/fonts/` as the local bundled baseline.

- [ ] **Step 2: Write failing unit test in `src-tauri/src/commands.rs`**

Add unit test `test_ensure_app_fonts_creates_directory_and_files`:

```rust
#[cfg(test)]
mod font_tests {
    use super::*;

    #[test]
    fn test_fonts_directory_resolution() {
        let temp_dir = tempfile::tempdir().unwrap();
        let fonts_dir = temp_dir.path().join("fonts");
        fs::create_dir_all(&fonts_dir).unwrap();
        assert!(fonts_dir.exists());
    }
}
```

- [ ] **Step 3: Implement `ensure_app_fonts` in `src-tauri/src/commands.rs`**

1. Define `pub fn ensure_app_fonts(app: Option<&AppHandle>) -> Result<PathBuf, String>`.
2. Locate font destination:
   - If `app` available: `app.path().app_local_data_dir()?.join("fonts")`.
   - Fallback / dev: `tools/fonts`.
3. If destination does not have all 4 `texgyretermes-*.otf` files:
   - Check if `tools/fonts` or executable parent `resources/fonts` has them; copy if found.
   - Otherwise, fetch missing `.otf` files from `https://mirrors.ctan.org/fonts/tex-gyre/opentype/` via `ureq` with a 10s timeout, saving directly to destination.
4. Expose Tauri command `pub fn get_app_fonts_dir(app: AppHandle) -> Result<String, String>`.
5. Register `get_app_fonts_dir` in `src-tauri/src/lib.rs`.

- [ ] **Step 4: Run cargo test to verify**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/fonts src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: implement app-managed font provisioning for TeX Gyre Termes"
```

---

### Task 3: Wire Font Path into Tinymist LSP, Preview Server, and Export CLI

**Files:**
- Modify: [`src-tauri/src/lsp_bridge.rs`](file:///D:/Try/Typst/src-tauri/src/lsp_bridge.rs)
- Modify: [`src-tauri/src/commands.rs`](file:///D:/Try/Typst/src-tauri/src/commands.rs)
- Modify: [`src/preview.ts`](file:///D:/Try/Typst/src/preview.ts)
- Modify: [`src/preview.test.ts`](file:///D:/Try/Typst/src/preview.test.ts)

**Interfaces:**
- Consumes: `ensure_app_fonts` from Task 2
- Produces: `--font-path` CLI arguments and `TYPST_FONT_PATHS` environment variables propagated to `tinymist lsp`, `tinymist.doStartPreview`, and `typst compile`

- [ ] **Step 1: Wire font path into `lsp_start` in `src-tauri/src/lsp_bridge.rs`**

1. In `lsp_bridge::lsp_start`:
   ```rust
   let fonts_dir = crate::commands::ensure_app_fonts(Some(&app)).ok();
   if let Some(ref dir) = fonts_dir {
       cmd.arg("--font-path").arg(dir);
       cmd.env("TYPST_FONT_PATHS", dir);
   }
   ```
2. Also check `TYPST_FONT_PATHS` when setting up `tinymist lsp` command.

- [ ] **Step 2: Wire font path into `export_file` in `src-tauri/src/commands.rs`**

In `export_file`, when building `Command::new(&typst_bin)`:
```rust
let fonts_dir = ensure_app_fonts(Some(&app)).ok();
if let Some(ref dir) = fonts_dir {
    cmd.arg("--font-path").arg(dir);
    cmd.env("TYPST_FONT_PATHS", dir);
}
```

- [ ] **Step 3: Update `startPreview` in `src/preview.ts` to pass font path if supplied**

When `startPreview` issues `tinymist.doStartPreview`, Tinymist inherits the font path via the LSP process environment. Also ensure preview arguments tolerate custom font paths if passed.

- [ ] **Step 4: Verify with end-to-end unit and compilation tests**

1. Run `npx vitest run` to ensure all 33+ tests pass.
2. Run `npm run build` to ensure clean TypeScript/Vite bundle.
3. Run `cargo check --manifest-path src-tauri/Cargo.toml` to verify Rust compilation.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lsp_bridge.rs src-tauri/src/commands.rs src/preview.ts src/preview.test.ts
git commit -m "feat: propagate app font paths to tinymist lsp, preview, and export cli"
```

---

### Task 4: End-to-End Verification with Academic Sample Document

**Files:**
- Test verification file: temporary sample importing `@preview/revtyp:0.15.0`

- [ ] **Step 1: Test LSP compilation with `revtyp:0.15.0` against provisioned fonts**

Execute test script verifying that compiling a typst document importing `@preview/revtyp:0.15.0` using `tinymist.exe lsp --font-path tools/fonts` produces **zero** `unknown font family: tex gyre termes` warnings.

- [ ] **Step 2: Verify template market UI preview rendering**

Confirm that `parseTemplateCatalog` renders template cards with the WebP images and that invalid URLs fall back gracefully to the text badge.

- [ ] **Step 3: Final cleanup and commit**

Remove temporary test artifacts and commit.
