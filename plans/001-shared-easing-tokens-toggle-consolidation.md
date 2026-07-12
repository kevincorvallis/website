# 001 — Establish shared easing tokens and consolidate the theme-toggle transition

- **Status**: DONE
- **Commit**: 5e286f6
- **Severity**: HIGH
- **Category**: 7 — Cohesion & tokens
- **Estimated scope**: 11 files (`css/main.css` + 10 page-local `<style>` blocks), CSS-only except one HTML-adjacent selector fix

## Problem

No file in the repo defines a shared `--ease-*` custom property. Every page hand-types its own easing/duration for the same visual component: the theme-toggle knob (the sliding dot inside `.toggle-wrap label`). Confirmed three distinct, incompatible implementations exist side by side:

**Family A — bare `0.2s`, no easing function** (7 locations: `css/main.css`, `resume/index.html`, `photos/index.html`, `projects/index.html`, `japan-trip/index.html`, `projects/shredders/index.html`, `projects/ai-workflow/index.html`, `projects/spacec/index.html` — 8 locations total):

```css
/* css/main.css:175-189 — current (resume/photos/projects/shredders/ai-workflow/spacec are byte-identical) */
.toggle-wrap label::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: var(--bg);
    border-radius: 50%;
    transition: transform 0s;
}

.toggle-wrap label.has-transition::after {
    transition: transform 0.2s;
}
```

(`japan-trip/index.html:95-99`, `projects/shredders/index.html:93-98`, `projects/ai-workflow/index.html:90-95`, `projects/spacec/index.html:90-95` write the same two rules on fewer lines, e.g. `.toggle-wrap label.has-transition::after { transition: transform 0.2s; }` — same values, condensed formatting.)

**Family B — `0.35s cubic-bezier(0.4,0,0.2,1)` plus a duplicated `background-color 0.5s ease`** (2 locations: `exposure/index.html`, `now/index.html`):

```css
/* exposure/index.html:78-87 — current (now/index.html:57-66 is byte-identical) */
.toggle-wrap label {
    position: relative; display: block; width: 40px; height: 20px;
    background: var(--text); border-radius: 10px; cursor: pointer; transition: background-color 0.5s ease;
}
.toggle-wrap label::after {
    content: ''; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px;
    background: var(--bg); border-radius: 50%; transition: transform 0s, background-color 0.5s ease;
}
.toggle-wrap label.has-transition::after { transition: transform 0.35s cubic-bezier(0.4,0,0.2,1), background-color 0.5s ease; }
```

**Family C — `0.25s ease`, AND a broken selector** (1 location: `ai/index.html`):

```css
/* ai/index.html:107-131 — current */
.toggle-wrap label::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    background: var(--bg);
    border-radius: 50%;
}

.toggle-wrap.has-transition label::after {
    transition: transform 0.25s ease;
}
```

`js/theme.js:9-11` adds the `has-transition` class to the `<label>` element itself (`toggleLabel = toggle.nextElementSibling`, then `toggleLabel.classList.add('has-transition')`), matching the `label.has-transition` pattern used everywhere else. But `ai/index.html`'s selector is `.toggle-wrap.has-transition label::after` — it expects the class on the ancestor `.toggle-wrap` div, not on the label. Since the class is only ever added to the `<label>`, **this selector never matches**, and the toggle knob on `ai/index.html` never animates at all (it snaps instantly on every toggle, not just on page load, since `.toggle-wrap label::after` has no `transition` property in its base state either). This is a real bug, not just a cohesion nit — confirmed by reading the markup at `ai/index.html:450-452` (`<div class="toggle-wrap"><input id="theme-toggle"><label for="theme-toggle">`).

## Target

Add two tokens (AUDIT.md canonical values — do not approximate) to the `:root` block of all 11 files:

```css
:root {
    --bg: #f0eee6;
    --text: #1f1e1d;
    --font: 'Newsreader', Georgia, 'Times New Roman', serif;
    color-scheme: light dark;
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
    --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
}
```

The toggle knob is a moving/morphing-on-screen control (it slides left-to-right), so per AUDIT.md's decision order it takes `--ease-in-out`, not `--ease-out`. Target duration: 160ms (within the "button press feedback" 100–160ms budget, since a toggle-knob slide is a small, immediate control response).

One canonical recipe, applied everywhere:

```css
/* target — base state (unchanged from Family A/B, just showing where it stays) */
.toggle-wrap label::after {
    transition: transform 0s;
}

/* target — gated state, identical in every file */
.toggle-wrap label.has-transition::after {
    transition: transform 160ms var(--ease-in-out);
}
```

For Family B (exposure/, now/): keep the `background-color 0.5s ease` transition on the base `label`/`label::after` rules (it doesn't need the load-suppression gate — only the position slide does), but remove the redundant repetition of it inside `.has-transition::after`:

```css
/* exposure/index.html, now/index.html — target */
.toggle-wrap label {
    position: relative; display: block; width: 40px; height: 20px;
    background: var(--text); border-radius: 10px; cursor: pointer; transition: background-color 0.5s ease;
}
.toggle-wrap label::after {
    content: ''; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px;
    background: var(--bg); border-radius: 50%; transition: transform 0s, background-color 0.5s ease;
}
.toggle-wrap label.has-transition::after { transition: transform 160ms var(--ease-in-out); }
```

For `ai/index.html` (Family C): fix the selector AND the value:

```css
/* ai/index.html — target */
.toggle-wrap label::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    background: var(--bg);
    border-radius: 50%;
    transition: transform 0s;
}

.toggle-wrap label.has-transition::after {
    transition: transform 160ms var(--ease-in-out);
}
```

(Note the selector changes from `.toggle-wrap.has-transition label::after` to `.toggle-wrap label.has-transition::after` — the class moves from qualifying `.toggle-wrap` to qualifying `label`. Also added the missing `transition: transform 0s;` to the base `::after` rule, matching every other file's load-suppression pattern.)

## Repo conventions to follow

- Tokens live in each file's own `:root` block (this repo has no single shared stylesheet across pages — `css/main.css` is index-only; every sub-page duplicates its own `:root`, per this repo's own CLAUDE.md).
- `projects/merfish/index.html:59` already defines a local `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)` and reuses it ~12 times — this is the repo's one positive "define once, reuse" exemplar. Do **not** edit `projects/merfish/index.html` in this plan (out of scope — it already uses a token, just a slightly different value; leave it as-is).
- `js/theme.js` is not touched by this plan — its `setTimeout(() => toggleLabel.classList.add('has-transition'), 100)` mechanism is correct and shared by all pages; only the CSS values it gates are changing.

## Steps

1. **`css/main.css`**: add `--ease-out: cubic-bezier(0.23, 1, 0.32, 1); --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);` to the `:root` block (after `color-scheme: light dark;`, line 11). Change `.toggle-wrap label.has-transition::after` (line 187-189) from `transition: transform 0.2s;` to `transition: transform 160ms var(--ease-in-out);`.
2. **`resume/index.html`**: same token addition to `:root` (line 53). Change `.toggle-wrap label.has-transition::after` (line 167-169) the same way.
3. **`photos/index.html`**: same token addition to `:root`. Change `.toggle-wrap label.has-transition::after` (line 173-175) the same way.
4. **`projects/index.html`**: same token addition to `:root`. Change `.toggle-wrap label.has-transition::after` (line 173-175) the same way.
5. **`japan-trip/index.html`**: same token addition to `:root`. Change `.toggle-wrap label.has-transition::after { transition: transform 0.2s; }` (line 99) to `.toggle-wrap label.has-transition::after { transition: transform 160ms var(--ease-in-out); }`.
6. **`projects/shredders/index.html`**: same token addition to `:root`. Change line 98 the same way as step 5.
7. **`projects/ai-workflow/index.html`**: same token addition to `:root`. Change line 95 the same way as step 5.
8. **`projects/spacec/index.html`**: same token addition to `:root`. Change line 95 the same way as step 5.
9. **`exposure/index.html`**: same token addition to `:root`. Change `.toggle-wrap label.has-transition::after` (line 86) from `transition: transform 0.35s cubic-bezier(0.4,0,0.2,1), background-color 0.5s ease;` to `transition: transform 160ms var(--ease-in-out);` (drop the redundant `background-color` — it's already covered by the base `label`/`label::after` rules at lines 78-84, which are unchanged).
10. **`now/index.html`**: same token addition to `:root`. Change line 65 the same way as step 9.
11. **`ai/index.html`**: same token addition to `:root` (line 51, after `color-scheme: light dark;`). Add `transition: transform 0s;` to the base `.toggle-wrap label::after` rule (lines 117-126, currently missing it entirely). Change the selector at lines 128-130 from `.toggle-wrap.has-transition label::after { transition: transform 0.25s ease; }` to `.toggle-wrap label.has-transition::after { transition: transform 160ms var(--ease-in-out); }`.

## Boundaries

- Do NOT touch `projects/merfish/index.html` — it already has its own token and is out of scope.
- Do NOT change any markup/HTML structure in any file — CSS only (except the selector string fix in `ai/index.html`, which is a CSS selector, not markup).
- Do NOT change the toggle's dimensions, colors, or the `translateX(20px)` travel distance — only the `transition` property values and the new `:root` tokens.
- Do NOT add new dependencies or a shared CSS file — this repo's convention is per-page duplicated inline styles; keep that pattern.
- If any file's current code doesn't match the snippet shown for its step (drift since commit `5e286f6`), STOP and report instead of improvising.

## Verification

- **Mechanical**: `npm run dev`, open each of the 11 pages (index via `css/main.css`, plus the 10 listed sub-pages) and confirm no console errors on load.
- **Feel check**: on each page, toggle dark/light mode by clicking the theme toggle:
  - The knob should slide smoothly over ~160ms, not snap instantly and not take a full third-of-a-second.
  - On `ai/index.html` specifically: confirm the knob now animates at all (before this fix it silently never did — this is the one case where "no visible previous animation" is expected and the fix should make it start working).
  - Reload each page: confirm the knob does **not** animate/slide on initial paint (the `has-transition` class is added 100ms after load via `theme.js`, and the toggle's checked state is set synchronously beforehand, so there should be no visible slide on page load).
  - In DevTools Animations panel, set playback to 10% and confirm the knob's motion uses the new curve (should read as an eased slide, not linear, and not overshoot/bounce).
  - Toggle `prefers-reduced-motion` (Rendering panel) and confirm the existing reduced-motion CSS elsewhere in each file still zeroes durations (this plan doesn't touch those blocks, so they should be unaffected).
- **Done when**: all 11 files use the same `160ms var(--ease-in-out)` value for the toggle knob transition, `ai/index.html`'s toggle visibly animates on click, and no page shows a knob slide on initial page load.
