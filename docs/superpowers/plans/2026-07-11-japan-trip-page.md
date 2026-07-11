# Japan Trip Itinerary Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new page at `/japan-trip/` presenting Kevin's real October 2026 Japan
itinerary in a fun, personal register, with a working comments widget for friends, and
add a nav entry to it from the homepage.

**Architecture:** One new static HTML file (`japan-trip/index.html`) following the
site's existing sub-page convention (inline `<style>`, no build step, no framework).
Reuses the existing `dispatch_comments` table / `/api/comments.js` serverless endpoint
under a new namespaced issue slug. A small, backward-compatible honeypot addition to
`api/comments.js`. A new "Travel" section + 3 new i18n keys on the homepage.

**Tech Stack:** Vanilla HTML/CSS/JS, Vercel serverless functions (Node, `api/*.js`),
Supabase (Postgres via PostgREST, service-role key only), Playwright for smoke tests.

## Global Constraints

- No build step, no framework, no npm dependency additions — this repo ships plain
  HTML/CSS/JS (see project `CLAUDE.md`).
- Sub-pages inline their own `<style>` block; only root `index.html` uses shared
  `css/main.css`.
- Every page loads `/js/i18n.js` then `/js/theme.js` at the end of `<body>`, and
  requires a `#theme-toggle` checkbox inside a `.toggle-wrap` in its `<header>`.
- `japan-trip/index.html` itself is **English-only** content — no `data-i18n`
  attributes inside its `<main>`. Only the new homepage nav section gets real
  `data-i18n` keys (translated pages must stay in sync across `fr.json`/`ko.json`/
  `ja.json` — `en.json` is dead code, never fetched by `js/i18n.js`, so skip it).
- Respect `prefers-reduced-motion: reduce` for every new animation/transition —
  default state must be the *final, fully-visible* state; motion only adds a
  transition on top for visitors who allow it (this is the exact bug class the
  `/gauntlet` review flagged and required fixing).
- No new Supabase migration. No changes to any file under `newsletter/`.
- All new external links (Google Maps, image credit links) get `target="_blank"
  rel="noopener"`.
- Google Maps deep links: `https://www.google.com/maps/search/?api=1&query=` +
  `encodeURIComponent(placeName)` — never string-concatenate an unencoded place name.
- Full itinerary source-of-truth (do not invent different facts) is
  `docs/superpowers/specs/2026-07-11-japan-trip-page-design.md`.

---

### Task 1: Backend — honeypot support in `api/comments.js`

**Files:**
- Modify: `api/comments.js`
- Test: `tests/smoke/api.spec.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `POST /api/comments` now accepts two additional optional body fields,
  `website` (string, honeypot) and `elapsed` (number, ms since page load). Existing
  callers that omit both fields behave exactly as before — this is what later tasks
  (Task 7's comment form) will send.

- [ ] **Step 1: Write the failing test**

**Important — read before writing this test:** `playwright.config.js` defaults
`baseURL` to `https://klee.page` (production) unless `PW_BASE_URL` is set — there is
no local server that executes `api/*.js` (the `npm run dev` static server can't run
Vercel functions, and there's no separate test Supabase database). So these tests run
as real HTTP calls against the real production API and real production database. All
three tests below MUST use the single reserved issue slug `zz-smoke-test` (never a
per-test slug) — it's a synthetic namespace no real page ever queries, so any row that
does get written is inert, invisible junk rather than something a real visitor could
ever see. Never use a real/shared issue slug (e.g. `trip-japan-oct`) in an automated
test that might persist a row.

Add to `tests/smoke/api.spec.js` (append inside the existing `test.describe('API
routes', ...)` block, after the `subscribe API rejects invalid email` test):

```javascript
    test('comments API silently accepts a legacy POST with no honeypot fields', async ({ request }) => {
        const res = await request.post('/api/comments', {
            data: { issue: 'zz-smoke-test', name: 'Smoke Test', comment: 'legacy client, no honeypot fields sent' },
            headers: { 'Content-Type': 'application/json' },
        });
        expect(res.status()).toBe(200);
    });

    test('comments API silently drops a submission with a filled honeypot', async ({ request }) => {
        const before = await (await request.get('/api/comments?issue=zz-smoke-test')).json();
        const res = await request.post('/api/comments', {
            data: { issue: 'zz-smoke-test', name: 'Bot', comment: 'spam via honeypot', website: 'http://spam.example', elapsed: 5000 },
            headers: { 'Content-Type': 'application/json' },
        });
        // Bot gate returns 200 (don't teach bots which check failed) but must not persist the row.
        expect(res.status()).toBe(200);
        const after = await (await request.get('/api/comments?issue=zz-smoke-test')).json();
        expect(after.length).toBe(before.length);
    });

    test('comments API silently drops a submission that arrives too fast', async ({ request }) => {
        const before = await (await request.get('/api/comments?issue=zz-smoke-test')).json();
        const res = await request.post('/api/comments', {
            data: { issue: 'zz-smoke-test', name: 'Bot', comment: 'spam via elapsed', elapsed: 400 },
            headers: { 'Content-Type': 'application/json' },
        });
        expect(res.status()).toBe(200);
        const after = await (await request.get('/api/comments?issue=zz-smoke-test')).json();
        expect(after.length).toBe(before.length);
    });
```

Note: the first test intentionally does not assert on persistence (it only confirms
the legacy shape doesn't get rejected) since `zz-smoke-test` accumulates rows across
CI runs over time — that's expected and harmless (nothing renders it), not a bug to fix.
The two bot-gate tests compare a before/after count instead of asserting `length === 0`
for the same reason (earlier runs may have already left legitimate rows there).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/smoke/api.spec.js -g "honeypot|too fast" --project=chromium`
Expected: FAIL — the two bot-gate tests fail because `api/comments.js` currently has no
honeypot/elapsed check, so both spam rows get persisted (list length is 1, not 0).

- [ ] **Step 3: Write minimal implementation**

Edit `api/comments.js`. Replace the POST handler's destructuring line and add the bot
gate right after the existing field-validation block, before the `row` object is built:

Find this block (the current POST handler):

```javascript
        const { issue, name, comment } = req.body || {};

        if (!issue || typeof issue !== 'string' || !/^[a-zA-Z0-9-]+$/.test(issue) || issue.length > 20) {
            return res.status(400).json({ error: 'Valid issue required' });
        }
        if (!name || typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 100) {
            return res.status(400).json({ error: 'Valid name required' });
        }
        if (!comment || typeof comment !== 'string' || comment.trim().length === 0 || comment.trim().length > 2000) {
            return res.status(400).json({ error: 'Valid comment required' });
        }

        const row = {
            issue: issue.trim(),
            name: name.trim(),
            comment: comment.trim(),
            ip,
        };
```

Replace it with:

```javascript
        const { issue, name, comment, website, elapsed } = req.body || {};

        if (!issue || typeof issue !== 'string' || !/^[a-zA-Z0-9-]+$/.test(issue) || issue.length > 20) {
            return res.status(400).json({ error: 'Valid issue required' });
        }
        if (!name || typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 100) {
            return res.status(400).json({ error: 'Valid name required' });
        }
        if (!comment || typeof comment !== 'string' || comment.trim().length === 0 || comment.trim().length > 2000) {
            return res.status(400).json({ error: 'Valid comment required' });
        }

        // Bot gate: both fields are optional so existing callers (newsletter issue
        // pages) that don't send them are unaffected. Only enforced when a caller
        // does send them. Silent 200 — don't teach bots which check failed.
        if (website || (typeof elapsed === 'number' && elapsed >= 0 && elapsed < 1500)) {
            console.warn('COMMENTS_BOT_DROP', issue, website ? 'honeypot' : 'elapsed', elapsed);
            return res.status(200).json({ ok: true });
        }

        const row = {
            issue: issue.trim(),
            name: name.trim(),
            comment: comment.trim(),
            ip,
        };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/smoke/api.spec.js --project=chromium`
Expected: PASS (all tests in the file, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add api/comments.js tests/smoke/api.spec.js
git commit -m "Add optional honeypot gate to comments API"
```

---

### Task 2: Homepage nav — "Travel" section + i18n keys

**Files:**
- Modify: `index.html`
- Modify: `i18n/fr.json`, `i18n/ko.json`, `i18n/ja.json`

**Interfaces:**
- Consumes: nothing.
- Produces: a live link from `index.html` to `/japan-trip` that Task 3+ will make
  resolve to real content.

- [ ] **Step 1: Add the section to `index.html`**

Insert a new `<section>` immediately before the existing "Dispatch" section (find this
exact block in `index.html`):

```html
            <section>
                <h2 data-i18n="index.dispatchHeading">Dispatch</h2>
```

Insert directly above it:

```html
            <section>
                <h2 data-i18n="index.travelHeading">Travel</h2>
                <p data-i18n="index.travelSubtitle">Where I'm headed next.</p>
                <p><a href="/japan-trip" data-i18n="index.travelLink">See the itinerary</a></p>
            </section>

```

- [ ] **Step 2: Add French translations**

In `i18n/fr.json`, find the `"index"` object's closing keys (it ends with
`"dispatchLink": "Lire la dernière"` followed by `},`). Insert the three new keys
right before `"dispatchHeading"`:

```json
    "travelHeading": "Voyage",
    "travelSubtitle": "Ma prochaine destination.",
    "travelLink": "Voir l'itinéraire",
```

- [ ] **Step 3: Add Korean translations**

In `i18n/ko.json`, in the `"index"` object, insert before `"dispatchHeading"`:

```json
    "travelHeading": "여행",
    "travelSubtitle": "다음 목적지.",
    "travelLink": "일정 보기",
```

- [ ] **Step 4: Add Japanese translations**

In `i18n/ja.json`, in the `"index"` object, insert before `"dispatchHeading"`:

```json
    "travelHeading": "旅行",
    "travelSubtitle": "次の行き先。",
    "travelLink": "旅程を見る",
```

- [ ] **Step 5: Validate JSON syntax**

Run: `node -e "JSON.parse(require('fs').readFileSync('i18n/fr.json')); JSON.parse(require('fs').readFileSync('i18n/ko.json')); JSON.parse(require('fs').readFileSync('i18n/ja.json')); console.log('OK')"`
Expected output: `OK`

- [ ] **Step 6: Manually verify in the browser**

Run: `npm run dev`, open `http://localhost:8080/`, confirm the new "Travel" section
appears above "Dispatch" with a working (404 for now, until Task 3+ ships) link to
`/japan-trip`. Toggle the language switcher to FR/KO/JA and confirm the new section's
heading/subtitle/link text translate correctly.

- [ ] **Step 7: Commit**

```bash
git add index.html i18n/fr.json i18n/ko.json i18n/ja.json
git commit -m "Add Travel nav section linking to /japan-trip"
```

---

### Task 3: Page shell + hero section

**Files:**
- Create: `japan-trip/index.html`

**Interfaces:**
- Consumes: `js/theme.js`, `js/i18n.js` (loaded exactly as every other sub-page does).
- Produces: the file other tasks append to. Contains HTML comment anchors
  `<!-- DAY-BY-DAY -->`, `<!-- ROUTE MAP -->`, `<!-- HIGHLIGHTS -->`,
  `<!-- COMMENTS -->` that later tasks insert content directly after.

- [ ] **Step 1: Create `japan-trip/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>The Wakayama Hotfix — Kevin Lee</title>
    <meta name="description" content="Kevin's October 2026 trip itinerary through Wakayama, Shirahama, and Kushimoto — leave a comment.">

    <!-- Open Graph -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://klee.page/japan-trip">
    <meta property="og:title" content="The Wakayama Hotfix">
    <meta property="og:description" content="Four days, three onsen soaks, one itinerary now open for peer review.">

    <!-- Favicon -->
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🗾</text></svg>">

    <!-- Prevent flash of wrong theme -->
    <script>
        (function() {
            const stored = localStorage.getItem('theme');
            const systemPreference = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', stored || systemPreference);
        })();
    </script>

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600&display=swap" rel="stylesheet">

    <style>
        *, *::before, *::after {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        :root {
            --bg: #f0eee6;
            --text: #1f1e1d;
            --tag-bg: rgba(31, 30, 29, 0.08);
            --card-border: rgba(31, 30, 29, 0.12);
            --accent: #b5502f;
            --font: 'Newsreader', Georgia, 'Times New Roman', serif;
            --mono: 'SF Mono', 'Menlo', 'Consolas', monospace;
            color-scheme: light dark;
        }

        [data-theme="dark"] {
            --bg: #1f1e1d;
            --text: #f0eee6;
            --tag-bg: rgba(240, 238, 230, 0.1);
            --card-border: rgba(240, 238, 230, 0.16);
            --accent: #e08462;
        }

        html {
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }

        body {
            font-family: var(--font);
            background: var(--bg);
            color: var(--text);
            font-size: 19px;
            line-height: 1.6;
            transition: color 0.3s ease, background-color 0.3s ease;
        }

        a { color: var(--text); text-decoration: underline; text-underline-offset: 2px; transition: color 0.3s ease; }
        a:hover { opacity: 0.6; }
        a:focus-visible, button:focus-visible { outline: 2px solid var(--text); outline-offset: 3px; border-radius: 2px; }

        header {
            max-width: 800px;
            margin: 0 auto;
            padding: 15px 20px 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .back-link { font-size: 15px; text-decoration: none; opacity: 0.65; transition: opacity 0.2s ease; }
        .back-link:hover { opacity: 0.85; }

        .toggle-wrap { display: flex; align-items: center; }
        .toggle-wrap input {
            position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
            overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
        }
        .toggle-wrap input:focus-visible + label { outline: 2px solid var(--text); outline-offset: 3px; border-radius: 10px; }
        .toggle-wrap label { position: relative; display: block; width: 40px; height: 20px; background: var(--text); border-radius: 10px; cursor: pointer; }
        .toggle-wrap label::after {
            content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
            background: var(--bg); border-radius: 50%; transition: transform 0s;
        }
        .toggle-wrap label.has-transition::after { transition: transform 0.2s; }
        .toggle-wrap input:checked + label::after { transform: translateX(20px); }

        main { max-width: 800px; margin: 0 auto; padding: 0 20px; }

        /* ——— Hero ——— */
        .hero { margin-top: 2rem; margin-bottom: 3rem; }
        .hero-title { font-size: 42px; font-weight: 600; line-height: 1.1; margin-bottom: 0.5rem; }
        .hero-tagline { font-size: 19px; opacity: 0.7; margin-bottom: 1.5rem; }
        .hero-blurb { font-size: 18px; line-height: 1.6; max-width: 640px; margin-bottom: 1.75rem; }

        .stat-block {
            font-family: var(--mono);
            font-size: 14px;
            opacity: 0.75;
            padding: 0.85rem 1rem;
            border: 1px solid var(--card-border);
            border-radius: 8px;
            display: inline-block;
            margin-bottom: 1rem;
        }

        .countdown {
            font-family: var(--mono);
            font-size: 14px;
            opacity: 0.6;
        }

        h2 { font-size: 26px; font-weight: 600; line-height: 1.2; margin-bottom: 1.25rem; }

        .card {
            border: 1px solid var(--card-border);
            border-radius: 10px;
            padding: 1.25rem 1.5rem;
            margin-bottom: 1.25rem;
        }

        .card-eyebrow {
            font-family: var(--mono);
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--accent);
            margin-bottom: 0.4rem;
        }

        .card-title { font-size: 21px; font-weight: 600; margin-bottom: 0.5rem; }
        .card-caption { font-size: 17px; opacity: 0.85; margin-bottom: 0.75rem; line-height: 1.5; }
        .card-detail { font-size: 15px; opacity: 0.65; line-height: 1.55; }
        .card-map-link { font-size: 14px; display: inline-block; margin-top: 0.6rem; }

        .separator { border: none; border-top: 1px solid var(--card-border); margin: 2.5rem 0; }

        footer { max-width: 800px; margin: 0 auto; padding: 3rem 20px 2rem; }
        footer p { font-size: 14px; opacity: 0.6; }

        .sr-only {
            position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
            overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
        }
        .skip-link {
            position: absolute; top: -40px; left: 0; padding: 8px 16px;
            background: var(--text); color: var(--bg); z-index: 100;
            font-size: 14px; text-decoration: none; transition: top 0.2s ease;
        }
        .skip-link:focus { top: 0; }

        @media (max-width: 768px) {
            body { font-size: 17px; }
            .hero-title { font-size: 30px; }
            h2 { font-size: 22px; }
        }

        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after {
                animation-duration: 0.01ms !important;
                transition-duration: 0.01ms !important;
            }
        }
    </style>
</head>
<body>

    <a href="#main" class="skip-link">Skip to content</a>

    <header>
        <a href="/" class="back-link">&larr; Kevin Lee</a>
        <div class="toggle-wrap">
            <input type="checkbox" id="theme-toggle" aria-label="Toggle dark mode">
            <label for="theme-toggle"><span class="sr-only">Toggle dark mode</span></label>
        </div>
    </header>

    <main id="main">
        <section class="hero">
            <h1 class="hero-title">The Wakayama Hotfix</h1>
            <p class="hero-tagline">Four days, three onsen soaks, one itinerary now open for peer review.</p>
            <p class="hero-blurb">
                I planned a four-day run down the Wakayama coast in October, and because
                I'm an engineer I built a webpage about it instead of just texting you.
                Everything below is real and mostly booked. This page has a comments
                section, which means the itinerary is now open source &mdash; tell me
                what I got wrong, what I'm missing, or what snack you want smuggled back.
                I will read all feedback from a bathtub facing the Pacific.
            </p>
            <p class="stat-block">4 days &middot; 3 onsen soaks &middot; 5 sights &middot; 2 flights &middot; &infin; opportunities to forget a towel</p>
            <p class="countdown" id="countdown" aria-live="polite"></p>
        </section>

        <!-- ROUTE MAP -->

        <!-- DAY-BY-DAY -->

        <!-- HIGHLIGHTS -->

        <!-- COMMENTS -->
    </main>

    <footer>
        <p>&copy; <span id="copyrightYear"></span> Kevin Lee</p>
    </footer>

    <!-- Analytics -->
    <script defer src="/_vercel/insights/script.js"></script>
    <script defer src="/_vercel/speed-insights/script.js"></script>

    <script>
        document.getElementById('copyrightYear').textContent = new Date().getFullYear();
    </script>

    <script src="/js/i18n.js"></script>
    <script src="/js/theme.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify in the browser**

Run: `npm run dev`, open `http://localhost:8080/japan-trip/`. Confirm: title bar reads
"The Wakayama Hotfix — Kevin Lee", hero renders, dark/light toggle works, back link
returns to `/`.

- [ ] **Step 3: Commit**

```bash
git add japan-trip/index.html
git commit -m "Scaffold Japan trip page shell and hero"
```

---

### Task 4: Countdown timer (JS)

**Files:**
- Modify: `japan-trip/index.html`

**Interfaces:**
- Consumes: `#countdown` element from Task 3.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the countdown script**

Insert directly above the existing `<script src="/js/i18n.js"></script>` line at the
bottom of `japan-trip/index.html`:

```html
    <script>
        (function() {
            // UPDATE: set to the actual booked Gimpo departure (OZ1165, 17:40 JST/KST).
            var DEPARTURE_ISO = '2026-10-01T17:40:00+09:00';
            var el = document.getElementById('countdown');
            if (!el) return;

            function render() {
                var diffMs = new Date(DEPARTURE_ISO).getTime() - Date.now();
                if (diffMs <= 0) {
                    el.textContent = 'Status: wheels up. OZ1165 has departed.';
                    return;
                }
                var days = Math.floor(diffMs / 86400000);
                var hours = Math.floor((diffMs % 86400000) / 3600000);
                el.textContent = 'T-minus ' + days + 'd ' + hours + 'h until OZ1165 (Gimpo 17:40 → Kansai 19:20)';
            }

            render();
            setInterval(render, 60000);
        })();
    </script>
```

- [ ] **Step 2: Verify in the browser**

Reload `http://localhost:8080/japan-trip/`. Confirm the countdown line renders under
the stat block with a real day/hour count (not `NaN` or `Invalid Date`).

- [ ] **Step 3: Commit**

```bash
git add japan-trip/index.html
git commit -m "Add departure countdown to Japan trip page"
```

**Note for Kevin:** `DEPARTURE_ISO` is a placeholder date (2026-10-01) — update it to
your actual booked Gimpo departure date/time before sharing the page.

---

### Task 5: Route map (per-stop scroll reveal)

**Files:**
- Modify: `japan-trip/index.html`

**Interfaces:**
- Consumes: none.
- Produces: `.route-stop[data-stop]` elements with `data-stop="1"` through `"4"` that
  Task 6 (day cards) cross-references via matching `data-day` attributes for the
  `IntersectionObserver` wiring.

This replaces the design spec's original "continuous scroll-linked SVG path-draw"
concept — per the `/gauntlet` review (finding #4, confirmed across all 4 review
seats), a static SVG with 4 always-visible markers is used instead, and JS only
toggles a CSS class per marker as its paired day card scrolls into view. The
un-toggled default state is fully visible, so `prefers-reduced-motion` visitors and
any visitor whose JS fails to run both still see a complete, correct map.

- [ ] **Step 1: Add the route map markup and CSS**

Add this CSS inside the `<style>` block, directly after the `.separator` rule:

```css
        .route-map { margin: 2.5rem 0; }
        .route-map svg { width: 100%; max-width: 240px; display: block; margin: 0 auto; }
        /* Default state is the FINAL/revealed state (accent fill, full opacity) —
           this is what a no-JS visitor or a prefers-reduced-motion visitor sees,
           since the reveal script below refuses to run for either. JS is only
           responsible for ADDING the temporary .pending (dimmed, not-yet-reached)
           treatment for motion-OK visitors, then removing it per stop on scroll. */
        .route-stop circle {
            fill: var(--accent);
            stroke: var(--text);
            stroke-width: 2;
            opacity: 1;
            transition: opacity 0.4s ease, fill 0.4s ease;
        }
        .route-stop text {
            fill: var(--text);
            font-family: var(--mono);
            font-size: 11px;
            opacity: 0.9;
            transition: opacity 0.4s ease;
        }
        .route-stop.pending circle { fill: var(--bg); opacity: 0.35; }
        .route-stop.pending text { opacity: 0.5; }
        .route-line { stroke: var(--card-border); stroke-width: 2; fill: none; }
```

Replace the `<!-- ROUTE MAP -->` comment in the body with:

```html
        <!-- ROUTE MAP -->
        <section class="route-map" aria-hidden="true">
            <svg viewBox="0 0 200 400" role="img" aria-label="Route: Kansai to Shirahama to Kushimoto and back">
                <path class="route-line" d="M 100 40 L 100 140 L 100 240 L 100 340" />
                <g class="route-stop" data-stop="1">
                    <circle cx="100" cy="40" r="8" />
                    <text x="118" y="45">Kansai</text>
                </g>
                <g class="route-stop" data-stop="2">
                    <circle cx="100" cy="140" r="8" />
                    <text x="118" y="145">Shirahama</text>
                </g>
                <g class="route-stop" data-stop="3">
                    <circle cx="100" cy="240" r="8" />
                    <text x="118" y="245">Kushimoto</text>
                </g>
                <g class="route-stop" data-stop="4">
                    <circle cx="100" cy="340" r="8" />
                    <text x="118" y="345">Kansai</text>
                </g>
            </svg>
        </section>
```

- [ ] **Step 2: Add the IntersectionObserver script**

Insert above the countdown `<script>` block added in Task 4:

```html
    <script>
        (function() {
            if (!('IntersectionObserver' in window)) return;
            // Bail entirely under reduced motion — same convention as
            // js/header-scroll.js. The CSS default (fully revealed) is already
            // the correct static state for these visitors, so there is nothing
            // for this script to do.
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            var stops = document.querySelectorAll('.route-stop');
            if (!stops.length) return;

            // Dim every stop first; the observer below un-dims each one as its
            // paired day card scrolls into view. Doing this from JS (not CSS)
            // means a visitor whose JS fails to run still sees every stop in
            // its final, fully-revealed default state.
            stops.forEach(function(s) { s.classList.add('pending'); });

            var observer = new IntersectionObserver(function(entries) {
                entries.forEach(function(entry) {
                    if (!entry.isIntersecting) return;
                    var stopNum = entry.target.getAttribute('data-day');
                    var marker = document.querySelector('.route-stop[data-stop="' + stopNum + '"]');
                    if (marker) marker.classList.remove('pending');
                });
            }, { threshold: 0.4 });

            document.querySelectorAll('.day-card[data-day]').forEach(function(card) {
                observer.observe(card);
            });
        })();
    </script>
```

- [ ] **Step 3: Verify in the browser**

Reload `http://localhost:8080/japan-trip/`. Since no `.day-card[data-day]` elements
exist yet (Task 6 adds them), `observer.observe()` is called with an empty NodeList, so
every stop keeps its `.pending` class permanently — confirm no console errors, and that
all 4 markers/labels render (Kansai, Shirahama, Kushimoto, Kansai) in the dimmed
`.pending` state (35% opacity). Also confirm: with OS-level "reduce motion" turned on,
reload again and all 4 markers instead render fully solid/accent-colored (the script
bails before adding any `.pending` class).

- [ ] **Step 4: Commit**

```bash
git add japan-trip/index.html
git commit -m "Add static route map with per-stop scroll reveal"
```

---

### Task 6: Day-by-day itinerary cards

**Files:**
- Modify: `japan-trip/index.html`

**Interfaces:**
- Consumes: `.route-stop[data-stop]` markers from Task 5.
- Produces: `.day-card[data-day="1"]` through `[data-day="4"]`, observed by Task 5's
  script (already wired — this task just needs to add elements with matching
  `data-day` values, no JS changes here).

- [ ] **Step 1: Add day-card CSS**

Add to the `<style>` block, after `.card-map-link`:

```css
        .day-badge {
            font-family: var(--mono);
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--accent);
        }
```

- [ ] **Step 2: Replace the `<!-- DAY-BY-DAY -->` comment**

```html
        <!-- DAY-BY-DAY -->
        <section>
            <h2>The Itinerary</h2>

            <div class="card day-card" data-day="1">
                <p class="day-badge">Day 1 &middot; OPERATIONAL</p>
                <p class="card-title">Gimpo &rarr; Kansai</p>
                <p class="card-caption">OZ1165, 17:40 &rarr; 19:20. Then a high floor to stare at airport infrastructure and call it a view.</p>
                <p class="card-detail">Sleeping near the airport: Odysis Suite Osaka Kansai Airport Hotel, a high-floor tower room (15th&ndash;26th floor) with ocean or city views.</p>
                <a class="card-map-link" href="https://www.google.com/maps/search/?api=1&query=Odysis%20Suite%20Osaka%20Kansai%20Airport%20Hotel" target="_blank" rel="noopener">View hotel on Google Maps &rarr;</a>
            </div>

            <div class="card day-card" data-day="2">
                <p class="day-badge">Day 2 &middot; OPERATIONAL</p>
                <p class="card-title">South to Shirahama</p>
                <p class="card-caption">Onsen hotel right on the beach, with an infinity foot bath. Feet get first-class treatment.</p>
                <p class="card-detail">Staying at Shirahama Key Terrace Hotel Seamore &mdash; infinity foot bath and an ocean-facing open-air salt-water bath, one of Japan's storied hot-spring towns.</p>
                <a class="card-map-link" href="https://www.google.com/maps/search/?api=1&query=Shirahama%20Key%20Terrace%20Hotel%20Seamore" target="_blank" rel="noopener">View hotel on Google Maps &rarr;</a>
            </div>

            <div class="card day-card" data-day="3">
                <p class="day-badge">Day 3 &middot; OPERATIONAL</p>
                <p class="card-title">Further south to Kushimoto</p>
                <p class="card-caption">Ocean-view open-air bath by the bridge. The itinerary is now mostly water.</p>
                <p class="card-detail">Staying at Mercure Wakayama Kushimoto Resort &amp; Spa &mdash; open-air bath facing the Pacific near Kushimoto Bridge.</p>
                <a class="card-map-link" href="https://www.google.com/maps/search/?api=1&query=Mercure%20Wakayama%20Kushimoto%20Resort%20%26%20Spa" target="_blank" rel="noopener">View hotel on Google Maps &rarr;</a>
            </div>

            <div class="card day-card" data-day="4">
                <p class="day-badge">Day 4 &middot; OPERATIONAL</p>
                <p class="card-title">Kansai &rarr; Gimpo</p>
                <p class="card-caption">OZ1155, 20:30 &rarr; 22:25. Home before midnight, smelling faintly of sulfur and accomplishment.</p>
                <p class="card-detail">Last stop before the flight home &mdash; back up to Kansai Airport from Kushimoto/Shirahama.</p>
            </div>
        </section>
```

- [ ] **Step 3: Verify in the browser**

Reload `http://localhost:8080/japan-trip/`. Confirm 4 day cards render in order. On
load, all 4 route-map markers should start dimmed (`.pending`, added once real
`.day-card` elements exist for the observer to watch). Scroll slowly and confirm each
marker turns from dimmed to solid accent color as its matching day card scrolls into
view, and stays solid after scrolling past (the observer only removes `.pending`, never
re-adds it).

- [ ] **Step 4: Commit**

```bash
git add japan-trip/index.html
git commit -m "Add day-by-day itinerary cards"
```

---

### Task 7: Highlights, hotels-recap, food, and practical tips

**Files:**
- Modify: `japan-trip/index.html`

**Interfaces:**
- Consumes: none.
- Produces: none consumed by later tasks.

- [ ] **Step 1: Replace the `<!-- HIGHLIGHTS -->` comment**

```html
        <!-- HIGHLIGHTS -->
        <section>
            <hr class="separator">
            <h2>5 Sights</h2>

            <div class="card">
                <p class="card-eyebrow">Engetsu Island</p>
                <p class="card-caption">A rock arch famous for a sunset that lines up perfectly through the hole &mdash; at the equinox, which October is not. We'll be off by about three weeks and call it close enough.</p>
                <p class="card-detail">Sunset itself is still worth it, roughly 5:30&ndash;6:00pm in October.</p>
                <a class="card-map-link" href="https://www.google.com/maps/search/?api=1&query=Engetsu%20Island%20Wakayama" target="_blank" rel="noopener">View on Google Maps &rarr;</a>
            </div>

            <div class="card">
                <p class="card-eyebrow">Shirasaki Marine Park</p>
                <p class="card-caption">White limestone coast nicknamed "Japan's Aegean Sea," for the budget that didn't stretch to Santorini.</p>
                <a class="card-map-link" href="https://www.google.com/maps/search/?api=1&query=Shirasaki%20Marine%20Park%20Wakayama" target="_blank" rel="noopener">View on Google Maps &rarr;</a>
            </div>

            <div class="card">
                <p class="card-eyebrow">Nachi Falls</p>
                <p class="card-caption">Japan's tallest single-drop waterfall (133m), next to a red three-story pagoda. One photo, no notes.</p>
                <p class="card-detail">Reached via the Daimonzaka stone-step trail through 800-year-old cedars &mdash; budget 2.5&ndash;3hrs round trip. No direct train from Shirahama/Kushimoto; JR to Kii-Katsuura then a local bus.</p>
                <a class="card-map-link" href="https://www.google.com/maps/search/?api=1&query=Nachi%20Falls%20Wakayama" target="_blank" rel="noopener">View on Google Maps &rarr;</a>
            </div>

            <div class="card">
                <p class="card-eyebrow">Wakayama Castle</p>
                <p class="card-caption">Every Japan itinerary is contractually required to include one castle. This is ours.</p>
                <p class="card-detail">Built 1585 under Toyotomi Hideyoshi; blue-stone walls are a Kishu specialty.</p>
                <a class="card-map-link" href="https://www.google.com/maps/search/?api=1&query=Wakayama%20Castle" target="_blank" rel="noopener">View on Google Maps &rarr;</a>
            </div>

            <div class="card">
                <p class="card-eyebrow">Sandanbeki Cliffs</p>
                <p class="card-caption">50m sea cliffs with an elevator down into a smuggler's cave &mdash; the rare attraction with both drama and an accessible entrance.</p>
                <a class="card-map-link" href="https://www.google.com/maps/search/?api=1&query=Sandanbeki%20Wakayama" target="_blank" rel="noopener">View on Google Maps &rarr;</a>
            </div>

            <hr class="separator">
            <h2>Food</h2>
            <div class="card">
                <p class="card-caption">Wakayama tuna sukiyaki, a hotel dinner buffet (free-flow drinks, once), and Wakayama ramen &mdash; a rich tonkotsu-shoyu bowl with a quirky help-yourself side table of boiled eggs and pressed mackerel sushi, honor system.</p>
            </div>

            <hr class="separator">
            <h2>Practical Notes</h2>
            <div class="card">
                <p class="card-detail">October in Wakayama: pleasant mid-20s&deg;C, some rain (~14 days/month, mostly light), typhoon risk much lower than Aug/Sept.</p>
                <p class="card-detail">Onsen etiquette: wash thoroughly before entering, no swimsuits, small towel never touches the bathwater. Tattoo policy varies by hotel &mdash; worth confirming ahead since 2 of 3 nights are onsen resorts.</p>
            </div>
        </section>
```

- [ ] **Step 2: Verify in the browser**

Reload `http://localhost:8080/japan-trip/`. Confirm all 5 sight cards, the food card,
and the practical-notes card render with working Google Maps links (click 2-3 to
confirm they open the correct real-world location in a new tab).

- [ ] **Step 3: Commit**

```bash
git add japan-trip/index.html
git commit -m "Add highlights, food, and practical-notes sections"
```

---

### Task 8: Comments widget

**Files:**
- Modify: `japan-trip/index.html`

**Interfaces:**
- Consumes: `POST/GET /api/comments` (Task 1's honeypot fields), issue slug
  `trip-japan-oct`.
- Produces: none.

Adapted from the working comments widget already shipped in
`newsletter/007/index.html` (markup + `renderComment`/`timeAgo`/`escapeHtml` pattern),
with the honeypot/elapsed fields from Task 1 wired in exactly like `js/subscribe.js`
does for the subscribe form.

- [ ] **Step 1: Add comments CSS**

Add to the `<style>` block:

```css
        .comments { margin-top: 1rem; }
        .comments-form { display: flex; flex-direction: column; gap: 8px; margin-bottom: 2rem; }
        .comments-input {
            font-family: var(--font);
            font-size: 16px;
            padding: 10px 14px;
            border: 1px solid var(--card-border);
            border-radius: 8px;
            background: transparent;
            color: var(--text);
        }
        .comments-textarea { resize: vertical; min-height: 90px; line-height: 1.5; }
        .comments-btn {
            align-self: flex-start;
            font-family: var(--font);
            font-size: 15px;
            font-weight: 600;
            padding: 10px 20px;
            border: 1px solid var(--text);
            border-radius: 8px;
            background: var(--text);
            color: var(--bg);
            cursor: pointer;
            transition: opacity 0.2s ease;
        }
        .comments-btn:hover { opacity: 0.7; }
        .comment-item { padding: 0.85rem 0; border-top: 1px solid var(--card-border); }
        .comment-meta { display: flex; gap: 0.6rem; font-size: 13px; opacity: 0.55; margin-bottom: 0.25rem; }
        .comment-name { font-weight: 600; }
        .comment-body { font-size: 16px; line-height: 1.5; }
        .comments-empty { font-size: 15px; opacity: 0.55; padding: 1rem 0; }
```

- [ ] **Step 2: Replace the `<!-- COMMENTS -->` comment**

```html
        <!-- COMMENTS -->
        <section class="comments">
            <hr class="separator">
            <h2>Open an issue</h2>
            <p class="card-detail" style="margin-bottom: 1.25rem;">Known bugs: no equinox, possible rain. Feature requests, roasts, and souvenir orders all accepted &mdash; the itinerary ships in October regardless.</p>
            <form class="comments-form" id="commentsForm">
                <input type="text" class="comments-input" id="commentName" placeholder="Your name" maxlength="100" required>
                <textarea class="comments-input comments-textarea" id="commentText" placeholder="Write a comment..." maxlength="2000" required></textarea>
                <button type="submit" class="comments-btn" id="commentBtn">Post</button>
            </form>
            <div class="comments-list" id="commentsList"></div>
            <p class="comments-empty" id="commentsEmpty" style="display:none;">No comments yet. Be the first.</p>
        </section>
```

- [ ] **Step 3: Add the comments script**

Insert above the route-map `IntersectionObserver` script added in Task 5:

```html
    <script>
        (function() {
            var form = document.getElementById('commentsForm');
            var nameInput = document.getElementById('commentName');
            var textInput = document.getElementById('commentText');
            var btn = document.getElementById('commentBtn');
            var list = document.getElementById('commentsList');
            var empty = document.getElementById('commentsEmpty');
            var issue = 'trip-japan-oct';
            var initTime = Date.now();

            // Honeypot: visually hidden field only autofilling bots tend to complete.
            var hp = document.createElement('input');
            hp.type = 'text';
            hp.name = 'website';
            hp.autocomplete = 'off';
            hp.tabIndex = -1;
            hp.setAttribute('aria-hidden', 'true');
            hp.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
            form.appendChild(hp);

            function escapeHtml(str) {
                var div = document.createElement('div');
                div.appendChild(document.createTextNode(str));
                return div.innerHTML;
            }

            function timeAgo(dateStr) {
                var seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
                if (seconds < 60) return 'just now';
                var intervals = [[31536000, 'y'], [2592000, 'mo'], [86400, 'd'], [3600, 'h'], [60, 'm']];
                for (var i = 0; i < intervals.length; i++) {
                    var count = Math.floor(seconds / intervals[i][0]);
                    if (count >= 1) return count + intervals[i][1] + ' ago';
                }
                return 'just now';
            }

            function renderComment(c) {
                var div = document.createElement('div');
                div.className = 'comment-item';
                div.innerHTML = '<div class="comment-meta">'
                    + '<span class="comment-name">' + escapeHtml(c.name) + '</span>'
                    + '<span class="comment-time">' + timeAgo(c.created_at) + '</span>'
                    + '</div>'
                    + '<p class="comment-body">' + escapeHtml(c.comment) + '</p>';
                return div;
            }

            function renderComments(comments) {
                list.innerHTML = '';
                if (!comments || !comments.length) { empty.style.display = ''; return; }
                empty.style.display = 'none';
                comments.forEach(function(c) { list.appendChild(renderComment(c)); });
            }

            function loadComments() {
                fetch('/api/comments?issue=' + issue)
                    .then(function(r) { return r.json(); })
                    .then(renderComments)
                    .catch(function() {});
            }

            form.addEventListener('submit', function(e) {
                e.preventDefault();
                var name = nameInput.value.trim();
                var comment = textInput.value.trim();
                if (!name || !comment) return;
                btn.disabled = true; btn.style.opacity = '0.4';
                fetch('/api/comments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        issue: issue,
                        name: name,
                        comment: comment,
                        website: hp.value,
                        elapsed: Date.now() - initTime
                    })
                })
                .then(function(res) { if (!res.ok) throw new Error(); localStorage.setItem('trip-comment-name', name); textInput.value = ''; loadComments(); })
                .catch(function() {})
                .finally(function() { btn.disabled = false; btn.style.opacity = ''; });
            });

            var savedName = localStorage.getItem('trip-comment-name');
            if (savedName) nameInput.value = savedName;
            loadComments();
        })();
    </script>
```

- [ ] **Step 4: Verify in the browser — WITHOUT submitting a real comment**

`npm run dev` serves static files only — it does not execute `api/*.js`, so a real
submit attempt against `http://localhost:8080` will 404 (expected, not a bug). Do
NOT work around this by pointing the page at production and submitting for real —
this widget is hardcoded to `issue=trip-japan-oct`, the real thread friends will
actually read, so a live test submission would permanently plant a fake comment
there. Verify structurally instead:

- Reload `http://localhost:8080/japan-trip/`. Open devtools Network tab, confirm a
  `GET /api/comments?issue=trip-japan-oct` request fires on load (it will fail with
  404 locally — that's expected) and that the failure is caught silently (the
  `.catch(function() {})` in `loadComments()`) rather than throwing an unhandled
  error into the console.
- Confirm `#commentsEmpty` shows its "No comments yet" text when the fetch fails
  (since `renderComments` is never called with real data, the empty state should be
  whatever the initial HTML/CSS shows — verify it looks correct, not broken/blank).
- Confirm the form renders (name field, textarea, Post button) and that a hidden
  honeypot `<input name="website">` gets injected into the DOM (inspect via devtools
  — it should be present but invisible, per the same pattern as `js/subscribe.js`).
- Fill in the form and click Post; confirm the button disables during the (locally
  failing) request and re-enables after, without a page crash or unhandled
  exception — this proves the request path and error handling work even though the
  actual persistence can't be verified locally.
- The real end-to-end round trip (POST succeeds, comment renders, persists) is
  verified safely in Task 11 via Playwright route interception — not here.

- [ ] **Step 5: Commit**

```bash
git add japan-trip/index.html
git commit -m "Add comments widget to Japan trip page"
```

---

### Task 9: Dev-tools easter egg

**Files:**
- Modify: `japan-trip/index.html`

**Interfaces:**
- Consumes: none.
- Produces: none.

- [ ] **Step 1: Add the console.log easter egg**

Insert as the last `<script>` block before `</body>` (after the `js/theme.js` include):

```html
    <script>
        console.log(
            '%cItinerary loaded.',
            'font-weight:bold;font-size:14px;'
        );
        console.log(
            // for the friends who were always going to open dev tools.
            JSON.stringify({
                flights: ['OZ1165 GMP-KIX 17:40', 'OZ1155 KIX-GMP 20:30'],
                stays: ['Odysis Suite Osaka Kansai Airport Hotel', 'Shirahama Key Terrace Hotel Seamore', 'Mercure Wakayama Kushimoto Resort & Spa'],
                sights: ['Engetsu Island', 'Shirasaki Marine Park', 'Nachi Falls', 'Wakayama Castle', 'Sandanbeki Cliffs'],
                knownBugs: ['no equinox alignment in October', 'possible rain']
            }, null, 2)
        );
    </script>
```

- [ ] **Step 2: Verify in the browser**

Open `http://localhost:8080/japan-trip/`, open devtools console, confirm both log
lines appear with no errors.

- [ ] **Step 3: Commit**

```bash
git add japan-trip/index.html
git commit -m "Add dev-tools easter egg"
```

---

### Task 10: Source and verify real images

**Files:**
- Modify: `japan-trip/index.html`

**Interfaces:**
- Consumes: none.
- Produces: none.

The scraped Lotte Tour marketing photos are copyrighted agency images and must NOT be
used (see spec §3.6). This task requires a live web lookup — do not hardcode a guessed
image URL without verifying it first.

- [ ] **Step 1: Source 3 candidate photos**

Search Unsplash (`https://unsplash.com/s/photos/wakayama`) or Wikimedia Commons for:
one hero image (Kii peninsula coastline), one Nachi Falls image, one Shirasaki/white-rock-coast
image. For each candidate, confirm its license permits free use (Unsplash License, or
Wikimedia Commons CC-BY/CC-BY-SA/public domain).

- [ ] **Step 2: Verify each URL actually loads before using it**

For each candidate image URL:

```bash
curl -sI "<candidate-image-url>" | head -1
```

Expected: `HTTP/2 200` (or `HTTP/1.1 200`). If any candidate returns non-200, discard
it and pick another — do not commit a URL that hasn't been verified this way.

- [ ] **Step 3: Add the verified images to the page**

Add an `<img>` inside `.hero` (after `.hero-blurb`, before `.stat-block`) for the hero
photo, and one `<img>` each inside the Nachi Falls and Shirasaki Marine Park cards from
Task 7 (before their `.card-map-link`), using this pattern:

```html
<img src="<verified-url>" alt="<description of the real place>" style="width:100%;border-radius:8px;margin-bottom:0.75rem;" loading="lazy">
```

If required by the license, add a one-line credit directly under the image:

```html
<p style="font-size:12px;opacity:0.5;margin-top:-0.5rem;margin-bottom:0.75rem;">Photo: <a href="<photographer-or-source-url>" target="_blank" rel="noopener">credit name</a></p>
```

**Fallback:** if no confidently-licensed image is found for a given spot within a
reasonable search, skip the `<img>` for that card rather than using an unverified URL
— the card's existing text content and Google Maps link stand on their own.

- [ ] **Step 4: Verify in the browser**

Reload `http://localhost:8080/japan-trip/`. Confirm every added `<img>` actually
renders (not a broken-image icon) in both light and dark theme.

- [ ] **Step 5: Commit**

```bash
git add japan-trip/index.html
git commit -m "Add sourced, licensed photos to Japan trip page"
```

---

### Task 11: Smoke tests + final QA pass

**Files:**
- Create: `tests/smoke/japan-trip.spec.js`

**Interfaces:**
- Consumes: the finished `/japan-trip/` page and `/api/comments` (Task 1's slug
  `trip-japan-oct`).
- Produces: nothing (final task).

- [ ] **Step 1: Write the smoke test**

```javascript
const { test, expect } = require('@playwright/test');

test.describe('Japan trip page', () => {
    test('loads with hero and title', async ({ page }) => {
        await page.goto('/japan-trip/');
        await expect(page).toHaveTitle(/Wakayama Hotfix/i);
        await expect(page.locator('.hero-title')).toHaveText('The Wakayama Hotfix');
    });

    test('nav link from homepage resolves', async ({ page }) => {
        await page.goto('/');
        const link = page.locator('a[href="/japan-trip"]');
        await expect(link).toBeAttached();
        await link.click();
        await expect(page).toHaveURL(/\/japan-trip/);
    });

    test('all 4 day cards and 5 highlight cards render', async ({ page }) => {
        await page.goto('/japan-trip/');
        await expect(page.locator('.day-card')).toHaveCount(4);
        await expect(page.locator('.card-eyebrow')).toHaveCount(5);
    });

    // This page's widget is hardcoded to issue=trip-japan-oct — the real, shared
    // comment thread friends will actually read. Playwright runs against production
    // by default (see Task 1's note), so a real POST here would permanently plant a
    // fake "Smoke Test ####" comment in that real thread. Route interception verifies
    // the frontend↔API contract without ever touching the live backend.
    test('comments widget renders comments returned by the API', async ({ page }) => {
        // Single handler for the whole /api/comments* path (GET with query string
        // included) — registering two overlapping page.route() patterns for the same
        // request is ordering-sensitive in Playwright; one handler avoids that entirely.
        await page.route('**/api/comments*', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([{ id: 1, name: 'A Friend', comment: 'Looks fun!', created_at: new Date().toISOString() }]),
            });
        });
        await page.goto('/japan-trip/');
        await expect(page.locator('.comment-name').filter({ hasText: 'A Friend' })).toBeVisible();
        await expect(page.locator('#commentsEmpty')).toBeHidden();
    });

    test('comments widget submits the right payload without hitting the real API', async ({ page }) => {
        let capturedBody = null;
        await page.route('**/api/comments*', async (route) => {
            if (route.request().method() === 'POST') {
                capturedBody = route.request().postDataJSON();
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
            } else {
                await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
            }
        });
        await page.goto('/japan-trip/');
        await page.fill('#commentName', 'Test Friend');
        await page.fill('#commentText', 'Automated smoke test — intercepted, never persisted.');
        await page.click('#commentBtn');
        await expect.poll(() => capturedBody).not.toBeNull();
        expect(capturedBody.issue).toBe('trip-japan-oct');
        expect(capturedBody.name).toBe('Test Friend');
        expect(typeof capturedBody.elapsed).toBe('number');
    });

    test('route map markers reveal on scroll', async ({ page }) => {
        await page.goto('/japan-trip/');
        const marker1 = page.locator('.route-stop[data-stop="1"]');
        // Day 1's card sits right after the hero, so it should already be revealed on load.
        await expect(marker1).not.toHaveClass(/pending/);
        const marker4 = page.locator('.route-stop[data-stop="4"]');
        await expect(marker4).toHaveClass(/pending/);
        await page.locator('.day-card[data-day="4"]').scrollIntoViewIfNeeded();
        await expect(marker4).not.toHaveClass(/pending/);
    });
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test tests/smoke/japan-trip.spec.js --project=chromium`
Expected: PASS (all 6 tests).

- [ ] **Step 3: Run the full smoke suite to confirm no regressions**

Run: `npm run test:smoke`
Expected: PASS (every existing smoke test, plus the 6 new ones and Task 1's 3 new
`api.spec.js` tests).

- [ ] **Step 4: Manual QA pass**

- Set OS-level "reduce motion" on, reload `/japan-trip/` — confirm all 4 route-map
  markers render fully solid/accent-colored immediately (the reveal script bails
  entirely under reduced motion, per Task 5).
- Resize the browser to a mobile width (375px) — confirm cards, hero, and comments
  form don't overflow or clip.
- Toggle dark mode — confirm every new element (cards, route map, comments form)
  recolors correctly, no hardcoded light-only colors.
- Per spec §3.4: do a 30-second check that nothing in `supabase/DISPATCH_PLATFORM_SCHEMA.md`
  or the iOS app's known tables references `dispatch_comments` before considering this
  fully shipped (gauntlet finding #7 — plausible-only, not confirmed).

- [ ] **Step 5: Commit**

```bash
git add tests/smoke/japan-trip.spec.js
git commit -m "Add smoke tests for Japan trip page"
```
