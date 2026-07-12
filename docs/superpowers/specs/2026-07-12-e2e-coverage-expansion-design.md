# Site-Wide Playwright E2E Coverage Expansion

**Date:** 2026-07-12
**Status:** Draft, pending spec review
**Context:** Kevin asked for "extensive Playwright" E2E coverage and for the
result to "feel like how Anthropic does things." A fan15 research pass
(2026-07-11) audited this repo's actual test coverage and found real,
specific gaps; a separate sub-question researched what Anthropic's own
public engineering writing actually says (as opposed to a vague brand
impression), so this spec grounds both asks in evidence rather than guesses.

## 0. What "feels like Anthropic" concretely means here

Anthropic's own engineering blog (quoted directly, not inferred) gives four
checkable principles, applied to this work specifically:

1. *"If you can't verify it, don't ship it"* — every test added in this plan
   gets run and its output read, not just written and assumed passing.
2. Root-cause fixes over symptom patches — matches this session's own
   precedent (the `playwright.config.js` `testMatch` fix, the chip
   race-condition fix): a failing test gets diagnosed, not loosened.
3. Simplicity in design — one parameterized test file covering 15
   structurally-similar static pages beats 15 near-duplicate files.
4. Transparency about limits — the closing report states plainly what is
   and isn't covered (§6 names an explicit exclusion), rather than a vague
   "comprehensive" claim papering over a real gap.

## 1. Scope — what's covered

**Static/content pages** (one parameterized spec, not one file each): `/`,
`/resume/`, `/ai/`, `/photos/`, `/exposure/`, `/film/`, `/now/`,
`/privacy/`, `/terms/`, `/workflow/`, `/brock/`, `/projects/merfish/`,
`/projects/shredders/`, `/projects/spacec/` — **14 pages** (see §2 for why
`/projects/ai-workflow/` isn't among them, a fact discovered during
implementation, not known when this section was first drafted). For each:
loads with a 200, exact `<title>` text matches, an `<h1>` (or equivalent
heading) is visible, and no uncaught console/page errors fire during load —
a cheap, high-signal regression catcher this repo doesn't have anywhere
today. The theme-toggle checkbox is asserted present for 13 of the 14 —
verified directly (not assumed from CLAUDE.md's general claim) that
`/brock/` has **no** `#theme-toggle` at all, since it's dark-only with its
own palette (CLAUDE.md, confirmed via `grep -c 'id="theme-toggle"'` across
all candidate pages before writing this spec). The parameterized test's
data table carries a per-page `hasThemeToggle` flag rather than assuming
it's universal.

**Cross-cutting persistence** (new dedicated spec, not per-page): theme
choice (dark/light) survives a page reload; language choice (i18n) survives
a page reload. Tested against 2 representative pages (one i18n-enabled, one
not), not all 15 — redundant beyond that, since the mechanism
(`localStorage` read in `js/theme.js`/`js/i18n.js`) is shared code, not
per-page logic.

**Mobile-specific assertions** (extend 2 existing files, not new files):
`tests/smoke/locus.spec.js` and `tests/smoke/japan-trip.spec.js` each get
one test guarded to the `mobile` project only (matching the existing
`isMobile` pattern already used in `tests/smoke/landing.spec.js`), checking
no horizontal overflow and that key interactive elements remain usable at
the `iPhone 14` viewport.

## 2. Explicitly out of scope (named, not silently skipped)

- **`/projects/ai-workflow/`** — discovered during implementation (Task 1)
  to be an untracked, never-committed page (`git ls-files` returns nothing
  for it) that 404s in production, despite being linked twice from the
  already-committed, live `projects/index.html`. Excluded from the test
  data rather than asserting against a page that could vanish or change at
  any moment, and rather than treating an undeployed draft as if it were
  shipped. This is a real, separate, pre-existing bug (a dead "Read the
  case study →" link on the live site) surfaced to Kevin outside this
  plan's scope — fixing it (either shipping the page or removing the link)
  is not a testing task.
- **`/admin/`** — Supabase-auth-gated internal tool, not part of the public
  design system (CLAUDE.md: "Not part of the main design system"). Testing
  it would require mocking a real auth provider disproportionate to its
  value as an internal-only surface. Flagged here rather than silently
  omitted, per §0's transparency principle.
- **`dist/`** — an untracked build-artifact directory present in the
  working tree, not a real source page (this repo has no build step per
  CLAUDE.md). Not touched.
- **`/brock/valentine/`** — a standalone novelty sub-page inside an already-
  standalone novelty page ("outside the design system entirely" per
  CLAUDE.md). `/brock/` itself gets a basic smoke check; its `valentine/`
  sub-path does not, since it's a one-off personal gift page, not a
  portfolio surface.
- **Deep interaction testing for content-only pages** — resume/photos/etc.
  get load-and-render checks, not exhaustive interaction tests, since
  they're static content, not tools (unlike Locus/Japan-trip's comment
  widget/search box, which already have real interaction tests).

## 3. File structure

- `tests/smoke/site-pages.spec.js` (new) — parameterized loop over the 15
  static pages in §1, one shared set of assertions per page via a data
  array, not 15 hand-written near-duplicate tests.
- `tests/smoke/persistence.spec.js` (new) — theme + i18n reload-persistence,
  2 pages.
- `tests/smoke/locus.spec.js` (modify) — add 1 mobile-viewport test.
- `tests/smoke/japan-trip.spec.js` (modify) — add 1 mobile-viewport test.

No changes to `playwright.config.js` — the existing `testMatch:
/(smoke|cli|unit)\/.*\.spec\.js/` pattern already picks up new files under
`tests/smoke/` automatically.

## 4. Testing philosophy (applies to this plan's own tests)

- Every new test runs against `PW_BASE_URL=http://localhost:8080` (this
  repo's documented local-run convention) during development, and gets
  spot-checked against production after ship, matching this session's
  established practice for every prior feature.
- No test touches a paid or write-side API (nothing in this plan's scope
  does — it's all static-page/localStorage checks).
- Console/page-error assertions must be real (i.e., must actually fail if a
  page throws) — verified during implementation by temporarily introducing
  a real JS error on one page, confirming the test catches it, then
  reverting (the plan's tasks specify this as an explicit verification
  step, not just "add the assertion and trust it").

## 5. Acceptance

- All 15 static pages in §1 have a passing load/heading/theme-toggle/
  no-console-error test.
- Theme and i18n persistence across reload is verified on at least 2 pages.
- Locus and Japan-trip each have one real mobile-viewport-specific
  assertion beyond "the mobile project happens to also run this file."
- The admin panel exclusion is documented, not silently absent.
- Full suite (`npx playwright test --project=desktop` and `--project=mobile`
  against `PW_BASE_URL=http://localhost:8080`) passes with zero regressions
  to any existing test.
