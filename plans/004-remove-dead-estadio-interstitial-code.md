# 004 — Remove the orphaned Estadio interstitial dead code from newsletter/007

- **Status**: DONE
- **Commit**: 5e286f6
- **Severity**: HIGH
- **Category**: 1 — Purpose & frequency (code hygiene; confirmed via git history, not a design tradeoff to re-litigate)
- **Estimated scope**: 1 file (`newsletter/007/index.html`), ~350 lines deleted (CSS + 2 `<script>` blocks), 0 lines of visible behavior change

## Problem

**This is confirmed dead code, not a bug to fix by restoring it.** Git history settles the intent:

- Commit `2eef821` ("Redesign 007 intro (estadio) + fix music", 2026-06-20) added a live `<div class="estadio" id="estadio">` welcome interstitial — a night-match-themed splash screen with a canvas crowd-shimmer effect.
- Commit `af3bc7f` ("007: dateline masthead intro + real→ghibli scroll dissolve", 2026-06-21) **deliberately removed** that div and replaced the opening experience with a "dateline masthead" cold-open instead. The commit itself added this comment, which is still in the file today:

```js
// newsletter/007/index.html:1810-1813 — current, and correct, do not change
// No interstitial anymore — the issue opens straight into the masthead
// (dateline cold open). Just clear any gate state so content is visible.
gate.classList.add('unlocked');
document.body.classList.add('gate-open');
```

That redesign correctly removed the HTML markup, but never cleaned up the CSS and JS that targeted it. Confirmed via grep: **no element with `id="estadio"` or `class="estadio"` exists anywhere in the current file's body.** Every one of the following is unreachable:

1. **CSS** (`newsletter/007/index.html:560-674`): ~115 lines of `.estadio*`/`.efx-*` rules, keyframes (`floodPulse`, `jumboGlow`), and a reduced-motion override block — all scoped to a class that's never applied to any element.
2. **A `<noscript>` rule** (`newsletter/007/index.html:61`): `<style>.estadio { display: none !important; }</style>` — targets nothing.
3. **One stray reduced-motion line** (`newsletter/007/index.html:988`, inside the file's real, still-used `@media (prefers-reduced-motion: reduce)` block): `.estadio-floods, .estadio-word { animation: none; }` — targets nothing, but sits inside a block that otherwise IS still needed (do not delete the whole block, just this one line).
4. **The `animateEstadio` function** (`newsletter/007/index.html:1749,1755-1808`): defined inside the still-running "welcome interstitial" IIFE, but never called — the IIFE's actual code path (line 1810-1813 above) bypasses it entirely.
5. **The entire second `<script>` block** (`newsletter/007/index.html:1816-1971`, "INTERACTIVE CROWD SHIMMER"): self-guards with `if (!stage || !canvas) return;` at line 1826, where `stage = document.getElementById('estadio')` is always `null` — 100% dead on every page load.

Net effect: ~340 lines of CSS/JS in this file do nothing, inflate its size, and — because `newsletter/007/index.html` is a plausible copy-source for future issues — risk being cargo-culted into a new issue by a future editor who doesn't realize the markup was intentionally deleted.

## Target

- The CSS block at lines 560-674 is deleted entirely (the file goes directly from the `.reveal-scale` rule to the "shared REC pulse" comment).
- Line 61 (`<noscript>` rule) is deleted entirely.
- Line 988 (`.estadio-floods, .estadio-word { animation: none; }`) is deleted from inside the real reduced-motion block; the rest of that block (lines 985-993) is unchanged.
- Inside the first `<script>` block, `var estadio = document.getElementById('estadio');` and the entire `animateEstadio` function are deleted; the "no interstitial anymore" cleanup lines remain exactly as-is.
- The second `<script>` block (the crowd-shimmer IIFE) is deleted in its entirety, including its `<script>`/`</script>` tags.

## Repo conventions to follow

- `newsletter/template.html` has its own, currently-**live** interstitial called "Komorebi" — a different feature, not affected by this plan. Do not confuse the two or touch `template.html`.
- This file uses `/* ========== SECTION NAME ========== */` comment banners to delimit CSS sections — when deleting the Estadio section, remove its banner comment too so no orphaned empty section header remains.

## Steps

1. **Delete the `<noscript>` line.** Remove line 61 entirely:
   ```html
   <noscript><style>.estadio { display: none !important; }</style></noscript>
   ```

2. **Delete the CSS block.** Remove everything from the `/* ========== WELCOME INTERSTITIAL — ESTADIO (night match) ========== */` comment (line 560) through the closing `}` of the `@media (prefers-reduced-motion: reduce)` block that immediately follows it (line 674), inclusive. The file should read directly from:
   ```css
   .reveal-scale { opacity: 0; transform: scale(0.97); }

   /* shared REC pulse used by deal-wire + featured video */
   @keyframes recPulse {
   ```
   with the entire Estadio/`.efx-*` section (floodlights, stars, canvas fx, word/romaji/noun/meaning/divider/tagline typography, dismiss button, play controls, mode-toggle buttons, and their reduced-motion overrides) removed in between.

3. **Delete the stray reduced-motion line.** In the real, still-used reduced-motion block (currently lines 984-993), remove only this line:
   ```css
   .estadio-floods, .estadio-word { animation: none; }
   ```
   Leave every other line in that block (`.reveal`/`.reveal-fade`/`.reveal-scale`, `.scroll-line`, `.dw-marquee .track`, `.dw-tag .dot, .fv-flag .dot`, `.relay-rink .rink-lane`, the blanket `*, *::before, *::after` override) untouched.

4. **Simplify the first `<script>` block.** In the "WELCOME INTERSTITIAL" script (currently lines 1745-1815), remove:
   - Line 1749: `var estadio = document.getElementById('estadio');`
   - The entire `animateEstadio` function, lines 1755-1808 (from `function animateEstadio(callback) {` through its closing `}`).

   The block should end up reading:
   ```js
   <script>
       // ==================== WELCOME INTERSTITIAL ====================
       (function() {
           var gate = document.getElementById('gate');
           if (!gate) return;

           var path = window.location.pathname.replace(/\/$/, '') || '/';
           var issueKey = 'dispatch-auth-' + path;

           // No interstitial anymore — the issue opens straight into the masthead
           // (dateline cold open). Just clear any gate state so content is visible.
           gate.classList.add('unlocked');
           document.body.classList.add('gate-open');
       })();
   </script>
   ```
   (`path` and `issueKey` are computed but unused even before this change — leave them as-is; they're out of scope for this plan, which only removes Estadio-specific dead code.)

5. **Delete the second `<script>` block entirely.** Remove the whole "INTERACTIVE CROWD SHIMMER — Estadio (night match)" block, from its opening `<script>` tag (currently line 1816) through its closing `</script>` tag (currently line 1971), inclusive.

## Boundaries

- Do NOT touch `newsletter/template.html` — its "Komorebi" interstitial is live and unrelated.
- Do NOT remove or rename `path`/`issueKey` in the first script block, or any other code outside what's explicitly listed above — this plan is a targeted dead-code removal, not a general cleanup pass.
- Do NOT touch any of the file's actual content (photos, captions, the flight map, scoreboard, crowd-meter, deal-wire, or any other live feature) — only the Estadio-scoped CSS/JS listed above.
- If, when you open the file, an element with `id="estadio"` or `class="estadio"` DOES exist somewhere in the body (meaning this plan's core premise — that the markup was removed — no longer holds), STOP and report instead of deleting the CSS/JS, since that would break a live feature.

## Verification

- **Mechanical**: `npm run dev`, open `/newsletter/007/`, confirm no console errors (in particular, no `Cannot read properties of null` — deleting the dead code should produce fewer potential null-dereference paths, not more, since the code that guarded against `estadio`/`stage` being null is gone along with the null itself).
- **Feel check**: load the page fresh (clear `sessionStorage` for the `dispatch-auth-*` key first) and confirm the page behaves exactly as it did before this change — it opens straight into the dateline masthead with no splash screen, since that was already the live behavior (this plan removes code the user could never see or interact with).
- **Done when**: `grep -in estadio newsletter/007/index.html` returns only the unrelated content references to the real "Estadio Akron" stadium in Guadalajara (photo captions, alt text, meta descriptions — e.g. "Estadio Akron" in the trip narrative) and zero CSS class names, IDs, or JS identifiers containing "estadio".
