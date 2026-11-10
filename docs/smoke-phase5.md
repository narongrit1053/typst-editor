# Phase 5 Manual Smoke Checklist (Template Market)

- [x] **Catalogue Download & Offline Caching:** Backend `fetch_template_catalog` queries `https://packages.typst.org/preview/index.json` with network timeout; automatically caches results to `template_cache.json` in user app data; falls back cleanly to local cache when offline.
- [x] **Category Filtering:** Toolbar pills filter templates across All, Thesis, Paper, Report, CV, Slides, and My templates.
- [x] **Real-time Keyword Search:** Search box filters templates instantly across package name, category, and description.
- [x] **Card UI & Simulation:** Template cards present responsive grid layout with A4 aspect-ratio (210/297) preview thumbnail, category badge, package version, and description preview.
- [x] **Template Details Modal:** Clicking any card opens full details dialog showing author information, license terms, version tag, and extended description.
- [x] **Online Template Instantiation:** Clicking "Use Template" prompts user to choose destination directory, executes `typst init @preview/<name>:<version> <destDir>`, and opens the newly scaffolded project immediately in the editor.
- [x] **Local "My Templates":** User can click "Save as template" from the market header to copy the active project into `my_templates/<name>/`; local templates persist in app data, display in "My templates" view, and work 100% offline.
- [x] **Full-Window Market Navigation:** Template market opens as an overlay via "Templates" button in toolbar; "← Back" button returns cleanly to active editor workspace.
