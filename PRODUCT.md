# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (the project landing page). The product itself is a Windows desktop app (Tauri).

## Stack

Landing page: static HTML/CSS, hand-written, in `site/`, deployed to GitHub Pages by a GitHub Actions workflow. No framework, no build step.

## Users

Students and researchers writing theses and papers in Typst, on Windows, who want an offline desktop editor and a way to review their own typeset drafts.

## Product Purpose

Typst-Editor by Kong is a desktop editor for Typst documents: write source on the left, see the typeset page update live on the right, jump between the two, mark up the typeset page with comments, and export. Success for the landing page: a visitor understands what it is within seconds and downloads the Windows installer.

## Positioning

The typeset preview is a working surface, not just output: double-click jumps both ways between source and page, and highlights with sticky notes are pinned on the rendered page itself, mirrored in the source, and saved next to the file.

## Operating Context

Thesis and paper writing in Typst; draft review rounds; projects that are folders of `.typ` files and images; Windows desktops.

## Capabilities and Constraints

- Editor: Typst syntax highlighting, autocomplete, go to definition (F12), formatting (Shift+Alt+F), word wrap, autosave; language features from Tinymist v0.15.12 (Typst 0.15.1).
- Live preview with zoom; double-click two-way jump with a 2 s orange flash.
- Comments: highlighter with yellow/green/blue/pink, sticky notes on the preview that can be dragged within their page, matching highlight in the editor, saved as `<file>.typ.comments.json`.
- Workspace: file tree with folding, outline, problems panel, quick open (Ctrl+P), pinned main file, image viewer.
- Export: PDF, PNG, SVG, HTML, LaTeX.
- Templates: Typst Universe catalog; save own templates.
- Bundled TeX Gyre Termes fonts.
- Windows x64 only. Version 0.1.0. The installer is unsigned (Windows SmartScreen may warn).

## Brand Commitments

Name: "Typst-Editor by Kong". Author shown as "Kong". MIT license.

## Evidence on Hand

- `docs/screenshot.png`: the app with a demo document, two highlights and two sticky notes.
- No users, testimonials, download counts, benchmarks or press exist. Do not invent any.

## Product Principles

- The typeset page is where you review; the source stays the truth.
- Offline and local: files stay on the user's disk, beside their comments.
- Show the real thing: real screenshots and working demonstrations over claims.
