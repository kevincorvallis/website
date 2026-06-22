# Editorial Microfeatures — Design

**Date:** 2026-06-21
**Status:** Approved approach, pending spec review
**Context:** Sub-project #1 of 4 in a "creative ideas" track for klee.page. Goal across the track: *signal craft to recruiters*. Order: (1) editorial microfeatures ← this, (2) make MERFISH decoder interactive, (3) one load-bearing explainer, (4) /now + /uses + easter egg.

## 1. Overview

Add a set of small, high-craft reading-experience features to the long-form pages — the touches HN's most-loved editorial sites are praised for (Tufte CSS, Gwern, the 983-pt *Microfeatures* thread). They reinforce the existing "editorial warmth" aesthetic and quietly demonstrate taste + attention to detail. This sub-project also lays **shared infrastructure** (sidenotes, link-previews, RSS, anchors) reused by later sub-projects.

## 2. Scope

**In scope — 6 long-form pages:**
- `resume/index.html`
- `projects/merfish/index.html`, `projects/shredders/index.html`, `projects/spacec/index.html`
- `newsletter/template.html` + issues `newsletter/00{1..7}/index.html`

**Out of scope (YAGNI):** index/home page, `/photos`, `/brock`, `/admin`; a projects/writing RSS feed (Dispatch only); comments/webmentions; digital-garden restructuring.

## 3. Architecture

Two new **drop-in shared assets**, mirroring the existing `js/theme.js` + `js/i18n.js` convention (no build step, no dependencies):

- **`js/microfeatures.js`** — one vanilla IIFE, loaded `<script src="/js/microfeatures.js" defer></script>` near the other shared scripts on each in-scope page.
- **`css/microfeatures.css`** — `<link rel="stylesheet" href="/css/microfeatures.css">` in each in-scope page `<head>`.

**Token strategy (critical):** only `--bg`, `--text`, `--font` are defined on *every* page; `--accent`/`--rule`/`--tag-bg` exist only on some (MERFISH, newsletter template have `--accent`; resume/shredders/spacec do not). `microfeatures.css` must therefore:
- Use only `--text` / `--bg` directly.
- Define its own internal fallbacks: `--mf-accent: var(--accent, currentColor)`, and derive hairlines from `color-mix(in srgb, var(--text) 14%, transparent)` rather than assuming `--rule`.
- Inherit light/dark automatically because it composes from `--text`/`--bg` (which flip via `[data-theme]`).

**Principles:**
- **Progressive enhancement** — every feature degrades to plain links/headings/text if JS or CSS fails to load. View-source stays clean and readable (an HN value).
- **`prefers-reduced-motion: reduce`** — no transitions/animations; features still function statically.
- **Touch** — hover-only features (link-previews) disable on `(pointer: coarse)`; nothing blocks scroll (we just fixed that on MERFISH).
- **No third-party calls** — no external favicon/preview services or trackers.

## 4. Features

### 4.1 Self-linking headings (automatic)
- JS slugifies `h2`/`h3` text → sets `id` (skips headings that already have one; de-dupes collisions with `-2` suffix).
- Appends an anchor (`¶`) revealed on heading hover/focus; click copies the absolute deep link and shows a brief "Copied" confirmation (`aria-live="polite"`).
- **Acceptance:** every h2/h3 on in-scope pages is deep-linkable; existing ids preserved; keyboard-focusable; works light/dark.

### 4.2 External-link icons (automatic)
- JS tags `a[href]` whose host ≠ `klee.page`/localhost as external (`data-ext`), adds `rel="noopener noreferrer"` if missing, sets `data-ext-host`.
- CSS appends a trailing glyph: default `↗`; destination-specific for `github.com`, `arxiv.org`/DOI (`doi.org`), `wikipedia.org`.
- **Acceptance:** outbound links visibly marked + safe `rel`; internal links untouched; no-op where there are no external links (Shredders); icons don't wrap awkwardly or appear on image links.

### 4.3 Reading progress (automatic, with skip)
- A 2px top progress bar bound to document scroll.
- **Auto-skips** any page that already provides one — detect `.mf-progress-top` (MERFISH) or a `data-mf-skip="progress"` opt-out on `<html>`.
- **Acceptance:** bar fills 0→100% over the page on resume/shredders/spacec/Dispatch; MERFISH unchanged (no double bar); reduced-motion = instant fill, no transition; works with Dispatch's Lenis smooth scroll (uses `scroll` event / `scrollY`, not a fixed assumption).

### 4.4 Hover link-previews (automatic + light curation)
- Desktop (`pointer: fine`) only; triggered on hover-intent (~120ms delay) and on keyboard focus; dismissed on mouseout/blur/Escape.
- **Internal links (same-origin):** fetch the target once, parse `<title>` + `<meta name="description">` (+ optional `og:image`), cache in a `Map`. Show a small card near the link.
- **External links:** card shows an inline SVG favicon for known hosts (else a generic globe) + domain, plus an optional hand-written note pulled from a curated `js/link-previews.json` (`{ "<url-or-prefix>": { "title", "note" } }`). No third-party requests.
- **Acceptance:** internal preview shows correct title/description; external shows domain + (curated) note; nothing on touch; fetch failure = no popup (silent); cards never trap focus, never overflow viewport, respect reduced-motion (no fade).

### 4.5 Sidenotes / marginnotes (light editorial pass)
- **Mechanism:** markup convention + CSS counters, JS-assisted positioning.
  - Reference: `<span class="mf-sn" data-i18n-html="<key>">…note text…</span>` placed inline at the anchor point; JS extracts it, inserts a numbered superscript ref, and renders the note.
  - Wide screens (enough margin beside the centered column): note floats in the right margin, vertically near its ref.
  - Narrow screens / insufficient margin: ref becomes a tap target that expands the note inline (details/summary semantics or a toggle).
- **Density:** disciplined — ~2–4 per page, drawn from existing parentheticals/caveats (not new claims).
- **i18n:** on already-translated pages (resume, MERFISH) the note text uses `data-i18n-html` and gets FR/KO/JA entries added to `i18n/{fr,ko,ja}.json` (EN renders from HTML). On non-i18n'd pages it's plain HTML.
- **Acceptance:** notes float correctly beside text ≥1100px, collapse to tap-to-expand below; numbering is sequential per page; no layout shift on the main column; reduced-motion safe; FR/KO/JA show translated note text on i18n'd pages (0 missing keys).

### 4.6 RSS feed — Dispatch (serverless function + manifest)
- **Source of truth:** `newsletter/issues.json` — array of `{ "number", "slug", "title", "title_ko"?, "date" (ISO), "summary", "path" }`, newest-first.
- **Function:** `api/dispatch-feed.js` (Vercel function) reads the manifest and emits valid **RSS 2.0** (`Content-Type: application/rss+xml; charset=utf-8`, sensible cache headers). Absolute URLs under `https://klee.page`.
- **Routing:** `vercel.json` rewrite `/newsletter/feed.xml` → the function so the public URL is a clean `feed.xml`.
- **Discovery:** `<link rel="alternate" type="application/rss+xml" title="Dispatch" href="/newsletter/feed.xml">` in the newsletter template + issues; a visible "RSS" link in the archive footer.
- **Acceptance:** `/newsletter/feed.xml` returns valid RSS (validates against W3C Feed Validator rules — well-formed XML, required channel/item fields, RFC-822 dates); items match published issues; feed reader can subscribe; adding an issue = append one manifest entry.

## 5. Data contracts

```jsonc
// newsletter/issues.json
[
  { "number": 7, "slug": "leave", "title": "Leave", "date": "2026-06-20",
    "summary": "…", "path": "/newsletter/007/" }
]
```
```jsonc
// js/link-previews.json  (curated external annotations; optional)
{ "https://github.com/kevincorvallis": { "title": "GitHub", "note": "Open-source + this site's source." } }
```

## 6. Accessibility
- Anchor + preview + sidenote toggles are real, focusable controls with `aria-label`s; visible focus rings (reuse existing `:focus-visible` styling).
- "Copied" + any dynamic text via `aria-live="polite"`.
- All hover affordances also work on focus; Escape dismisses previews.
- Honor `prefers-reduced-motion`; maintain warm-contrast palette (no pure #000/#fff).

## 7. Performance
- No third-party requests; internal previews fetched lazily on hover-intent and cached; one small JS file, one small CSS file.
- Link-preview fetch uses `AbortController` on dismiss; cap concurrent prefetches.

## 8. Edge cases / risks
- **MERFISH** already has a progress scrubber + heavy canvas JS → reading-progress auto-skips; ensure self-link anchors don't collide with `data-chapter` logic.
- **Dispatch** uses GSAP/Lenis → progress reads actual scroll position; previews/sidenotes must not fight smooth-scroll.
- **`newsletter/001/index.html` is CRLF** (known) → touch it minimally; keep line endings (only add the `<link>`/script tags, no full-file reflow).
- **Shredders** has 0 external links → external-icon feature simply finds none.
- Sidenotes on translated pages add FR/KO/JA entries — kept small by the disciplined density.

## 9. Testing (Playwright, mirrors the MERFISH verification approach)
- Per in-scope page: anchors present + copy works; external links marked + `rel` set; progress bar present (and **absent-as-duplicate** on MERFISH); previews appear on hover (desktop ctx) and not on iPhone-13 ctx; sidenotes float ≥1100px and collapse at 390px.
- Light + dark; `prefers-reduced-motion` (features static, content visible).
- i18n: FR/KO/JA on resume + MERFISH show translated sidenote text, 0 missing keys.
- RSS: fetch `/newsletter/feed.xml` (against `vercel dev` or the deployed preview) → well-formed XML, item count == manifest, valid RFC-822 dates.
- Adversarial review workflow on the diff (as with the mobile fix) before merge.

## 10. Rollout within this sub-project
1. Scaffold `js/microfeatures.js` + `css/microfeatures.css`; wire into the 6 pages.
2. Ship automatic features (anchors, external icons, progress) — verify.
3. Link-previews (internal, then external + curated JSON) — verify.
4. Sidenote mechanism + the disciplined per-page content/i18n pass — verify.
5. RSS manifest + function + routing + discovery — verify.
6. Adversarial review → commit → push → deploy.
