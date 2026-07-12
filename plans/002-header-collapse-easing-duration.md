# 002 — Fix easing and duration on the homepage header-collapse

- **Status**: DONE
- **Commit**: 5e286f6
- **Severity**: HIGH
- **Category**: 2 — Easing & duration (with a Category 5 performance note that stays as a documented tradeoff — see Boundaries)
- **Estimated scope**: 1 file, 2 near-identical rules

## Problem

`index.html`'s "Kevin Lee" → "K lee" header-collapse-on-scroll effect (`.char-collapse`, driven by `js/header-scroll.js` toggling a `.collapsed` class, with a modern `animation-timeline: scroll()` path for browsers that support it) uses a transition curve and duration that don't match this repo's conventions:

```css
/* css/main.css:101-107 — current (base rule, used directly by browsers without animation-timeline support, and as the pre-JS default) */
.char-collapse {
    display: inline-block;
    overflow: hidden;
    max-width: 100px;
    opacity: 1;
    transition: max-width 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
}
```

```css
/* css/main.css:133-138 — current (JS-fallback path for browsers lacking animation-timeline, e.g. Firefox) */
.site-title.collapsed .char-collapse {
    max-width: 0;
    opacity: 0;
    transition: max-width 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
}
```

This is the single highest-frequency animated element on the site — it fires continuously as the user scrolls the homepage (recon confirmed: `js/header-scroll.js`'s rAF-throttled scroll handler toggles `.collapsed` based on scroll position on every homepage visit). Two issues:

1. **Wrong curve for a one-way exit.** `cubic-bezier(0.4, 0, 0.2, 1)` is Material Design's "standard" ease — a symmetric-ish curve. This effect only ever collapses (or, scrolling back up, expands) — it's an entering/exiting transition, which AUDIT.md's decision order maps to `ease-out`, not this curve.
2. **Duration exceeds budget.** 400ms is above AUDIT.md's "UI animations stay under 300ms" ceiling.

The `@supports (animation-timeline: scroll())` block (`css/main.css:113-131`) is a **separate, correct mechanism** — it uses `animation: collapse linear both; animation-timeline: scroll();`, where `linear` is the right choice because the animation's progress is literally tied to scroll position, not wall-clock time (AUDIT.md: "Constant motion... → linear" — this is the scroll-linked case, not a violation). **Do not touch that block.**

## Target

Add the shared `--ease-out` token (if Plan 001 has already run, it exists; if not, add it here) to `css/main.css`'s `:root`:

```css
:root {
    --bg: #f0eee6;
    --text: #1f1e1d;
    --font: 'Newsreader', Georgia, 'Times New Roman', serif;
    color-scheme: light dark;
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
}
```

(If `--ease-out` is already present from Plan 001, skip re-adding it — just confirm it exists before proceeding.)

```css
/* css/main.css:101-107 — target */
.char-collapse {
    display: inline-block;
    overflow: hidden;
    max-width: 100px;
    opacity: 1;
    transition: max-width 250ms var(--ease-out), opacity 200ms var(--ease-out);
}
```

```css
/* css/main.css:133-138 — target */
.site-title.collapsed .char-collapse {
    max-width: 0;
    opacity: 0;
    transition: max-width 250ms var(--ease-out), opacity 200ms var(--ease-out);
}
```

Only the `transition` line changes in both rules. `max-width: 100px` / `max-width: 0` / `opacity` values are unchanged.

## Repo conventions to follow

- If Plan 001 (shared easing tokens) has already been executed on this repo, `--ease-out` will already exist in `css/main.css`'s `:root` — reuse it, do not redefine it a second time.
- If Plan 001 has NOT been run yet, add the token yourself as shown above (this plan does not depend on Plan 001 running first, but the two will converge on the same token name/value — that's intentional).

## Steps

1. Open `css/main.css`. Check whether `:root` (lines 7-12) already contains `--ease-out`. If not, add `--ease-out: cubic-bezier(0.23, 1, 0.32, 1);` after `color-scheme: light dark;`.
2. Change line 106 from `transition: max-width 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;` to `transition: max-width 250ms var(--ease-out), opacity 200ms var(--ease-out);`.
3. Change line 137 (the byte-identical transition line inside `.site-title.collapsed .char-collapse`) the same way.

## Boundaries

- Do NOT touch the `@supports (animation-timeline: scroll())` block (`css/main.css:113-131`) — its `linear` timing is correct for scroll-linked motion, not a violation.
- Do NOT change the animated **property** from `max-width` to `transform`. This effect requires an actual layout-width change: the collapsing characters need to free up real horizontal space so the sibling text ("Lee" → " lee") reflows tighter, which a purely compositor-side `transform: scaleX()` would not produce (it would visually squish the glyph without closing the gap). This is a case where AUDIT.md's "animate transform/opacity only" performance guidance is in tension with a layout effect the component intentionally produces — treat the `max-width` property as a confirmed, necessary tradeoff for this plan; only the curve and duration are in scope.
- Do NOT change `js/header-scroll.js` — its rAF-throttling and class-toggle logic are unaffected by this plan.
- If the code at either line doesn't match what's shown above (drift since commit `5e286f6`), STOP and report instead of improvising.

## Verification

- **Mechanical**: `npm run dev`, open `index.html`, confirm no console errors.
- **Feel check**: scroll the homepage down past ~120px and back up:
  - The "Kevin Lee" → "K lee" collapse should feel crisp and responsive (fast start), not linear or sluggish.
  - Total collapse should visibly complete faster than before (250ms vs 400ms) without looking abrupt.
  - In DevTools, force the JS-fallback path (e.g. temporarily rename `animation-timeline` in a copy of the stylesheet, or test in a browser without scroll-timeline support) and confirm the same easing/duration applies via `.site-title.collapsed .char-collapse`.
  - Toggle `prefers-reduced-motion` (Rendering panel) and confirm the existing blanket override at `css/main.css:326-330` still zeroes the transition duration (unaffected by this plan).
- **Done when**: both transition declarations use `var(--ease-out)` at 250ms/200ms, and the scroll-timeline `@supports` block is untouched.
