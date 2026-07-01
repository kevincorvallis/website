# Projects Page Redesign — "The Catalogue"

**Date:** 2026-07-01
**Page:** `/projects` (`projects/index.html`)
**Status:** Approved design

## Goal

Transform `/projects` from a resume-like page (featured cards with device-frame
mockups + tag pills, then a flat "Also Built" list) into an editorial catalogue
that reads as a *living practice* — credible to a recruiter, genuinely browsable
by a curious visitor. Keep the site's soul intact: Newsreader serif, cream/ink
palette, light+dark themes, no build step, vanilla HTML/CSS/JS.

Grounded in research of acclaimed 2025–2026 projects pages (Frank Chimero,
Rauno Freiberg, Paco Coursey, Geoffrey Litt, Maggie Appleton, et al.). The
adopted pattern is "Chimero's structure with Rauno's ledger discipline":
selected work with catalogue-caption metadata, plus a dated text ledger.

## Non-goals

- No changes to the individual case-study pages (`projects/shredders/`,
  `projects/merfish/`, `projects/spacec/`).
- No metrics/star badges, no interleaved essays (explicitly declined — keep lean).
- No JS interactivity beyond what already loads (`theme.js`, `i18n.js`). The
  page stays static. The unused expand/collapse CSS in the current file is
  removed, not revived.
- No new fonts or dependencies.

## Design

### Layout & tokens
- Main column narrows **800px → 720px** for a better reading measure on the now
  text-heavier page. Header/footer max-width match at 720px.
- Add italic Newsreader weights to the Google Fonts URL
  (`ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400;1,6..72,500`) — the lede
  and deks use italics.
- New CSS custom properties in both `:root` and `[data-theme="dark"]`:
  `--caption` (~55% light / 50% dark ink), `--rule` (~14% hairlines),
  `--img-border` (~12–14%). Keep existing `--tag-bg` for status chips.

### 1. Intro block
- `<h1>` "Projects" (unchanged style).
- **Lede** — one serif sentence, max ~34em, with an italic phrase. Draft:
  "Most of what I build starts as a problem from *skiing, flying, or the lab* —
  and turns into something I'd actually use. A few of these grew up; the rest
  are honest experiments." (Kevin to finalize wording.)
- **Freshness line** — small uppercase caption with a green status dot:
  "Updated June 2026 · currently building Dispatch". (Kevin to finalize.)
- The current PookieB subtitle line is folded into / replaced by the lede.

### 2. Selected work (3 entries: Shredders, MERFISH, SPACEc)
Each entry, top to bottom:
- **Title** (serif, 25px, 600) linking to the case study; hover shows an
  underline (border-bottom), no opacity dimming of the whole block.
- **Caption metadata** — small-caps/uppercase tracked line, `--caption` color:
  *medium · years · status*, dot-separated. Examples (Kevin to correct):
  - Shredders — "iOS & web app · 2023 – present · live"
  - MERFISH — "Research software · UW · 2024 · open source"
  - SPACEc — "Python library · Stanford · 2023 – present · adopted"
- **Image** — one quiet image, full-width, `1px` `--img-border`, `6px` radius.
  **Device-frame mockups (browser/phone chrome) are removed.** Sources:
  - Shredders: `images/shredders.jpg`
  - MERFISH: `images/merfish-hero.png`
  - SPACEc: `images/spacec-overview.jpg` (exists but was never used before)
  - Keep the existing `onerror` hide behavior so a missing image collapses cleanly.
- **Why-dek** — a motivation sentence (replaces tag pills), max ~36em.
- **Note** — one italic `--caption` fact line (secondary detail / tech).
- **Links** — verbs with hairline underline: "Read the case study →" and,
  where applicable, "GitHub →".

Tag pills are removed from selected work.

### 3. Ledger — "Also in the workshop" (was "Also Built")
- Section label in tracked small-caps.
- Text-only rows, each separated by a top hairline (`--rule`); last row also has
  a bottom hairline. CSS grid: content column + right-aligned link verb.
- Each row:
  - **Head line**: name (19px, 600) · year (tabular-nums, caption) · **status
    chip** (uppercase, `--tag-bg` pill): one of `maintained` / `experiment` /
    `archived`.
  - **Link verb**, right-aligned, uppercase caption: "Visit →" or "GitHub →".
  - **Dek**: one-line description, `--caption`, max ~40em.
- Entries (year + status are Kevin's to confirm; drafted values):
  - Colette — 2024 · maintained · Visit
  - Wilco — 2024 · experiment · Visit
  - SmartSpender — 2024 · experiment · GitHub
  - ADU Checker — 2024 · archived · GitHub
  - DayByDay — 2023 · maintained · Visit
  - Harmony Tracker — 2023 · experiment · GitHub
  - Pookie B News Daily — 2023 · archived · GitHub

### 4. Footer
Unchanged.

## Responsive
- Preserve the 768px breakpoint. On mobile: single column (already the case for
  selected work); ledger rows collapse to one column with the link verb moving
  below the dek (default), not staying right-aligned. Reduce type sizes per
  existing mobile rules.
- Keep entrance fade-up animations but retarget selectors to the new structure
  (`.work`, `.entry`, lede, freshness). Honor `prefers-reduced-motion`.

## i18n
The page uses `data-i18n` / `data-i18n-html` with `data-i18n-page="projects"`.
English renders from the HTML; FR/KO/JA come from `i18n/{lang}.json` under the
`projects.*` namespace. New/changed strings (lede, freshness, each caption,
each why-dek, note lines, section labels, status chips, ledger deks) must get
`data-i18n` keys and corresponding entries added to **all three** translation
files (fr, ko, ja). Status labels and metadata may be short enough to translate;
years stay numeric. This is a required part of the work, not a follow-up.

## Accessibility
- Keep skip-link, focus-visible outlines, `sr-only` patterns.
- Status chips are decorative-ish but informative — ensure contrast of
  `--caption` on `--tag-bg` meets AA for the small text, or bump the chip text
  color. Verify in both themes.
- Images keep meaningful `alt`.

## Testing
- Manual: render in light + dark, desktop + mobile (Playwright screenshots),
  verify no device frames remain, images load, hairlines/contrast read well.
- If a smoke test asserts on `/projects` structure (e.g. `.featured`, tag
  selectors), update it to the new markup. Check `tests/smoke/` for references.
- Verify EN/FR/KO/JA all render (language toggle) with no missing-key fallbacks.

## Implementation notes
- Check EOL of `projects/index.html` before editing (repo has some CRLF files);
  preserve existing line endings, prefer targeted edits over full-file rewrite.
- All styles are inline in `projects/index.html` per the site's per-page CSS
  convention — no shared CSS changes needed.
