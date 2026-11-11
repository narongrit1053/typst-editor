---
name: Typst-Editor by Kong (landing page)
description: The project site in site/, built as a library-bound thesis, closed on arrival and read open below.
colors:
  cloth: "#1e3b2c"
  cloth-deep: "#132a1e"
  foil: "#d8b765"
  foil-bright: "#f0d690"
  paper: "#fdfdfb"
  paper-edge: "#e9e8e1"
  label: "#f7f6f0"
  ink: "#18181a"
  ink-soft: "#46464b"
  rule: "#cfcfc8"
  link: "#1d4a33"
  link-deep: "#163a28"
  hl-yellow: "#ffd54a"
  hl-green: "#7bd88f"
  hl-blue: "#6cb6ff"
  hl-pink: "#ff8fc8"
typography:
  display:
    fontFamily: "Libertinus Serif, Times New Roman, serif"
    fontSize: "clamp(2.6rem, 1.2rem + 6vw, 5.6rem)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.04em"
    fontFeature: "\"smcp\""
  headline:
    fontFamily: "Libertinus Serif, Times New Roman, serif"
    fontSize: "clamp(1.7rem, 1.35rem + 1.2vw, 2.35rem)"
    fontWeight: 700
    lineHeight: 1.12
  title:
    fontFamily: "Libertinus Serif, Times New Roman, serif"
    fontSize: "1.22rem"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Libertinus Serif, Times New Roman, serif"
    fontSize: "clamp(1.02rem, 0.96rem + 0.25vw, 1.14rem)"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "\"kern\", \"liga\""
  caption:
    fontFamily: "Libertinus Serif, Times New Roman, serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Libertinus Serif, Times New Roman, serif"
    fontSize: "0.92rem"
    fontWeight: 400
    letterSpacing: "0.1em"
    fontFeature: "\"smcp\", \"c2sc\""
  label-sans:
    fontFamily: "Libertinus Sans, Segoe UI, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 700
    lineHeight: 1.15
  mono:
    fontFamily: "Cascadia Code, Consolas, monospace"
    fontSize: "0.86em"
    lineHeight: 1.45
rounded:
  hairline: "2px"
  label: "3px"
  note: "5px"
  round: "50%"
spacing:
  page-pad: "clamp(1.5rem, 4.5vw, 4rem)"
  spread-gap: "clamp(1.25rem, 3vw, 2.25rem)"
  spine: "clamp(132px, 12vw, 176px)"
  para-indent: "1.4em"
  measure: "68ch"
components:
  spine-label:
    backgroundColor: "{colors.label}"
    textColor: "{colors.ink}"
    typography: "{typography.label-sans}"
    rounded: "{rounded.label}"
    padding: "0.9rem 0.8rem 0.8rem"
  foil-link:
    textColor: "{colors.foil}"
    typography: "{typography.label}"
    padding: "0.3rem 0.2rem"
  foil-link-hover:
    textColor: "{colors.foil-bright}"
  body-link:
    textColor: "{colors.link}"
  page:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "{spacing.page-pad}"
  running-head:
    textColor: "{colors.ink-soft}"
    typography: "{typography.label}"
  command-block:
    backgroundColor: "#f4f4ef"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    padding: "0.9rem 1rem"
  kbd:
    backgroundColor: "#fafaf6"
    textColor: "{colors.ink}"
    rounded: "{rounded.label}"
    padding: "0.05em 0.4em"
  sticky-note:
    backgroundColor: "#fffdf3"
    textColor: "#222222"
    rounded: "{rounded.note}"
    padding: "0.35rem 0.55rem 0.55rem"
  note-save:
    backgroundColor: "{colors.link}"
    textColor: "#ffffff"
    rounded: "{rounded.label}"
    padding: "0.1rem 0.4rem"
  note-save-hover:
    backgroundColor: "{colors.link-deep}"
  highlight-swatch:
    rounded: "{rounded.round}"
    size: "1.7rem"
---

# Design System: Typst-Editor by Kong (landing page)

> **Scope.** This file documents the landing page in `site/` only: the "bound thesis" world. The desktop app's own interface (`src/styles.css`) is a separate world with its own look and is not covered here. Do not apply these tokens or rules to the app, and do not read the app's styles as precedent for the site.

## Overview

**Creative North Star: "The Bound Thesis"**

The site is one book handled once. It arrives closed: a green buckram case with woven grain, gold-foil lettering on the front board, a spine carrying gilt double rules and a pasted white library label that is the download button. Scrolling past the cover swings the board open on its spine, and everything below is the book's interior: bright white pages set in Libertinus Serif with the apparatus of a typeset thesis (title page, dot-leader contents, running heads, folios, numbered chapters, figures and tables, footnotes, references, colophon).

Density is that of a printed page, not a marketing layout. Pages sit in two-column spreads on the cloth, with a gutter shadow where they curve into the binding; one figure is a full-width fold-out plate. Persuasion comes from the typesetting itself being the proof: the page reads the way a Typst thesis would. Colour outside the cloth, foil and ink belongs to the product's comment feature, and only appears where that feature is demonstrated.

**Key Characteristics:**
- Two materials only: cloth (with foil) outside, paper (with ink) inside.
- Flat gold foil, no emboss, no gradient lettering.
- Book apparatus does the navigation: contents page, running heads, folios, numbered references.
- Physical depth from soft paper shadows and inset cloth shading; never hard offsets.
- One signature motion: the front board opens on its spine with scroll.

## Colors

A two-material palette: deep bottle-green cloth with dull gold on the outside, near-white paper with near-black ink inside, and four highlighter pigments held in reserve for the comment feature.

### Primary
- **Bottle-Green Buckram** (cloth): the case, the back cover and the frame the spreads sit on, always under the woven-grain texture. The deeper **Spine Shadow Green** (cloth-deep) is the spine and the page background behind everything.
- **Dull Gold Foil** (foil): every word stamped on cloth: title, subtitle, small-caps points, byline, spine title, spine bands, cover links, focus rings on cloth. **Bright Foil** (foil-bright) is its hover state only.

### Secondary
- **Library Green Ink** (link): links and icons on paper, focus rings on paper, the note's Save button; **Deep Library Green** (link-deep) is its pressed/hover fill.

### Tertiary
- **Highlighter Yellow, Green, Blue, Pink** (hl-yellow, hl-green, hl-blue, hl-pink): the four comment colours, used as swatches, as `mark` fills at 55-65% mix over white, and as the 4px top edge of a sticky note.

### Neutral
- **Bond Paper** (paper): every page and plate.
- **Paper Edge** (paper-edge): the 1px bottom edge of a spread or plate, and the divider between stacked pages on small screens.
- **Spine-Label White** (label): the pasted label and the skip link.
- **Thesis Ink** (ink): all text on paper; the double rules of booktabs tables.
- **Soft Ink** (ink-soft): running heads, folios, footnotes, title-page metadata.
- **Hairline Rule** (rule): running-head underline, footnote separator, code-block rules, figure borders, demo frame.

### Named Rules
**The Two Materials Rule.** Cloth carries foil; paper carries ink. Foil never appears on paper and paper-toned text never appears on cloth except the spine label, which is itself a piece of paper pasted on. Two binding details are the only exceptions: the gilt top edge of the page block (a 2px foil edge, never foil inside a page) and the bound-in silk, a deep-red ribbon bookmark and a striped headband at the head of the spine.

**The Highlighter Rule.** The four highlighter pigments appear only where the comment feature is: its swatches, its marks and its sticky notes. They are not accents, not status colours and not decoration.

## Typography

**Display Font:** Libertinus Serif (with Times New Roman, serif), self-hosted, Typst's own default face
**Body Font:** Libertinus Serif
**Label Font:** Libertinus Sans (with Segoe UI), only on the spine label and the comment demo's controls
**Mono Font:** Cascadia Code (with Consolas)

**Character:** One serif family does almost everything, as in a typeset thesis; hierarchy comes from weight, true small caps and italic, not from a second display face. The sans exists only on things that are not part of the book's text: the pasted label and the demo's tool chrome.

### Hierarchy
- **Display** (700, clamp 2.6rem to 5.6rem, line-height 1, 0.04em, small caps): the foil title on the front board. The title page and back cover use the same small-caps bold at smaller sizes.
- **Headline** (700, clamp 1.7rem to 2.35rem, 1.12): chapter openers, preceded by the chapter number with a wide gap.
- **Title** (700, 1.22rem, 1.25): numbered sections ("1.1 Around the page") and the List of Figures / Tables heads.
- **Body** (400, clamp 1.02rem to 1.14rem, 1.55): running text, max 68ch, hyphenated, first-line indent of 1.4em on every paragraph after the first, no gap between paragraphs.
- **Caption** (400, 0.95rem, 1.45): figure and table captions, set "Figure 1.1:" / "Table 2.1:" with the number in bold.
- **Label** (400, all small caps, 0.06-0.16em tracking): running heads, cover points and links, the spine title, definition terms.

### Named Rules
**The Real Small Caps Rule.** Labels are set with `font-variant-caps` (small caps or all small caps) plus modest tracking, never with uppercase text-transform; the face has true small caps and the thesis voice depends on them.

**The Thesis Numbering Rule.** Chapters, sections, figures, tables, footnotes and references are numbered and cross-referenced exactly as a typeset thesis would number them. Every number shown is real and links to its target.

## Layout

The page is three zones stacked vertically: the closed book (cover), the case holding the open book, and the back cover.

The cover fills one viewport (clamped 560-1080px tall): a grid with the spine as a fixed-width left column (132-176px) and the front board filling the rest. The board centres a foil frame up to 44rem wide. The spine label sits in the spine's lower panel, between the lower bands and the tail. A marbled endpaper sits under the board and shows as it swings.

Inside the case, content lives on paper objects up to 76rem wide, separated by a 1.25-2.25rem gap of cloth: **spreads** (two equal pages) and **plates** (one full-width figure). Each page has padding of clamp(1.5rem, 4.5vw, 4rem) plus room for the running head above and the folio below, and a minimum height near one screen so it reads as a page. Left pages carry their running head left-aligned, right pages right-aligned; chapter openers drop the running head.

At 720px and below the book has one page at a time: the spine narrows to 44px with only its upper bands and title, the label moves under the board, spreads collapse to single pages divided by a paper-edge rule, sticky notes stack below the demo text, and the definition list becomes one column.

## Elevation & Depth

Depth is physical and soft: the system imitates a real book under a lamp. Paper objects sit on cloth with a long, soft drop shadow and a 1px paper-edge bottom border; the cloth itself is shaded with inset shadows where it folds (case top edge, back cover top edge, board hinge); the spine is shaded with a horizontal gradient so it reads round. The foil frame is blind-stamped: an inset shadow on a double rule. Nothing has a hard, unblurred offset.

### Shadow Vocabulary
- **Page drop** (`box-shadow: 0 18px 30px -18px rgba(0,0,0,0.8)`): spreads and plates on the cloth, always with the 1px paper-edge bottom border.
- **Pasted label** (`box-shadow: 0 2px 4px rgba(0,0,0,0.35), 0 8px 18px -8px rgba(0,0,0,0.55)`): the spine label at rest; it lifts 2px with a deeper shadow on hover.
- **Sticky note** (`box-shadow: 0 4px 14px rgba(0,0,0,0.18)`): notes beside the demo text.
- **Cloth fold** (`box-shadow: inset 0 12px 20px -12px rgba(0,0,0,0.7)`): the inner top edge of the case and back cover.
- **Blind stamp** (`box-shadow: inset 0 1px 2px rgba(0,0,0,0.5), 0 1px 0 rgba(255,236,180,0.08)`): the foil frame's pressed double rule.

### Named Rules
**The Soft Paper Rule.** Shadows are soft and blurred, cast by paper on cloth or by a pasted object on paper. A paper object always pairs its shadow with a 1px paper-edge border.

**The Flat Foil Rule.** Foil lettering is a flat colour with no text-shadow, emboss, glow or gradient. Depth on the cover comes from the cloth and the stamped frame, not from the letters.

## Shapes

The book is rectangular and square-cornered: cloth, pages, plates, tables and code blocks have no radius. Rounding is reserved for small objects that are separately made and placed on the page: the spine label and keyboard keys (3px), inline code (2px), sticky notes (5px) and the round highlighter swatches. Rules are the main form device: gilt double rules on the spine (two 1px foil lines 5px apart), a stamped double rule around the cover title, hairline rules under running heads and above footnotes, and booktabs tables with a 2px top and bottom rule and a 1px rule under the header, with no vertical lines.

## Components

### Spine Label (primary action)
A white library label pasted on the spine: the download button.
- **Shape:** gently rounded (3px), 1px warm grey border.
- **Content:** download icon in library green, a bold sans main line, a small grey sub-line with version and architecture, stacked and centred.
- **Hover / Focus:** lifts 2px with a deeper shadow over 160ms (ease-out expo); returns on press. Focus ring is foil on cloth, library green on paper.
- **Reuse:** the same label appears on the back cover and inline in the Installation chapter; inside a page it keeps its own look, never the body-link style.

### Foil Links (navigation on cloth)
Underlined all-small-caps foil text with a 1px underline offset 0.3em ("Open the book", the GitHub link on the back cover). Hover brightens to bright foil.

### Contents (navigation on paper)
The contents page is the site navigation: number, bold title, dot leader (2px dotted grey) and right-aligned tabular page number, each row a link to its chapter. Lists of Figures and Tables follow in regular weight. Hover underlines the title only.

### Body Links
Library green with a 1px underline offset 0.18em; hover thickens the underline to 2px. Footnote markers are superscript links without underline.

### Command Block
Code set in Cascadia Code on a faint warm wash between two hairline rules, no box. Each command is its own line with a 2ch hanging indent, so a wrapped command never reads as a second command.

### Ribbon Bookmark
A deep-red silk ribbon (#6c221e to #93342d, forked tail, soft shadow) lies across the front board beside the spine and swings with it. It is a link to Figure 3.1 with its label set vertically in cream all-small-caps ("Try the highlighter · p. 4"), and it lengthens slightly on hover. The same ribbon lies in the outer margin of page 4 and hangs below its foot, so the page it marks is visible while reading. On phones the cover ribbon is hidden and the page ribbon narrows to fit the margin. One ribbon per book; it only ever marks the signature demo.

### Booktabs Table
Full-width, caption above, 2px ink rules top and bottom, 1px rule under the header, tabular lining numerals, no fills or vertical rules. Keyboard shortcuts inside use small key caps with a thicker bottom border.

### Fold-out Plate
A full-width paper sheet holding one figure (the product screenshot) with a 1px hairline border and a centred numbered caption.

### Highlighter Demo (signature)
Figure 3.1: a framed live paragraph the visitor drag-highlights. A toolbar strip (sans) above holds four round swatches (2px white ring, 1px grey outline; the pressed swatch gets a 2px ink ring) and a "Highlight selection" button pushed right. Marks use the chosen pigment at 55-65% over white. Each mark gets a sticky note in a column on the right: cream fill, 1px faint border, 4px top edge in the mark's colour, 5px radius, soft shadow, Save button in library green; notes glide to their position over 220ms.

## Do's and Don'ts

### Do:
- **Do** set every word on cloth in flat foil (#d8b765), in small caps or the small-caps bold title style.
- **Do** put new content on paper: a page in a spread, or a full-width plate, with the page-drop shadow and the 1px paper-edge border.
- **Do** give pages the thesis apparatus: running head (except on chapter openers), folio, numbered headings, numbered and captioned figures and tables.
- **Do** keep the download action as the pasted spine label wherever it appears.
- **Do** honour reduced motion for smooth scrolling. The board swing is the one exception: by the owner's choice it plays for everyone on desktop (above 720px).
- **Do** write body text at 68ch or less, hyphenated, with indented paragraphs and no paragraph gaps.

### Don't:
- **Don't** add text-shadow, emboss, glow or gradient to foil lettering.
- **Don't** use hard, unblurred offset shadows anywhere.
- **Don't** use the highlighter pigments outside the comment feature.
- **Don't** introduce a second display face or set labels in uppercase; use Libertinus small caps.
- **Don't** round the book's own surfaces (cloth, pages, plates, tables, code blocks).
- **Don't** add a running head to a chapter-opening page.
- **Don't** apply anything in this file to the desktop app in `src/`.
