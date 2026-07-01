# Dispatch — Anthropic Newsroom-Inspired Restyle

**Date:** 2026-07-01
**Status:** Draft, pending spec review
**Context:** Kevin wants Dispatch issue/interlude pages to feel closer to anthropic.com/news — verified against the live site (screenshots + computed styles), not memory. Direction confirmed with Kevin: borrow the *structure*, keep Dispatch's *soul* (italic display headline, terracotta accent, bilingual EN/KO, personal warmth). Scope confirmed: individual issue + interlude pages, not the listing page or the multi-user `dispatch/` platform.

## 1. Reference: what anthropic.com/news actually does

Captured live (2026-07-01), not from training data:

- **Palette:** bg `#faf9f5`, text `#141413` — already nearly identical to Dispatch's `#f0eee6` / `#1f1e1d`. No palette change needed.
- **Type pairing:** bold grotesk-sans headlines (700/600 weight) over **serif** body copy (17px, line-height ~1.55, 640px column). Dispatch's body is already serif (Newsreader) — that half already matches. The gap is the headline: Dispatch uses an italic serif display (Cormorant Garamond) where Anthropic uses a sans.
- **Structure:** centered uppercase eyebrow/category label → headline → centered date/meta row → hairline rules (1px, no boxes) as the only dividers → narrow reading column → a 2–3 card "Related content" grid at the very bottom, before the footer.
- **Whitespace:** generous, calm vertical rhythm; nothing is boxed or bordered.

## 2. Decision: what to borrow vs. keep

| Element | Decision |
|---|---|
| Big italic display headline (`mast-title` / `hero-title`) | **Keep as-is.** Cormorant Garamond italic is Dispatch's emotional signature, not chrome. |
| Body copy | **Keep as-is.** Newsreader already matches the serif-body pattern. |
| Terracotta accent, dividers-as-ornament (`.divider`), komorebi interstitial, gate, bilingual EN/KO | **Keep as-is.** Not touched by this project. |
| Kicker / eyebrow / dateline / meta-row chrome | **Restyle** — new structural sans typeface, tighter uppercase tracking, quieter color, matching Anthropic's crisp meta row. Currently these use `var(--mono)` (a "wire/dossier" monospace look). |
| "Related content" grid | **New.** Add a "More letters" module (prev/next issue) before the subscribe form, styled with the new sans for titles + hairline top rule. |
| Section rhythm/whitespace | **Light touch-up.** Slightly more breathing room around dividers; no structural rewrite of each issue's bespoke content. |
| Each issue's bespoke widgets (deal-wire cards, estadio graphics, relay-rink SVG, mini-player, etc.) | **Out of scope.** These are per-issue custom content, not shared chrome. Not touched. |

## 3. Typography

Add one new font: **Archivo** (Google Fonts), weights 500/600/700, for structural chrome only — never for body copy or the big display headline.

```css
--font-sans: 'Archivo', -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
```

No `[data-lang="ko"]` override is needed: Archivo has no Hangul glyphs, so browsers automatically fall through to the system Korean sans in the stack per-character. This mirrors the existing `--font`/`--font-display`/`--mono` variable pattern already used on every page.

Applied to:
- `.mast-kicker` / `.hero-label` (issue number + kicker text)
- `.mast-dateline` (dateline meta row) — where present
- The new "More letters" module: label, issue numbers, entry titles

**Not** applied to `--mono`-styled elements inside bespoke per-issue widgets (dossier cards, wire tickers, etc.) — those stay as authored; unifying them is out of scope.

Google Fonts `<link>` on every touched page gains `Archivo:wght@500;600;700` in the existing combined request (alongside Cormorant Garamond / Newsreader / Noto Serif KR).

## 4. New shared markup: "More letters" module

Placed after the last content divider, before the subscribe-form divider — same rhythm slot every other section already uses (`<div class="divider reveal-fade"></div>` on both sides).

```html
<nav class="more-letters reveal-fade" aria-label="More letters">
  <p class="more-letters-label">
    <span data-l="en">More letters</span><span data-l="ko">다른 편지</span>
  </p>
  <div class="more-letters-grid">
    <a href="/newsletter/006/" class="more-letter">
      <span class="more-letter-num">No. 006</span>
      <span class="more-letter-title"><span data-l="en">Us</span><span data-l="ko">우리</span></span>
      <span class="more-letter-desc">
        <span data-l="en">One-line teaser, reused/trimmed from the listing page's entry-desc.</span>
        <span data-l="ko">...</span>
      </span>
    </a>
    <a href="/newsletter/" class="more-letter more-letter-all">
      <span class="more-letter-title"><span data-l="en">All letters &rarr;</span><span data-l="ko">모든 편지 &rarr;</span></span>
    </a>
  </div>
</nav>
```

Rules:
- Two cards: **previous** and **next** issue chronologically. The newest issue (currently 007) has no "next" — its second card is "All letters" linking to `/newsletter/`. The oldest issue (001) has no "previous" — same fallback.
- The interlude (`wounds-of-a-friend`) has no chronological neighbors in the weekly arc — its two cards are "All letters" and the latest issue.
- Teaser copy is a trimmed reuse of that issue's existing `entry-desc` line from `newsletter/index.html` (already written, already bilingual) — not new copywriting.
- Card titles use `--font-sans` (600 weight); teaser desc stays serif/caption color, matching Anthropic's sans-title/serif-excerpt card pattern.

## 5. Where the CSS lives

- **New shared rules** (`.more-letters*`) go in `css/microfeatures.css`, namespaced `mfx-` per that file's existing convention, keyed off `--text`/`--bg`/`--font`/`--accent` with internal fallbacks (same pattern as `.mfx-anchor` etc.) — one definition, no duplication across 8 files.
- **Per-page tweaks** (adding `--font-sans` to each page's own `:root`, applying it to that page's existing `.mast-kicker`/`.hero-label`/`.mast-dateline` rules, adding `Archivo` to the Google Fonts link) are necessarily edited per file, since every page's chrome is in its own inline `<style>` block (existing architecture — see project CLAUDE.md).

## 6. Files touched

- `newsletter/template.html` — base template so new issues inherit this by default.
- `newsletter/001/index.html` through `newsletter/007/index.html` — 7 issues.
- `newsletter/wounds-of-a-friend/index.html` — interlude.
- `css/microfeatures.css` — new `.mfx-more-letters*` rules.

Each issue currently implements its header chrome slightly differently (`.mast-kicker`/`.mast-title` cold-open on 007; `.hero-label`/`.hero-title` full-bleed-photo cold-open on 001–003/wounds-of-a-friend/template; other variants on 004–006). Implementation adapts *within* each file's existing pattern — same principle, whatever that page currently calls its kicker/label — rather than forcing every issue onto one literal markup shape.

## 7. Out of scope (YAGNI)

- `newsletter/index.html` (the listing/almanac page) — untouched.
- The `dispatch/` multi-user platform — untouched.
- Share icons (X/LinkedIn) under the headline — Anthropic has them because it's a press newsroom; Dispatch is sent to friends/family, not built for viral sharing. Skipping keeps it honest to the newsletter's actual audience.
- Rebuilding each issue's bespoke widgets to match Anthropic's diagram/chart style.
- A "category" taxonomy (Product/Policy/Announcements) — Dispatch issues aren't categorized and don't need to be.

## 8. Acceptance

- Every touched page still passes its existing behavior: theme toggle, language toggle, komorebi/gate interstitial (where present), subscribe/comments forms all still work.
- New "More letters" module renders correctly (2 cards, correct prev/next links, bilingual, matches light + dark theme, respects `prefers-reduced-motion`).
- Archivo loads and visibly changes kicker/dateline/related-module chrome; the big display headline and body copy are visually unchanged from before this change.
- No new CLS/layout shift beyond what already exists from the current font-loading strategy (`display=swap`, already in use).
- Mobile (≤768px) layout for the new module doesn't break — 2 cards stack.
