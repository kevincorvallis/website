# 003 — Guard the theme toggle's View Transition behind prefers-reduced-motion

- **Status**: DONE
- **Commit**: 5e286f6
- **Severity**: HIGH
- **Category**: 6 — Accessibility
- **Estimated scope**: 1 file, ~5 lines

## Problem

```js
// js/theme.js:13-24 — current
toggle.addEventListener('change', () => {
    const next = toggle.checked ? 'dark' : 'light';
    const apply = () => {
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    };
    if (document.startViewTransition) {
        document.startViewTransition(apply);
    } else {
        apply();
    }
});
```

`document.startViewTransition` is called with no `prefers-reduced-motion` check anywhere in this file. This fires every time any user toggles dark/light mode, on every page of the site (this script is loaded sitewide). The View Transitions API's default behavior is to cross-fade the entire page — movement/animation that a reduced-motion user has explicitly opted out of.

This isn't covered by the blanket CSS override elsewhere in the repo (`css/main.css:326-330`, which forces `animation-duration`/`transition-duration` to `0.01ms` via `*, *::before, *::after`): the View Transition API's default cross-fade runs as a UA-generated pseudo-element animation (`::view-transition-old(root)` / `::view-transition-new(root)`), which that blanket selector does not reach unless explicitly targeted. Confirmed no such rule exists anywhere in `css/main.css`.

Contrast with the rest of the file: the `prefers-color-scheme` listener at `js/theme.js:26-32` correctly reacts live to a `matchMedia` change — this file already knows the pattern, it's just not applied to motion preference.

## Target

```js
// js/theme.js:13-24 — target
toggle.addEventListener('change', () => {
    const next = toggle.checked ? 'dark' : 'light';
    const apply = () => {
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    };
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !reduceMotion) {
        document.startViewTransition(apply);
    } else {
        apply();
    }
});
```

Per AUDIT.md's Category 6 guidance ("reduced motion means fewer and gentler animations, not zero"), this is the correct level of intervention: the color-scheme *change itself* still applies instantly (via `apply()`), only the cross-fade transition is skipped. No comprehension-aiding feedback is lost — the theme still visibly changes, just without the animated wipe.

## Repo conventions to follow

- `js/theme.js:26-32` is the exemplar for reading `matchMedia` in this file — follow its style (a `const` holding `.matches`, checked once per event, not cached at module scope) rather than introducing a persistent flag that could go stale if the OS setting changes mid-session.

## Steps

1. Open `js/theme.js`. Inside the `toggle.addEventListener('change', ...)` callback (lines 13-24), after the `apply` function definition and before the `if (document.startViewTransition)` check, add: `const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;`
2. Change the condition on the `if` statement from `if (document.startViewTransition) {` to `if (document.startViewTransition && !reduceMotion) {`.

## Boundaries

- Do NOT change the `prefers-color-scheme` listener (lines 26-32) — it's unrelated and already correct.
- Do NOT add a `matchMedia('...').addEventListener('change', ...)` for reduced-motion in this file — the check only needs to happen at toggle-time (when the user clicks), not reactively, since `startViewTransition` is only ever invoked from this one event handler.
- Do NOT touch any CSS files — this is a JS-only fix.
- If the code at `js/theme.js:13-24` doesn't match what's shown above (drift since commit `5e286f6`), STOP and report instead of improvising.

## Verification

- **Mechanical**: `npm run dev`, open any page, open the browser console, confirm no errors when toggling the theme.
- **Feel check**:
  - With no reduced-motion preference set: toggle the theme and confirm the existing cross-fade/wipe behavior is unchanged (this fix should be invisible in the default case).
  - Toggle `prefers-reduced-motion` to `reduce` (DevTools Rendering panel → "Emulate CSS media feature prefers-reduced-motion"), then toggle the theme: confirm the page switches theme **instantly**, with no cross-fade/wipe animation at all.
  - Confirm `localStorage.getItem('theme')` still updates correctly in both cases (the `apply()` function itself is unchanged).
- **Done when**: toggling the theme with reduced-motion enabled produces an instant theme switch with no View Transition animation, and toggling with no preference set produces the original animated behavior unchanged.
