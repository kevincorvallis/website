# Locus Demo Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Locus's raw `500` (when `GOOGLE_PLACES_API_KEY` is missing) and opaque `502`/`503` failures with a three-state `live`/`degraded`/`demo` response envelope backed by a real, honestly-sourced 4-place demo dataset, plus a frontend that surfaces clickable example chips and an honest source caption.

**Architecture:** `api/locus-search.js` gains a static demo dataset and a pure `findDemoMatch()` lookup, then the handler routes to `demo` (key missing) or `degraded` (live call failed) instead of erroring, always returning HTTP 200 with `{source, reason, results}`. `projects/locus/index.html` adds demo-query chip buttons that call the same endpoint and a caption element driven by `source`.

**Tech Stack:** Vanilla Node.js (Vercel serverless function), vanilla JS/HTML/CSS frontend, Playwright for tests. No new dependencies.

## Global Constraints

- Never fabricate place data — the four demo records use exactly the values below, already independently sourced (see spec §4). Do not alter names/ratings/addresses/links.
- HTTP status is `200` for every response except request-validation (`400`) and the app-level rate limiter (`429`, unchanged, no envelope). Never return `500`/`502`/`503` from this handler after this plan.
- Demo chips populate the search input **and submit immediately** — not populate-only.
- `results` items keep the exact same shape (`name`, `address`, `rating`, `userRatingCount`, `priceLevel`, `mapsUri`, `whyItFits`) in all three modes — the frontend never branches on item shape, only on `source`.
- No new Supabase migration. No change to Google Places integration itself (`searchPlaces`, `parseQuery`, `rankPlaces` bodies are untouched).
- `reason` enum: `"key_missing"`, `"key_invalid"`, `"places_rate_limited"`, `"timeout"`, `"upstream_error"`, or `null` (only when `source: "live"`).

---

### Task 1: Demo dataset + `findDemoMatch()`

**Files:**
- Modify: `api/locus-search.js` (insert after `placeToResult`, i.e. after line 171 in the current file)
- Test: `tests/unit/locus-demo.spec.js` (new file)

**Interfaces:**
- Produces: `findDemoMatch(cleanQuery: string): object | null` — returns a result object (same shape as `placeToResult`'s return value) if `cleanQuery` case-insensitively matches one of the 4 demo queries, else `null`.
- Produces: `DEMO_RESULTS: array` — all 4 demo result objects, in the fixed order below.
- Both exported from `api/locus-search.js` via `module.exports.findDemoMatch` / `module.exports.DEMO_RESULTS` for the unit test to `require()`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/locus-demo.spec.js`:

```javascript
const { test, expect } = require('@playwright/test');
const locusSearch = require('../../api/locus-search.js');

test.describe('findDemoMatch', () => {
    test('matches the exact demo query text', () => {
        const result = locusSearch.findDemoMatch('quiet coffee shop to work from near Capitol Hill');
        expect(result).not.toBeNull();
        expect(result.name).toBe('Espresso Vivace Roasteria');
    });

    test('matches case-insensitively', () => {
        const result = locusSearch.findDemoMatch('QUIET COFFEE SHOP TO WORK FROM NEAR CAPITOL HILL');
        expect(result).not.toBeNull();
        expect(result.name).toBe('Espresso Vivace Roasteria');
    });

    test('matches with surrounding whitespace', () => {
        const result = locusSearch.findDemoMatch('  date night ramen spot in Fremont  ');
        expect(result).not.toBeNull();
        expect(result.name).toBe('Ooink');
    });

    test('returns null for a query that does not match any demo query', () => {
        const result = locusSearch.findDemoMatch('best pizza in Tacoma');
        expect(result).toBeNull();
    });

    test('returns null for an empty string', () => {
        const result = locusSearch.findDemoMatch('');
        expect(result).toBeNull();
    });

    test('DEMO_RESULTS has exactly 4 entries with the required fields', () => {
        expect(locusSearch.DEMO_RESULTS).toHaveLength(4);
        locusSearch.DEMO_RESULTS.forEach((r) => {
            expect(typeof r.name).toBe('string');
            expect(typeof r.address).toBe('string');
            expect(typeof r.rating).toBe('number');
            expect(typeof r.userRatingCount).toBe('number');
            expect(typeof r.priceLevel).toBe('string');
            expect(typeof r.mapsUri).toBe('string');
            expect(typeof r.whyItFits).toBe('string');
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/unit/locus-demo.spec.js --project=desktop`
Expected: FAIL — `locusSearch.findDemoMatch is not a function` (it doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

In `api/locus-search.js`, insert this block immediately after the `placeToResult` function (after the closing `}` on line 171, before the `const PARSE_SYSTEM_PROMPT` line):

```javascript
// Real places, independently web-searched and sourced 2026-07-11 (see
// docs/superpowers/specs/2026-07-11-locus-demo-mode-design.md §4). A frozen
// snapshot, not a live feed — never fabricated, never auto-refreshed.
const DEMO_PLACES = [
    {
        query: 'quiet coffee shop to work from near capitol hill',
        name: 'Espresso Vivace Roasteria',
        address: '532 Broadway E, Seattle, WA 98102',
        rating: 4.5,
        userRatingCount: 1515,
        priceLevel: 'PRICE_LEVEL_INEXPENSIVE',
        mapsUri: 'https://www.google.com/maps/search/?api=1&query=Espresso%20Vivace%20Roasteria%2C%20532%20Broadway%20E%2C%20Seattle%2C%20WA%2098102',
        whyItFits: 'A 38-year-old Capitol Hill fixture with a dedicated quiet room, rated 4.5 from over 1,500 reviews at coffee-shop prices.',
    },
    {
        query: 'date night ramen spot in fremont',
        name: 'Ooink',
        address: '3630 Stone Way N, Seattle, WA 98103',
        rating: 4.3,
        userRatingCount: 285,
        priceLevel: 'PRICE_LEVEL_MODERATE',
        mapsUri: 'https://www.google.com/maps/search/?api=1&query=Ooink%2C%203630%20Stone%20Way%20N%2C%20Seattle%2C%20WA%2098103',
        whyItFits: 'A 4.3-rated, mid-priced ramen counter in the heart of Fremont\'s ramen row, small enough that the room stays intimate.',
    },
    {
        query: 'a bar where you can actually hear people talk, in ballard',
        name: 'The Ballard Smoke Shop',
        address: '5439 Ballard Ave NW, Seattle, WA 98107',
        rating: 4.4,
        userRatingCount: 452,
        priceLevel: 'PRICE_LEVEL_INEXPENSIVE',
        mapsUri: 'https://www.google.com/maps/search/?api=1&query=The%20Ballard%20Smoke%20Shop%2C%205439%20Ballard%20Ave%20NW%2C%20Seattle%2C%20WA%2098107',
        whyItFits: 'A family-run dive bar since 1971, rated 4.4 on Google, with a lounge-and-arcade layout that skews toward conversation over club noise.',
    },
    {
        query: 'best view brunch spot in downtown seattle',
        name: 'Goldfinch Tavern',
        address: '99 Union St, Seattle, WA 98101',
        rating: 4.3,
        userRatingCount: 1011,
        priceLevel: 'PRICE_LEVEL_EXPENSIVE',
        mapsUri: 'https://www.google.com/maps/search/?api=1&query=Goldfinch%20Tavern%2C%2099%20Union%20St%2C%20Seattle%2C%20WA%2098101',
        whyItFits: 'An Elliott Bay-facing dining room with over 1,000 Google reviews at a 4.3 average, priced at the upper end for a Sunday brunch buffet.',
    },
];

function demoResultShape(place) {
    return {
        name: place.name,
        address: place.address,
        rating: place.rating,
        userRatingCount: place.userRatingCount,
        priceLevel: place.priceLevel,
        mapsUri: place.mapsUri,
        whyItFits: place.whyItFits,
    };
}

const DEMO_RESULTS = DEMO_PLACES.map(demoResultShape);

function findDemoMatch(cleanQuery) {
    if (!cleanQuery) return null;
    const normalized = cleanQuery.trim().toLowerCase();
    const match = DEMO_PLACES.find((p) => p.query === normalized);
    return match ? demoResultShape(match) : null;
}
```

Then add these two lines to the `module.exports` block at the bottom of the file (after the existing `module.exports.rankPlaces = rankPlaces;` line):

```javascript
module.exports.findDemoMatch = findDemoMatch;
module.exports.DEMO_RESULTS = DEMO_RESULTS;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/unit/locus-demo.spec.js --project=desktop`
Expected: PASS (6/6 tests)

- [ ] **Step 5: Commit**

```bash
git add api/locus-search.js tests/unit/locus-demo.spec.js
git commit -m "Add Locus demo dataset + findDemoMatch"
```

---

### Task 2: Response envelope + `key_missing` routing

**Files:**
- Modify: `api/locus-search.js:250-334` (the `handler` function)
- Create: `tests/unit/locus-handler.spec.js` (new file — separate from `locus-demo.spec.js`, which stays scoped to the pure `findDemoMatch`/`DEMO_RESULTS` functions per single-responsibility)

**Interfaces:**
- Consumes: `findDemoMatch` and `DEMO_RESULTS` from Task 1.
- Produces: `handler`'s JSON responses now always include `source` and `reason` keys (except the pre-existing bare `{error}` shapes for `400`/`429`/`405`, which are unchanged). This task covers the `key_missing` and `live`-success/`empty`-result paths; Task 3 covers the `degraded` (live-call-failure) path, extending the same test file.

**Gotcha to know before writing the test:** `api/locus-search.js` reads
`GOOGLE_PLACES_API_KEY` into a module-level `const` at the top of the file
(`const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;`), not
dynamically per-request. Setting `process.env.GOOGLE_PLACES_API_KEY` after
the module is already `require()`'d has no effect on that captured const.
Tests must clear `require.cache` and re-`require()` the module after
changing the env var, every time — the helper below does this.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/locus-handler.spec.js`:

```javascript
const { test, expect } = require('@playwright/test');

const MODULE_PATH = require.resolve('../../api/locus-search.js');

function freshHandler(envOverrides) {
    delete require.cache[MODULE_PATH];
    Object.assign(process.env, envOverrides);
    return require(MODULE_PATH);
}

function fakeReqRes(query) {
    const req = { method: 'POST', headers: {}, body: { query } };
    const res = {
        _status: 200,
        _json: null,
        status(code) { this._status = code; return this; },
        json(obj) { this._json = obj; return this; },
        setHeader() {},
        end() {},
    };
    return { req, res };
}

test.describe('handler key_missing routing', () => {
    test('returns a single demo match when the query matches one and no key is configured', async () => {
        const handler = freshHandler({ GOOGLE_PLACES_API_KEY: '' });
        const { req, res } = fakeReqRes('quiet coffee shop to work from near Capitol Hill');
        await handler(req, res);
        expect(res._status).toBe(200);
        expect(res._json.source).toBe('demo');
        expect(res._json.reason).toBe('key_missing');
        expect(res._json.note).toBeUndefined();
        expect(res._json.results).toHaveLength(1);
        expect(res._json.results[0].name).toBe('Espresso Vivace Roasteria');
    });

    test('returns all four demo results with a note when the query does not match any demo query', async () => {
        const handler = freshHandler({ GOOGLE_PLACES_API_KEY: '' });
        const { req, res } = fakeReqRes('best pizza in Tacoma');
        await handler(req, res);
        expect(res._status).toBe(200);
        expect(res._json.source).toBe('demo');
        expect(res._json.reason).toBe('key_missing');
        expect(res._json.note).toContain("isn't configured yet");
        expect(res._json.results).toHaveLength(4);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/unit/locus-handler.spec.js --project=desktop`
Expected: FAIL — today's code returns `res._status === 500` with `{error: 'Server configuration error'}`, not the `source`/`reason`/`results` shape the tests expect.

- [ ] **Step 3: Implement the envelope + key_missing routing**

The current file checks `!GOOGLE_PLACES_API_KEY` (original lines 267-269)
*before* the query is validated/sanitized (original lines 271-281) — but
`findDemoMatch` needs the sanitized `cleanQuery`, so this step reorders:
query validation runs first, then the key check. Replace the entire
original block that runs from `if (!GOOGLE_PLACES_API_KEY) {` (line 267)
through the closing `}` of `if (!cleanQuery) { ... }` (line 281) — i.e.
both the old key-check and the old validation block, back to back — with
this single replacement (validation first, key-check/demo-routing second):

```javascript
    const { query } = req.body || {};
    if (!query || typeof query !== 'string' || !query.trim()) {
        return res.status(400).json({ error: 'Query is required' });
    }
    if (query.length > 300) {
        return res.status(400).json({ error: 'Query too long (max 300 characters)' });
    }
    const cleanQuery = sanitizeInput(query);
    if (!cleanQuery) {
        return res.status(400).json({ error: 'Query is required' });
    }

    if (!GOOGLE_PLACES_API_KEY) {
        const matched = findDemoMatch(cleanQuery);
        if (matched) {
            logSearch(cleanQuery, [matched], [null], req);
            return res.status(200).json({ source: 'demo', reason: 'key_missing', results: [matched] });
        }
        logSearch(cleanQuery, DEMO_RESULTS, DEMO_RESULTS.map(() => null), req);
        return res.status(200).json({
            source: 'demo',
            reason: 'key_missing',
            note: "Live search isn't configured yet — here are four real examples.",
            results: DEMO_RESULTS,
        });
    }
```

The replacement above already contains the full query-validation logic —
after this edit there should be exactly one copy of the `query`/`cleanQuery`
validation in the function, not two.

Then update the empty-results return (originally line 301, `return res.status(200).json({ results: [] });`) to:

```javascript
        return res.status(200).json({ source: 'live', reason: null, results: [] });
```

And update the final success return (originally line 333, `return res.status(200).json({ results: finalResults });`) to:

```javascript
    return res.status(200).json({ source: 'live', reason: null, results: finalResults });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/unit/locus-handler.spec.js --project=desktop`
Expected: PASS (2/2 tests)

- [ ] **Step 5: Commit**

```bash
git add api/locus-search.js tests/unit/locus-handler.spec.js
git commit -m "Route Locus to demo mode instead of 500 when key is missing"
```

---

### Task 3: `degraded` routing for live-call failures

**Files:**
- Modify: `api/locus-search.js` (the `try { ... searchPlaces ... } catch` block, originally lines 283-297, now shifted down slightly by Task 2's edits — find it by searching for `LOCUS_PLACES_ERROR` in the file)
- Modify: `tests/unit/locus-handler.spec.js` (extend from Task 2)

**Interfaces:**
- Consumes: `DEMO_RESULTS` from Task 1, `freshHandler`/`fakeReqRes` helpers from Task 2.
- Produces: the same envelope shape as Task 2, with `source: "degraded"` and a `reason` from the enum in Global Constraints.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/locus-handler.spec.js` (below the existing `test.describe('handler key_missing routing', ...)` block):

```javascript
test.describe('handler degraded routing', () => {
    test('returns degraded/key_invalid with fallback results when Places returns 401', async () => {
        const handler = freshHandler({ GOOGLE_PLACES_API_KEY: 'fake-invalid-key' });
        const realFetch = global.fetch;
        global.fetch = async (url) => {
            if (String(url).includes('places.googleapis.com')) {
                return { ok: false, status: 401, text: async () => 'invalid key' };
            }
            return realFetch(url);
        };
        try {
            const { req, res } = fakeReqRes('quiet coffee shop to work from near Capitol Hill');
            await handler(req, res);
            expect(res._status).toBe(200);
            expect(res._json.source).toBe('degraded');
            expect(res._json.reason).toBe('key_invalid');
            expect(res._json.results).toHaveLength(4);
        } finally {
            global.fetch = realFetch;
        }
    });

    test('returns degraded/places_rate_limited when Places returns 429', async () => {
        const handler = freshHandler({ GOOGLE_PLACES_API_KEY: 'fake-invalid-key' });
        const realFetch = global.fetch;
        global.fetch = async (url) => {
            if (String(url).includes('places.googleapis.com')) {
                return { ok: false, status: 429, text: async () => 'rate limited' };
            }
            return realFetch(url);
        };
        try {
            const { req, res } = fakeReqRes('quiet coffee shop to work from near Capitol Hill');
            await handler(req, res);
            expect(res._status).toBe(200);
            expect(res._json.source).toBe('degraded');
            expect(res._json.reason).toBe('places_rate_limited');
        } finally {
            global.fetch = realFetch;
        }
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/unit/locus-handler.spec.js --project=desktop`
Expected: FAIL — today's catch block returns `res._status === 503`/`502` with a bare `{error}` shape, not `source: "degraded"`.

- [ ] **Step 3: Implement degraded routing**

Find the catch block (search for `LOCUS_PLACES_ERROR` in `api/locus-search.js`). Replace:

```javascript
    } catch (err) {
        console.error('LOCUS_PLACES_ERROR', err.status || 'exception', err.message);
        if (err.status === 401 || err.status === 403) {
            return res.status(503).json({ error: 'Search temporarily unavailable' });
        }
        if (err.status === 429) {
            res.setHeader('Retry-After', '30');
            return res.status(503).json({ error: 'Search temporarily busy, try again shortly' });
        }
        return res.status(502).json({ error: 'Search failed' });
    }
```

with:

```javascript
    } catch (err) {
        console.error('LOCUS_PLACES_ERROR', err.status || 'exception', err.message);
        let reason = 'upstream_error';
        if (err.status === 401 || err.status === 403) {
            reason = 'key_invalid';
        } else if (err.status === 429) {
            reason = 'places_rate_limited';
        } else if (err.name === 'TimeoutError' || err.name === 'AbortError') {
            reason = 'timeout';
        }
        logSearch(cleanQuery, DEMO_RESULTS, DEMO_RESULTS.map(() => null), req);
        return res.status(200).json({ source: 'degraded', reason, results: DEMO_RESULTS });
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/unit/locus-handler.spec.js --project=desktop`
Expected: PASS (4/4 tests — the 2 from Task 2 plus these 2)

- [ ] **Step 5: Commit**

```bash
git add api/locus-search.js tests/unit/locus-handler.spec.js
git commit -m "Route Locus live-call failures to degraded mode instead of 5xx"
```

---

### Task 4: Frontend — demo chips + source caption

**Files:**
- Modify: `projects/locus/index.html`

**Interfaces:**
- Consumes: the `{source, reason, note?, results}` envelope from Tasks 2-3.
- Produces: a `runSearch(query)` JS function used by both the form submit handler and the new chip click handlers; a `#sourceCaption` element toggled by `source`.

- [ ] **Step 1: Add CSS for the chips and caption**

In `projects/locus/index.html`, insert this block immediately after the existing `.search-btn:disabled { opacity: 0.4; cursor: default; }` rule (before `.status-message`):

```css
        .demo-chips { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 2rem; }
        .demo-chips-label { font-size: 13px; opacity: 0.5; margin-right: 2px; }
        .demo-chip {
            font-family: var(--font);
            font-size: 13px;
            padding: 6px 14px;
            border: 1px solid var(--card-border);
            border-radius: 999px;
            background: transparent;
            color: var(--text);
            cursor: pointer;
            opacity: 0.75;
            transition: opacity 0.2s ease, border-color 0.2s ease;
        }
        .demo-chip:hover { opacity: 1; border-color: var(--text); }
        .demo-chip:disabled { opacity: 0.3; cursor: default; }

        .source-caption { font-size: 14px; opacity: 0.55; font-style: italic; padding: 0 0 0.75rem; }
```

- [ ] **Step 2: Add the chips markup and caption element**

Replace the existing search form + status/results block:

```html
        <form class="search-form" id="searchForm">
            <input type="text" class="search-input" id="searchInput"
                placeholder="quiet coffee shop to work from near Capitol Hill" maxlength="300" required>
            <button type="submit" class="search-btn" id="searchBtn">Search</button>
        </form>

        <div id="statusMessage" class="status-message" style="display:none;"></div>
        <div id="resultsList"></div>
```

with:

```html
        <form class="search-form" id="searchForm">
            <input type="text" class="search-input" id="searchInput"
                placeholder="quiet coffee shop to work from near Capitol Hill" maxlength="300" required>
            <button type="submit" class="search-btn" id="searchBtn">Search</button>
        </form>

        <div class="demo-chips" id="demoChips">
            <span class="demo-chips-label">Try:</span>
            <button type="button" class="demo-chip" data-query="quiet coffee shop to work from near Capitol Hill">quiet coffee shop to work from near Capitol Hill</button>
            <button type="button" class="demo-chip" data-query="date night ramen spot in Fremont">date night ramen spot in Fremont</button>
            <button type="button" class="demo-chip" data-query="a bar where you can actually hear people talk, in Ballard">a bar where you can actually hear people talk, in Ballard</button>
            <button type="button" class="demo-chip" data-query="best view brunch spot in downtown Seattle">best view brunch spot in downtown Seattle</button>
        </div>

        <div id="statusMessage" class="status-message" style="display:none;"></div>
        <div id="sourceCaption" class="source-caption" style="display:none;"></div>
        <div id="resultsList"></div>
```

- [ ] **Step 3: Refactor the search script to add `runSearch`, chip wiring, and caption rendering**

Replace the entire `<script>` block that currently starts with `(function() { var form = document.getElementById('searchForm');` through its closing `})();` with:

```html
    <script>
        (function() {
            var form = document.getElementById('searchForm');
            var input = document.getElementById('searchInput');
            var btn = document.getElementById('searchBtn');
            var statusEl = document.getElementById('statusMessage');
            var captionEl = document.getElementById('sourceCaption');
            var resultsEl = document.getElementById('resultsList');
            var chipsEl = document.getElementById('demoChips');

            function escapeHtml(str) {
                var div = document.createElement('div');
                div.appendChild(document.createTextNode(str));
                return div.innerHTML;
            }

            function priceLevelToDollars(level) {
                var map = {
                    PRICE_LEVEL_INEXPENSIVE: '$',
                    PRICE_LEVEL_MODERATE: '$$',
                    PRICE_LEVEL_EXPENSIVE: '$$$',
                    PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
                };
                return map[level] || '';
            }

            function showStatus(text) {
                statusEl.textContent = text;
                statusEl.style.display = '';
                captionEl.style.display = 'none';
                resultsEl.innerHTML = '';
            }

            function updateCaption(data) {
                if (data.source === 'demo') {
                    var text = "Demo data — live search isn't wired up yet. These four are real places with real ratings, frozen for now.";
                    if (data.note) text = data.note + ' ' + text;
                    captionEl.textContent = text;
                    captionEl.style.display = '';
                } else if (data.source === 'degraded') {
                    captionEl.textContent = "Live search hit a snag — here's a saved example while it recovers.";
                    captionEl.style.display = '';
                } else {
                    captionEl.textContent = '';
                    captionEl.style.display = 'none';
                }
            }

            function renderResults(results) {
                statusEl.style.display = 'none';
                resultsEl.innerHTML = '';
                if (!results.length) {
                    captionEl.style.display = 'none';
                    showStatus("Nothing matched. Either it doesn't exist or I parsed your query wrong — rephrasing usually helps.");
                    return;
                }
                results.forEach(function(r) {
                    var card = document.createElement('div');
                    card.className = 'result-card';
                    var metaParts = [];
                    if (r.rating != null) {
                        metaParts.push(r.rating.toFixed(1) + (r.userRatingCount != null ? ' (' + r.userRatingCount + ')' : ''));
                    }
                    var dollars = priceLevelToDollars(r.priceLevel);
                    if (dollars) metaParts.push(dollars);
                    card.innerHTML =
                        '<p class="result-name">' + escapeHtml(r.name) + '</p>'
                        + (metaParts.length ? '<p class="result-meta">' + escapeHtml(metaParts.join(' · ')) + '</p>' : '')
                        + (r.whyItFits ? '<p class="result-why">' + escapeHtml(r.whyItFits) + '</p>' : '')
                        + (r.address ? '<p class="result-address">' + escapeHtml(r.address) + '</p>' : '')
                        + (r.mapsUri ? '<a class="result-map-link" href="' + escapeHtml(r.mapsUri) + '" target="_blank" rel="noopener">View on Google Maps &rarr;</a>' : '');
                    resultsEl.appendChild(card);
                });
            }

            function runSearch(query) {
                input.value = query;
                btn.disabled = true;
                showStatus('Asking around…');
                fetch('/api/locus-search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: query }),
                })
                .then(function(res) {
                    if (!res.ok) throw new Error('request failed: ' + res.status);
                    return res.json();
                })
                .then(function(data) {
                    updateCaption(data);
                    renderResults(data.results || []);
                })
                .catch(function() {
                    captionEl.style.display = 'none';
                    showStatus('Something broke on my end — the model or the Places API. Give it a minute and try again.');
                })
                .finally(function() {
                    btn.disabled = false;
                });
            }

            form.addEventListener('submit', function(e) {
                e.preventDefault();
                var query = input.value.trim();
                if (!query) return;
                runSearch(query);
            });

            chipsEl.querySelectorAll('.demo-chip').forEach(function(chip) {
                chip.addEventListener('click', function() {
                    runSearch(chip.getAttribute('data-query'));
                });
            });
        })();
    </script>
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev` (starts `http-server` on :8080 per this repo's CLAUDE.md)
Open `http://localhost:8080/projects/locus` in a browser. Confirm: 4 chip buttons render below the search form, labeled "Try:" followed by each query. Clicking a chip immediately shows "Asking around…" then either results or a network error (since `npm run dev` cannot execute `api/*.js` — a fetch failure here is expected and fine, this step only verifies the chips render and are clickable, not the full round trip; Task 5's smoke tests cover the full response handling with mocked routes).

- [ ] **Step 5: Commit**

```bash
git add projects/locus/index.html
git commit -m "Add Locus demo chips and source caption"
```

---

### Task 5: Smoke test coverage for the three source states

**Files:**
- Modify: `tests/smoke/locus.spec.js`

**Interfaces:**
- Consumes: `projects/locus/index.html`'s `#demoChips .demo-chip`, `#sourceCaption` elements from Task 4, and the `{source, reason, note?, results}` envelope from Tasks 2-3.

- [ ] **Step 1: Read the existing file to match its conventions**

Run: `cat tests/smoke/locus.spec.js` (or Read it) to confirm the existing `page.route()` mocking pattern used for the mocked-results/empty-state/error-state tests already in this file — match that exact style (same helper functions, same `test.describe` structure) rather than introducing a new pattern.

- [ ] **Step 2: Write the failing tests**

Add to `tests/smoke/locus.spec.js`, inside the existing `test.describe` block (adjust the exact mocking helper names to match whatever the file already uses for `page.route('**/api/locus-search', ...)`):

```javascript
test('renders the demo caption and results when source is demo', async ({ page }) => {
    await page.route('**/api/locus-search', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                source: 'demo',
                reason: 'key_missing',
                results: [{
                    name: 'Espresso Vivace Roasteria',
                    address: '532 Broadway E, Seattle, WA 98102',
                    rating: 4.5,
                    userRatingCount: 1515,
                    priceLevel: 'PRICE_LEVEL_INEXPENSIVE',
                    mapsUri: 'https://www.google.com/maps/search/?api=1&query=Espresso+Vivace',
                    whyItFits: 'A quiet Capitol Hill fixture.',
                }],
            }),
        });
    });
    await page.goto('/projects/locus');
    await page.locator('#searchInput').fill('quiet coffee shop to work from near Capitol Hill');
    await page.locator('#searchBtn').click();
    await expect(page.locator('#sourceCaption')).toBeVisible();
    await expect(page.locator('#sourceCaption')).toContainText('Demo data');
    await expect(page.locator('.result-name')).toContainText('Espresso Vivace Roasteria');
});

test('renders the degraded caption when source is degraded', async ({ page }) => {
    await page.route('**/api/locus-search', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                source: 'degraded',
                reason: 'key_invalid',
                results: [{
                    name: 'Ooink', address: '3630 Stone Way N, Seattle, WA 98103',
                    rating: 4.3, userRatingCount: 285, priceLevel: 'PRICE_LEVEL_MODERATE',
                    mapsUri: 'https://www.google.com/maps/search/?api=1&query=Ooink',
                    whyItFits: 'A mid-priced ramen counter.',
                }],
            }),
        });
    });
    await page.goto('/projects/locus');
    await page.locator('#searchInput').fill('date night ramen spot in Fremont');
    await page.locator('#searchBtn').click();
    await expect(page.locator('#sourceCaption')).toBeVisible();
    await expect(page.locator('#sourceCaption')).toContainText('Live search hit a snag');
});

test('hides the caption when source is live', async ({ page }) => {
    await page.route('**/api/locus-search', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                source: 'live',
                reason: null,
                results: [{
                    name: 'Real Live Place', address: '123 Main St, Seattle, WA',
                    rating: 4.8, userRatingCount: 99, priceLevel: 'PRICE_LEVEL_MODERATE',
                    mapsUri: 'https://www.google.com/maps/search/?api=1&query=Real+Live+Place',
                    whyItFits: 'Genuinely live.',
                }],
            }),
        });
    });
    await page.goto('/projects/locus');
    await page.locator('#searchInput').fill('anything');
    await page.locator('#searchBtn').click();
    await expect(page.locator('.result-name')).toContainText('Real Live Place');
    await expect(page.locator('#sourceCaption')).toBeHidden();
});

test('clicking a demo chip populates the input and submits immediately', async ({ page }) => {
    await page.route('**/api/locus-search', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                source: 'demo',
                reason: 'key_missing',
                results: [{
                    name: 'The Ballard Smoke Shop', address: '5439 Ballard Ave NW, Seattle, WA 98107',
                    rating: 4.4, userRatingCount: 452, priceLevel: 'PRICE_LEVEL_INEXPENSIVE',
                    mapsUri: 'https://www.google.com/maps/search/?api=1&query=Ballard+Smoke+Shop',
                    whyItFits: 'A family-run dive bar since 1971.',
                }],
            }),
        });
    });
    await page.goto('/projects/locus');
    await page.locator('.demo-chip', { hasText: 'Ballard' }).click();
    await expect(page.locator('#searchInput')).toHaveValue('a bar where you can actually hear people talk, in Ballard');
    await expect(page.locator('.result-name')).toContainText('The Ballard Smoke Shop');
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx playwright test tests/smoke/locus.spec.js --project=desktop`
Expected: FAIL — `#demoChips`/`#sourceCaption` don't exist / `.demo-chip` locator finds 0 elements (this is expected only if Task 4 hasn't run yet; if Tasks 1-4 are already committed by the time this task runs, these should instead PASS immediately in Step 3 — in that case skip straight to Step 4's confirmation and note in your report that Steps 1-3 validated against already-implemented code rather than driving new implementation, since this task is test-only and depends on Tasks 2-4 being complete first).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/smoke/locus.spec.js --project=desktop`
Expected: PASS (all tests in the file, including the 3 pre-existing ones plus the 4 new ones)

- [ ] **Step 5: Commit**

```bash
git add tests/smoke/locus.spec.js
git commit -m "Add smoke tests for Locus demo/degraded/live source states"
```

---

## Final verification (whole-plan)

Run the full local suite before final review:

```bash
npx playwright test --project=desktop
```

Expected: all tests pass, including `tests/unit/locus-demo.spec.js`, `tests/unit/locus-handler.spec.js`, `tests/unit/locus-parsing.spec.js`, and the updated `tests/smoke/locus.spec.js`.
