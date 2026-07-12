# Site-Wide Playwright E2E Coverage Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the real Playwright coverage gaps this repo has today — 15 static pages with zero test coverage, no theme/i18n reload-persistence test anywhere, and no mobile-specific assertions on Locus/Japan-trip — without duplicating near-identical test files 15 times over.

**Architecture:** One parameterized smoke-test file drives all 15 static pages from a data table (title, heading, `hasThemeToggle`). A separate file covers theme/i18n persistence across reload, reusing this repo's already-proven `#langPill`/`label[for="theme-toggle"]` interaction patterns from `tests/smoke/newsletter.spec.js`. Two existing files each gain one `isMobile`-guarded test, matching the exact pattern already used in `tests/smoke/landing.spec.js`.

**Tech Stack:** Playwright (`@playwright/test`), no new dependencies.

## Global Constraints

- Every new test must genuinely fail if broken — a console-error assertion that can never fail (e.g., checking a promise that's never rejected) is worse than no test. Verify this by intentionally breaking something once during implementation (see Task 1's explicit verification step), then reverting.
- No test touches a paid/write-side API. Nothing in this plan's scope needs it.
- `/admin/`, `dist/`, and `/brock/valentine/` are explicitly out of scope (see spec §2) — do not add tests for them.
- `/brock/` has **no** `#theme-toggle` (verified via `grep`, not assumed) — its row in the data table must set `hasThemeToggle: false`.
- Run all new/modified tests with `PW_BASE_URL=http://localhost:8080` and `npm run dev` running in the background (this repo's documented local-test convention — the default `baseURL` is production). Kill any `npm run dev`/`http-server` process you started (`pkill -f http-server` or equivalent) before finishing your task — each task's steps start their own background server, and a leftover process from an earlier task will hold port 8080 and cause the next one to fail confusingly.
- Match this repo's existing test-file conventions exactly (same `test.describe` structure, same locator style) rather than introducing new patterns.

---

### Task 1: Parameterized static-page smoke test

**Files:**
- Create: `tests/smoke/site-pages.spec.js`

**Interfaces:**
- Produces: no exports — a self-contained parameterized test file, one `test()` per page driven by a `PAGES` array.

- [ ] **Step 1: Write the test file**

Create `tests/smoke/site-pages.spec.js`:

```javascript
const { test, expect } = require('@playwright/test');

// title/heading verified directly against each page's <title> and <h1> at
// the time this test was written (2026-07-12) — re-verify if either
// changes. hasThemeToggle is false only for /brock/ (dark-only palette,
// no #theme-toggle checkbox at all — confirmed via grep, not assumed).
const PAGES = [
    { path: '/', title: 'Kevin Lee', hasThemeToggle: true },
    { path: '/resume/', title: 'Resume — Kevin Lee', hasThemeToggle: true },
    { path: '/ai/', title: 'Ask Kevin — Kevin Lee', hasThemeToggle: true },
    { path: '/photos/', title: 'Photos — Kevin Lee', hasThemeToggle: true },
    { path: '/exposure/', title: 'The Exposure Triangle — Kevin Lee', hasThemeToggle: true },
    { path: '/film/', title: 'Film — Kevin Lee', hasThemeToggle: true },
    { path: '/now/', title: 'Now — Kevin Lee', hasThemeToggle: true },
    { path: '/privacy/', title: 'Privacy Policy — Kevin Lee', hasThemeToggle: true },
    { path: '/terms/', title: 'Terms of Service — Kevin Lee', hasThemeToggle: true },
    { path: '/workflow/', title: 'The Agent Graph — Kevin Lee', hasThemeToggle: true },
    { path: '/brock/', title: 'Brock — A Year in the Life | Kevin Lee', hasThemeToggle: false },
    { path: '/projects/ai-workflow/', title: 'AI Development Workflow — Kevin Lee', hasThemeToggle: true },
    { path: '/projects/merfish/', title: 'MERFISH — Kevin Lee', hasThemeToggle: true },
    { path: '/projects/shredders/', title: 'Shredders — Kevin Lee', hasThemeToggle: true },
    { path: '/projects/spacec/', title: 'SPACEc — Kevin Lee', hasThemeToggle: true },
];

test.describe('Site-wide static page smoke checks', () => {
    for (const p of PAGES) {
        test(`${p.path} loads cleanly with no console errors`, async ({ page }) => {
            const pageErrors = [];
            const consoleErrors = [];
            page.on('pageerror', (err) => pageErrors.push(err.message));
            page.on('console', (msg) => {
                if (msg.type() === 'error') consoleErrors.push(msg.text());
            });

            const response = await page.goto(p.path);
            expect(response.status()).toBeLessThan(400);
            await expect(page).toHaveTitle(p.title);
            await expect(page.locator('h1').first()).toBeVisible();

            if (p.hasThemeToggle) {
                await expect(page.locator('#theme-toggle')).toBeAttached();
            } else {
                await expect(page.locator('#theme-toggle')).toHaveCount(0);
            }

            expect(pageErrors, `uncaught page errors on ${p.path}`).toEqual([]);
            expect(consoleErrors, `console.error calls on ${p.path}`).toEqual([]);
        });
    }
});
```

- [ ] **Step 2: Verify the console-error assertion is real, not a tautology**

This step exists because a console-error check that can never fail is worse
than no test at all — verify it actually catches a real error before
trusting it.

Temporarily edit `index.html` to add `<script>nonExistentFunction();</script>`
right before the closing `</body>` tag. Run:

```bash
npm run dev &
sleep 2
PW_BASE_URL=http://localhost:8080 npx playwright test tests/smoke/site-pages.spec.js --project=desktop -g "^/ loads"
```

Expected: FAIL — the test for `/` fails with a message showing
`nonExistentFunction is not defined` in the `pageErrors` array.

Revert the temporary `index.html` edit (remove the script tag you added —
use `git diff index.html` to confirm it's back to the original before
continuing).

- [ ] **Step 3: Run the full file to verify it passes against the real site**

```bash
npm run dev &
sleep 2
PW_BASE_URL=http://localhost:8080 npx playwright test tests/smoke/site-pages.spec.js --project=desktop
```

Expected: PASS (15/15 tests, one per page).

- [ ] **Step 4: Commit**

```bash
git add tests/smoke/site-pages.spec.js
git commit -m "Add smoke coverage for 15 previously-untested static pages"
```

---

### Task 2: Theme + i18n reload-persistence tests

**Files:**
- Create: `tests/smoke/persistence.spec.js`

**Interfaces:**
- Consumes: `#theme-toggle`/`label[for="theme-toggle"]` and `#langPill` — the exact same locators already proven working in `tests/smoke/newsletter.spec.js`'s `'theme toggle updates data-theme'` and `'language toggle switches visible copy'` tests. Read that file first (`tests/smoke/newsletter.spec.js`) to copy its exact click sequence rather than reinventing one.

- [ ] **Step 1: Write the test file**

Create `tests/smoke/persistence.spec.js`:

```javascript
const { test, expect } = require('@playwright/test');

test.describe('Theme and language persist across reload', () => {
    test('theme choice survives a reload on the homepage', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('html')).toHaveAttribute('data-theme', /^(light|dark)$/);
        const before = await page.locator('html').getAttribute('data-theme');

        await page.locator('label[for="theme-toggle"]').click();
        await expect(page.locator('html')).not.toHaveAttribute('data-theme', before);
        const after = await page.locator('html').getAttribute('data-theme');

        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('data-theme', after);
    });

    test('language choice survives a reload on the newsletter index', async ({ page }) => {
        await page.goto('/newsletter/');
        await page.locator('#langPill').click();
        await expect(page.locator('html')).toHaveAttribute('data-lang', 'ko');

        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('data-lang', 'ko');
    });
});
```

- [ ] **Step 2: Run to verify it fails against today's code**

This is a genuine RED step, not a formality — this repo's existing tests
check that theme/language toggles *work*, but nothing today checks they
*survive a reload*. If `js/theme.js`/`js/i18n.js` correctly read from
`localStorage` on load (which they should, per this repo's design), these
tests may pass immediately rather than fail — if so, that's fine and
expected; note it in your report rather than treating it as a problem
(this task is closing a *test* gap, not necessarily fixing a *behavior*
bug).

```bash
npm run dev &
sleep 2
PW_BASE_URL=http://localhost:8080 npx playwright test tests/smoke/persistence.spec.js --project=desktop
```

- [ ] **Step 3: If either test fails, diagnose the actual cause before touching test code**

If a test fails, read `js/theme.js` and `js/i18n.js`'s `localStorage`
read-on-load logic (search for `localStorage.getItem('theme')` and
`localStorage.getItem('lang')`) to determine whether the bug is in the
test's assumptions (e.g., wrong locator, wrong expected value) or a real
site bug. Do not loosen an assertion to make a real bug pass silently — if
you find a genuine site bug, report it via `DONE_WITH_CONCERNS` rather than
patching around it; a fix is out of scope for this test-only task.

- [ ] **Step 4: Verify it passes**

Same command as Step 2. Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add tests/smoke/persistence.spec.js
git commit -m "Add theme/language reload-persistence tests"
```

---

### Task 3: Mobile-specific assertion for Locus

**Files:**
- Modify: `tests/smoke/locus.spec.js`

**Interfaces:**
- Consumes: the `isMobile` fixture, matching the exact pattern in `tests/smoke/landing.spec.js`'s `'no horizontal scroll on mobile'` test (`async ({ page, isMobile }) => { if (!isMobile) return; ... }`) — read that test first to match its style exactly.

- [ ] **Step 1: Read the existing file's conventions**

Read `tests/smoke/locus.spec.js` in full to find its `test.describe` block and existing mocking helpers, so the new test fits the file's established style.

- [ ] **Step 2: Add the test**

Add this test inside the existing `test.describe` block in `tests/smoke/locus.spec.js`:

```javascript
test('no horizontal scroll on mobile', async ({ page, isMobile }) => {
    if (!isMobile) return;
    await page.goto('/projects/locus/');
    const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
});
```

- [ ] **Step 3: Run against both projects to confirm it's mobile-scoped correctly**

```bash
npm run dev &
sleep 2
PW_BASE_URL=http://localhost:8080 npx playwright test tests/smoke/locus.spec.js --project=desktop
PW_BASE_URL=http://localhost:8080 npx playwright test tests/smoke/locus.spec.js --project=mobile
```

Expected: desktop run shows this test passing trivially (early return, `if
(!isMobile) return` — Playwright still reports it as passed, just a no-op);
mobile run actually exercises the `scrollWidth`/`innerWidth` check and
passes.

- [ ] **Step 4: Commit**

```bash
git add tests/smoke/locus.spec.js
git commit -m "Add mobile no-overflow assertion to Locus smoke tests"
```

---

### Task 4: Mobile-specific assertion for Japan Trip page

**Files:**
- Modify: `tests/smoke/japan-trip.spec.js`

**Interfaces:**
- Consumes: same `isMobile` pattern as Task 3.

- [ ] **Step 1: Read the existing file's conventions**

Read `tests/smoke/japan-trip.spec.js` in full to find its `test.describe` block.

- [ ] **Step 2: Add the test**

Add this test inside the existing `test.describe` block in `tests/smoke/japan-trip.spec.js`:

```javascript
test('no horizontal scroll on mobile', async ({ page, isMobile }) => {
    if (!isMobile) return;
    await page.goto('/japan-trip/');
    const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
});
```

- [ ] **Step 3: Run against both projects**

```bash
npm run dev &
sleep 2
PW_BASE_URL=http://localhost:8080 npx playwright test tests/smoke/japan-trip.spec.js --project=desktop
PW_BASE_URL=http://localhost:8080 npx playwright test tests/smoke/japan-trip.spec.js --project=mobile
```

Expected: PASS on both.

- [ ] **Step 4: Commit**

```bash
git add tests/smoke/japan-trip.spec.js
git commit -m "Add mobile no-overflow assertion to Japan Trip smoke tests"
```

---

## Final verification (whole-plan)

```bash
npm run dev &
sleep 2
PW_BASE_URL=http://localhost:8080 npx playwright test --project=desktop
PW_BASE_URL=http://localhost:8080 npx playwright test --project=mobile
```

Expected: all tests pass on both projects, including the new
`site-pages.spec.js`, `persistence.spec.js`, and the two modified files,
with zero regressions to any pre-existing test.
