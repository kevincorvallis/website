# Trending Places Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Locus's Google-Places-dependent live search entirely with a weekly-refreshed database of real, Gemini-Search-grounded trending places across 3 cities × 4 categories — unblocking genuinely live search today with no GCP billing ever required.

**Architecture:** A new Vercel Cron endpoint (`api/cron/refresh-trending-places.js`) researches trending places weekly via Gemini's Search-grounding feature and upserts them into a new Supabase `trending_places` table. `api/locus-search.js`'s existing handler gets rewired to query this table instead of Google Places API — `searchPlaces()`/`GOOGLE_PLACES_API_KEY`/`PLACES_FIELD_MASK` are removed entirely, not deprecated alongside the old code. The existing demo-mode fallback (`DEMO_PLACES`/`findDemoMatch`/the `{source, reason, results}` envelope) is preserved unchanged as the safety net for out-of-scope queries, empty trending data, or a DB outage.

**Tech Stack:** Vercel serverless functions + Vercel Cron, Gemini Developer API (Search grounding), Supabase (Postgres via PostgREST), Playwright for tests.

## Global Constraints

- `GEMINI_API_KEY` is a **personal** Google account key from aistudio.google.com — never Paramount's Vertex AI credentials. This is a hard constraint from the spec's own framing, not a style preference.
- Never fabricate place data. The weekly research prompt must instruct the model to omit (not guess) any field it can't point to a specific search result for. `rating`/`address`/`price_level` are nullable in the schema for exactly this reason.
- 3 cities (`seattle`, `la`, `ny`) × 4 categories (`coffee`, `ramen`, `bars`, `brunch`) is the fixed scope for v1 — a query outside this matrix falls to the existing demo dataset, not an error.
- HTTP status stays `200` for every non-`400`/`429`/`401` response from `/api/locus-search`, matching the existing envelope convention. The new cron endpoint returns `401` for a missing/wrong `CRON_SECRET` — that's a different endpoint with different callers (Vercel Cron, not a browser), a bare `401` is appropriate there.
- No new dependencies. Plain `fetch()` for both the Gemini and Supabase REST calls, matching every existing pattern in this codebase.
- Real external calls (Gemini, Supabase) are mocked in every automated test — matches this repo's established convention. The one real, live verification is a manual one-time invocation of the cron endpoint after shipping (documented in the spec §6, not a task here).

---

### Task 1: Supabase migration

**Files:**
- Create: `supabase/migrations/20260713000000_create_trending_places.sql`

**Interfaces:**
- Produces: `trending_places` table (columns: `id, city, category, name, address, rating, review_count, price_level, maps_uri, why_trending, source_url, last_confirmed_at, created_at`, `UNIQUE (city, name)`) and `trending_places_runs` table (`id, run_at, places_found, places_updated, errors, duration_ms`) — later tasks' code depends on these exact column names.

This migration is written but not applied by any implementer — matches this repo's established convention (every prior migration in `supabase/migrations/` is a manual, Kevin-only apply step). There is no automated test for a SQL file; "testing" here means matching the existing migration files' style exactly.

- [ ] **Step 1: Read an existing migration for style conventions**

Read `supabase/migrations/20260711000000_create_locus_searches.sql` in full to match its exact formatting conventions (comment style, RLS-enabling syntax, column ordering style) before writing the new file.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260713000000_create_trending_places.sql`:

```sql
CREATE TABLE trending_places (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  city text NOT NULL,              -- 'seattle' | 'la' | 'ny'
  category text NOT NULL,          -- 'coffee' | 'ramen' | 'bars' | 'brunch'
  name text NOT NULL,
  address text,                    -- nullable: omitted if the weekly research
                                    -- couldn't confirm it from a real source
  rating numeric,                  -- nullable, same reason
  review_count integer,            -- nullable, same reason
  price_level text,                -- nullable, same reason; matches the
                                    -- PRICE_LEVEL_* enum used elsewhere in
                                    -- api/locus-search.js
  maps_uri text NOT NULL,          -- always constructed server-side, never
                                    -- trusted from the model's own output
  why_trending text,
  source_url text NOT NULL,        -- the specific search result being cited
  last_confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city, name)
);

ALTER TABLE trending_places ENABLE ROW LEVEL SECURITY;

CREATE TABLE trending_places_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_at timestamptz NOT NULL DEFAULT now(),
  places_found integer,
  places_updated integer,
  errors jsonb,
  duration_ms integer
);

ALTER TABLE trending_places_runs ENABLE ROW LEVEL SECURITY;
```

No anon policies on either table — matches every other table in this repo (service-role-key-only writes from serverless functions, same as `locus_searches`/`chat_logs`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260713000000_create_trending_places.sql
git commit -m "Add trending_places + trending_places_runs migration"
```

---

### Task 2: Gemini Search-grounding research function

**Files:**
- Create: `api/cron/refresh-trending-places.js`
- Test: `tests/unit/trending-research.spec.js`

**Interfaces:**
- Produces: `researchTrendingPlaces(city, category): Promise<Array<{city, category, name, address, rating, review_count, price_level, maps_uri, why_trending, source_url}>>` — Task 3 calls this directly; the return shape's field names match `trending_places`' columns exactly (snake_case), since Task 3 posts these objects straight to Supabase.
- Exported (for the test file to `require()`): `researchTrendingPlaces`, `extractJsonArray`, `normalizeTrendingPlace`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/trending-research.spec.js`:

```javascript
const { test, expect } = require('@playwright/test');

const MODULE_PATH = require.resolve('../../api/cron/refresh-trending-places.js');

function freshModule(envOverrides) {
    delete require.cache[MODULE_PATH];
    Object.assign(process.env, envOverrides);
    return require(MODULE_PATH);
}

test.describe('extractJsonArray', () => {
    test('parses a clean JSON array string', () => {
        const mod = freshModule({});
        const result = mod.extractJsonArray('[{"name":"Test"}]');
        expect(result).toEqual([{ name: 'Test' }]);
    });

    test('extracts a JSON array embedded in surrounding prose', () => {
        const mod = freshModule({});
        const result = mod.extractJsonArray('Here you go:\n[{"name":"Test"}]\nHope that helps!');
        expect(result).toEqual([{ name: 'Test' }]);
    });

    test('returns null for text with no JSON array', () => {
        const mod = freshModule({});
        expect(mod.extractJsonArray('no json here')).toBeNull();
    });

    test('returns null for empty/undefined input', () => {
        const mod = freshModule({});
        expect(mod.extractJsonArray('')).toBeNull();
        expect(mod.extractJsonArray(undefined)).toBeNull();
    });
});

test.describe('normalizeTrendingPlace', () => {
    test('passes through a fully valid place, building maps_uri from name+address', () => {
        const mod = freshModule({});
        const result = mod.normalizeTrendingPlace(
            { name: 'Test Cafe', address: '123 Main St', rating: 4.5, reviewCount: 200, priceLevel: 'PRICE_LEVEL_MODERATE', whyTrending: 'Great coffee.', sourceUrl: 'https://example.com/review' },
            'seattle', 'coffee'
        );
        expect(result).toEqual({
            city: 'seattle',
            category: 'coffee',
            name: 'Test Cafe',
            address: '123 Main St',
            rating: 4.5,
            review_count: 200,
            price_level: 'PRICE_LEVEL_MODERATE',
            maps_uri: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Test Cafe, 123 Main St'),
            why_trending: 'Great coffee.',
            source_url: 'https://example.com/review',
        });
    });

    test('omits (nulls) rating/address/priceLevel the model did not provide, never guesses', () => {
        const mod = freshModule({});
        const result = mod.normalizeTrendingPlace(
            { name: 'Mystery Spot', whyTrending: 'Mentioned a lot lately.', sourceUrl: 'https://example.com/x' },
            'la', 'bars'
        );
        expect(result.address).toBeNull();
        expect(result.rating).toBeNull();
        expect(result.review_count).toBeNull();
        expect(result.price_level).toBeNull();
        expect(result.maps_uri).toBe('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Mystery Spot, Los Angeles'));
    });

    test('drops an out-of-range rating rather than passing it through', () => {
        const mod = freshModule({});
        const result = mod.normalizeTrendingPlace(
            { name: 'Test', rating: 9.9, sourceUrl: 'https://example.com/x' },
            'ny', 'ramen'
        );
        expect(result.rating).toBeNull();
    });

    test('drops an invalid priceLevel value rather than passing it through', () => {
        const mod = freshModule({});
        const result = mod.normalizeTrendingPlace(
            { name: 'Test', priceLevel: 'FREE', sourceUrl: 'https://example.com/x' },
            'ny', 'ramen'
        );
        expect(result.price_level).toBeNull();
    });
});

test.describe('researchTrendingPlaces', () => {
    test('parses a valid Gemini grounded response into normalized places', async () => {
        const mod = freshModule({ GEMINI_API_KEY: 'fake-key' });
        const realFetch = global.fetch;
        global.fetch = async () => ({
            ok: true,
            json: async () => ({
                candidates: [{
                    content: {
                        parts: [{
                            text: JSON.stringify([
                                { name: 'Real Coffee Co', address: '1 Pine St', rating: 4.7, reviewCount: 500, priceLevel: 'PRICE_LEVEL_MODERATE', whyTrending: 'New opening getting buzz.', sourceUrl: 'https://example.com/a' },
                            ]),
                        }],
                    },
                }],
            }),
        });
        try {
            const result = await mod.researchTrendingPlaces('seattle', 'coffee');
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Real Coffee Co');
            expect(result[0].city).toBe('seattle');
            expect(result[0].category).toBe('coffee');
        } finally {
            global.fetch = realFetch;
        }
    });

    test('filters out entries missing required name/sourceUrl fields', async () => {
        const mod = freshModule({ GEMINI_API_KEY: 'fake-key' });
        const realFetch = global.fetch;
        global.fetch = async () => ({
            ok: true,
            json: async () => ({
                candidates: [{
                    content: {
                        parts: [{
                            text: JSON.stringify([
                                { name: 'Valid Place', sourceUrl: 'https://example.com/a' },
                                { address: 'no name here', sourceUrl: 'https://example.com/b' },
                                { name: 'No source url' },
                            ]),
                        }],
                    },
                }],
            }),
        });
        try {
            const result = await mod.researchTrendingPlaces('seattle', 'coffee');
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Valid Place');
        } finally {
            global.fetch = realFetch;
        }
    });

    test('throws with a status when the Gemini API call fails', async () => {
        const mod = freshModule({ GEMINI_API_KEY: 'fake-key' });
        const realFetch = global.fetch;
        global.fetch = async () => ({ ok: false, status: 429, text: async () => 'rate limited' });
        try {
            await expect(mod.researchTrendingPlaces('seattle', 'coffee')).rejects.toThrow();
        } finally {
            global.fetch = realFetch;
        }
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/unit/trending-research.spec.js --project=desktop`
Expected: FAIL — `api/cron/refresh-trending-places.js` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `api/cron/refresh-trending-places.js`:

```javascript
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const CITIES = ['seattle', 'la', 'ny'];
const CATEGORIES = ['coffee', 'ramen', 'bars', 'brunch'];

const CITY_NAMES = { seattle: 'Seattle', la: 'Los Angeles', ny: 'New York City' };
const CATEGORY_NAMES = { coffee: 'coffee shops', ramen: 'ramen restaurants', bars: 'bars', brunch: 'brunch spots' };

const VALID_PRICE_LEVELS = [
    'PRICE_LEVEL_INEXPENSIVE',
    'PRICE_LEVEL_MODERATE',
    'PRICE_LEVEL_EXPENSIVE',
    'PRICE_LEVEL_VERY_EXPENSIVE',
];

function researchPrompt(city, category) {
    return `Search for currently trending or notable ${CATEGORY_NAMES[category]} in ${CITY_NAMES[city]}.

Report ONLY places you can point to a specific search result for. Never guess or invent a rating, price, or address you did not find explicitly stated in a source — omit that field (use null) instead.

Output a strict JSON array (no markdown, no explanation) with this shape:
[
  {
    "name": string,
    "address": string or null,
    "rating": number or null,
    "reviewCount": number or null,
    "priceLevel": "PRICE_LEVEL_INEXPENSIVE" | "PRICE_LEVEL_MODERATE" | "PRICE_LEVEL_EXPENSIVE" | "PRICE_LEVEL_VERY_EXPENSIVE" | null,
    "whyTrending": string,
    "sourceUrl": string
  }
]

Return between 3 and 8 places. If you cannot find any genuinely trending or notable places for this category and city, return an empty array [].`;
}

function extractJsonArray(text) {
    if (!text) return null;
    try {
        return JSON.parse(text.trim());
    } catch { /* fall through to substring extraction */ }
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
        try {
            return JSON.parse(match[0]);
        } catch { /* give up below */ }
    }
    return null;
}

// Allowlist/never-guess enforcement: only fields explicitly present and
// valid in the model's output pass through; everything else is null. This
// mirrors api/locus-search.js's normalizeParsedParams allowlist pattern.
function normalizeTrendingPlace(p, city, category) {
    const address = typeof p.address === 'string' && p.address.trim() ? p.address.trim().slice(0, 300) : null;
    return {
        city,
        category,
        name: p.name.trim().slice(0, 200),
        address,
        rating: typeof p.rating === 'number' && p.rating >= 1 && p.rating <= 5 ? p.rating : null,
        review_count: typeof p.reviewCount === 'number' && p.reviewCount >= 0 ? p.reviewCount : null,
        price_level: VALID_PRICE_LEVELS.includes(p.priceLevel) ? p.priceLevel : null,
        // Always constructed server-side from name+address (or name+city if
        // address is missing) — never trust a model-provided link, matching
        // the DEMO_PLACES pattern already established in api/locus-search.js.
        maps_uri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            address ? `${p.name.trim()}, ${address}` : `${p.name.trim()}, ${CITY_NAMES[city]}`
        )}`,
        why_trending: typeof p.whyTrending === 'string' ? p.whyTrending.trim().slice(0, 500) : null,
        source_url: p.sourceUrl.trim().slice(0, 500),
    };
}

async function researchTrendingPlaces(city, category) {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
            contents: [{ parts: [{ text: researchPrompt(city, category) }] }],
            tools: [{ google_search: {} }],
        }),
        signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
        const errBody = await res.text();
        const err = new Error('Gemini API error');
        err.status = res.status;
        err.body = errBody.slice(0, 300);
        throw err;
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = extractJsonArray(text);
    if (!Array.isArray(parsed)) return [];
    return parsed
        .filter((p) => p && typeof p.name === 'string' && p.name.trim() && typeof p.sourceUrl === 'string' && p.sourceUrl.trim())
        .slice(0, 8)
        .map((p) => normalizeTrendingPlace(p, city, category));
}

module.exports.researchTrendingPlaces = researchTrendingPlaces;
module.exports.extractJsonArray = extractJsonArray;
module.exports.normalizeTrendingPlace = normalizeTrendingPlace;
module.exports.CITIES = CITIES;
module.exports.CATEGORIES = CATEGORIES;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/unit/trending-research.spec.js --project=desktop`
Expected: PASS (10/10 tests)

- [ ] **Step 5: Commit**

```bash
git add api/cron/refresh-trending-places.js tests/unit/trending-research.spec.js
git commit -m "Add Gemini Search-grounding research function for trending places"
```

---

### Task 3: Cron auth, upsert, and orchestration

**Files:**
- Modify: `api/cron/refresh-trending-places.js` (extend from Task 2)
- Test: `tests/unit/trending-cron.spec.js` (new file — separate from Task 2's test, which stays scoped to the pure research/parsing functions)

**Interfaces:**
- Consumes: `researchTrendingPlaces`, `CITIES`, `CATEGORIES` from Task 2.
- Produces: the exported `handler` (Vercel serverless function default export) that Vercel Cron will invoke; `upsertTrendingPlace(place): Promise<boolean>` (returns whether the place was newly inserted) and `logRun(summary)` as named exports, for the test file to exercise directly.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/trending-cron.spec.js`:

```javascript
const { test, expect } = require('@playwright/test');

const MODULE_PATH = require.resolve('../../api/cron/refresh-trending-places.js');

function freshModule(envOverrides) {
    delete require.cache[MODULE_PATH];
    Object.assign(process.env, envOverrides);
    return require(MODULE_PATH);
}

function fakeReqRes(headers) {
    const req = { method: 'GET', headers: headers || {} };
    const res = {
        _status: 200,
        _json: null,
        status(code) { this._status = code; return this; },
        json(obj) { this._json = obj; return this; },
    };
    return { req, res };
}

test.describe('cron auth check', () => {
    test('rejects a request with no Authorization header', async () => {
        const mod = freshModule({ CRON_SECRET: 'test-secret', GEMINI_API_KEY: '', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' });
        const { req, res } = fakeReqRes({});
        await mod.handler(req, res);
        expect(res._status).toBe(401);
    });

    test('rejects a request with the wrong secret', async () => {
        const mod = freshModule({ CRON_SECRET: 'test-secret' });
        const { req, res } = fakeReqRes({ authorization: 'Bearer wrong-secret' });
        await mod.handler(req, res);
        expect(res._status).toBe(401);
    });

    test('rejects any request if CRON_SECRET itself is not configured', async () => {
        const mod = freshModule({ CRON_SECRET: '' });
        const { req, res } = fakeReqRes({ authorization: 'Bearer anything' });
        await mod.handler(req, res);
        expect(res._status).toBe(401);
    });
});

test.describe('upsertTrendingPlace', () => {
    test('returns true (new) when no existing row is found, and POSTs the upsert', async () => {
        const mod = freshModule({ SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake-key' });
        const calls = [];
        const realFetch = global.fetch;
        global.fetch = async (url, opts) => {
            calls.push({ url: String(url), method: opts && opts.method });
            if (String(url).includes('select=id')) {
                return { ok: true, json: async () => [] };
            }
            return { ok: true, json: async () => ({}) };
        };
        try {
            const isNew = await mod.upsertTrendingPlace({ city: 'seattle', name: 'Test Place', category: 'coffee', maps_uri: 'https://x', source_url: 'https://y' });
            expect(isNew).toBe(true);
            expect(calls.some((c) => c.method === 'POST')).toBe(true);
        } finally {
            global.fetch = realFetch;
        }
    });

    test('returns false (existing) when a prior row is found', async () => {
        const mod = freshModule({ SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake-key' });
        const realFetch = global.fetch;
        global.fetch = async (url) => {
            if (String(url).includes('select=id')) {
                return { ok: true, json: async () => [{ id: 42 }] };
            }
            return { ok: true, json: async () => ({}) };
        };
        try {
            const isNew = await mod.upsertTrendingPlace({ city: 'seattle', name: 'Test Place', category: 'coffee', maps_uri: 'https://x', source_url: 'https://y' });
            expect(isNew).toBe(false);
        } finally {
            global.fetch = realFetch;
        }
    });

    test('throws when the upsert POST itself fails', async () => {
        const mod = freshModule({ SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake-key' });
        const realFetch = global.fetch;
        global.fetch = async (url) => {
            if (String(url).includes('select=id')) return { ok: true, json: async () => [] };
            return { ok: false, status: 500, text: async () => 'db error' };
        };
        try {
            await expect(mod.upsertTrendingPlace({ city: 'seattle', name: 'X', category: 'coffee', maps_uri: 'https://x', source_url: 'https://y' })).rejects.toThrow();
        } finally {
            global.fetch = realFetch;
        }
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/unit/trending-cron.spec.js --project=desktop`
Expected: FAIL — `mod.handler`/`mod.upsertTrendingPlace` don't exist yet.

- [ ] **Step 3: Implement auth, upsert, run logging, and orchestration**

Append to `api/cron/refresh-trending-places.js` (after the `module.exports.CATEGORIES = CATEGORIES;` line from Task 2):

```javascript
const CRON_SECRET = process.env.CRON_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function upsertTrendingPlace(place) {
    const existingRes = await fetch(
        `${SUPABASE_URL}/rest/v1/trending_places?city=eq.${encodeURIComponent(place.city)}&name=eq.${encodeURIComponent(place.name)}&select=id`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const existingRows = existingRes.ok ? await existingRes.json() : [];
    const isNew = existingRows.length === 0;

    const res = await fetch(`${SUPABASE_URL}/rest/v1/trending_places?on_conflict=city,name`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({ ...place, last_confirmed_at: new Date().toISOString() }),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Supabase upsert failed: ${res.status} ${body.slice(0, 200)}`);
    }
    return isNew;
}

function logRun(summary) {
    if (!SUPABASE_URL || !SUPABASE_KEY) return Promise.resolve();
    return fetch(`${SUPABASE_URL}/rest/v1/trending_places_runs`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify(summary),
    }).catch((err) => console.error('TRENDING_RUN_LOG_ERROR', err.message));
}

async function handler(req, res) {
    const authHeader = req.headers['authorization'];
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const startTime = Date.now();
    let placesFound = 0;
    let placesUpdated = 0;
    const errors = [];

    for (const city of CITIES) {
        for (const category of CATEGORIES) {
            try {
                const places = await researchTrendingPlaces(city, category);
                placesFound += places.length;
                for (const place of places) {
                    try {
                        await upsertTrendingPlace(place);
                        placesUpdated++;
                    } catch (err) {
                        errors.push({ city, category, place: place.name, error: err.message });
                    }
                }
            } catch (err) {
                console.error('TRENDING_RESEARCH_ERROR', city, category, err.message);
                errors.push({ city, category, error: err.message });
            }
        }
    }

    await logRun({
        places_found: placesFound,
        places_updated: placesUpdated,
        errors: errors.length ? errors : null,
        duration_ms: Date.now() - startTime,
    });

    return res.status(200).json({ placesFound, placesUpdated, errors: errors.length });
}

module.exports.upsertTrendingPlace = upsertTrendingPlace;
module.exports.logRun = logRun;
module.exports.handler = handler;
module.exports.default = handler;
```

(Vercel serverless functions expect the handler as the module's default export — `module.exports.default = handler` covers that, while `module.exports.handler` lets the test file call it directly by name without relying on a specific export convention.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/unit/trending-cron.spec.js --project=desktop`
Expected: PASS (6/6 tests)

- [ ] **Step 5: Commit**

```bash
git add api/cron/refresh-trending-places.js tests/unit/trending-cron.spec.js
git commit -m "Add cron auth, upsert, and orchestration for trending places refresh"
```

---

### Task 4: `queryTrendingPlaces` + `trendingRowToResult` in `api/locus-search.js`

**Files:**
- Modify: `api/locus-search.js` (insert after the existing `placeToResult` function, i.e. after line 171 in the current file — **do not remove `placeToResult`, `searchPlaces`, `GOOGLE_PLACES_API_KEY`, or `PLACES_FIELD_MASK` in this task** — those are removed in Task 5, in the same task that rewires the handler to stop calling them, so the file stays in a working state after every task)
- Test: `tests/unit/trending-query.spec.js` (new file)

**Interfaces:**
- Produces: `queryTrendingPlaces(city, category): Promise<Array<row>>` where each `row` has the exact `trending_places` column names (`id, city, category, name, address, rating, review_count, price_level, maps_uri, why_trending, source_url, last_confirmed_at`) — Task 5's handler consumes this directly. `trendingRowToResult(row, whyItFits): {name, address, rating, userRatingCount, priceLevel, mapsUri, whyItFits, lastConfirmedAt}` — Task 5 uses this in place of the old `placeToResult`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/trending-query.spec.js`:

```javascript
const { test, expect } = require('@playwright/test');

const MODULE_PATH = require.resolve('../../api/locus-search.js');

function freshModule(envOverrides) {
    delete require.cache[MODULE_PATH];
    Object.assign(process.env, envOverrides);
    return require(MODULE_PATH);
}

test.describe('queryTrendingPlaces', () => {
    test('queries Supabase filtered by city and category, returns rows', async () => {
        const mod = freshModule({ SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake-key' });
        let capturedUrl = null;
        const realFetch = global.fetch;
        global.fetch = async (url) => {
            capturedUrl = String(url);
            return { ok: true, json: async () => [{ id: 1, city: 'seattle', category: 'coffee', name: 'Test Cafe' }] };
        };
        try {
            const result = await mod.queryTrendingPlaces('seattle', 'coffee');
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Test Cafe');
            expect(capturedUrl).toContain('city=eq.seattle');
            expect(capturedUrl).toContain('category=eq.coffee');
        } finally {
            global.fetch = realFetch;
        }
    });

    test('throws with a status when the query fails', async () => {
        const mod = freshModule({ SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake-key' });
        const realFetch = global.fetch;
        global.fetch = async () => ({ ok: false, status: 503, text: async () => 'unavailable' });
        try {
            await expect(mod.queryTrendingPlaces('seattle', 'coffee')).rejects.toThrow();
        } finally {
            global.fetch = realFetch;
        }
    });
});

test.describe('trendingRowToResult', () => {
    test('maps a DB row to the results[] item shape, carrying whyItFits and lastConfirmedAt', () => {
        const mod = freshModule({});
        const row = {
            name: 'Test Cafe', address: '1 Main St', rating: 4.5, review_count: 100,
            price_level: 'PRICE_LEVEL_MODERATE', maps_uri: 'https://maps.example/x',
            last_confirmed_at: '2026-07-06T08:00:00Z',
        };
        const result = mod.trendingRowToResult(row, 'Great vibe.');
        expect(result).toEqual({
            name: 'Test Cafe', address: '1 Main St', rating: 4.5, userRatingCount: 100,
            priceLevel: 'PRICE_LEVEL_MODERATE', mapsUri: 'https://maps.example/x',
            whyItFits: 'Great vibe.', lastConfirmedAt: '2026-07-06T08:00:00Z',
        });
    });

    test('handles null fields gracefully (never fabricates a value)', () => {
        const mod = freshModule({});
        const row = { name: 'Minimal Place', maps_uri: 'https://maps.example/y', last_confirmed_at: '2026-07-06T08:00:00Z' };
        const result = mod.trendingRowToResult(row, null);
        expect(result.address).toBe('');
        expect(result.rating).toBeNull();
        expect(result.userRatingCount).toBeNull();
        expect(result.priceLevel).toBeNull();
        expect(result.whyItFits).toBeNull();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/unit/trending-query.spec.js --project=desktop`
Expected: FAIL — `queryTrendingPlaces`/`trendingRowToResult` don't exist yet.

- [ ] **Step 3: Write the implementation**

In `api/locus-search.js`, insert this block immediately after the `placeToResult` function (after its closing `}` on line 171, before the `// Real places, independently web-searched...` comment that starts the `DEMO_PLACES` block):

```javascript
const CITIES = ['seattle', 'la', 'ny'];
const CATEGORIES = ['coffee', 'ramen', 'bars', 'brunch'];

async function queryTrendingPlaces(city, category) {
    const url = `${SUPABASE_URL}/rest/v1/trending_places?city=eq.${encodeURIComponent(city)}&category=eq.${encodeURIComponent(category)}&order=last_confirmed_at.desc&limit=10`;
    const res = await fetch(url, {
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
        const body = await res.text();
        const err = new Error('Trending places query failed');
        err.status = res.status;
        err.body = body.slice(0, 300);
        throw err;
    }
    return res.json();
}

function trendingRowToResult(row, whyItFits) {
    return {
        name: row.name,
        address: row.address || '',
        rating: row.rating ?? null,
        userRatingCount: row.review_count ?? null,
        priceLevel: row.price_level || null,
        mapsUri: row.maps_uri || null,
        whyItFits: whyItFits || null,
        lastConfirmedAt: row.last_confirmed_at,
    };
}
```

Then add these two lines to the `module.exports` block at the bottom of the file (after the existing `module.exports.DEMO_RESULTS = DEMO_RESULTS;` line):

```javascript
module.exports.queryTrendingPlaces = queryTrendingPlaces;
module.exports.trendingRowToResult = trendingRowToResult;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/unit/trending-query.spec.js --project=desktop`
Expected: PASS (4/4 tests)

- [ ] **Step 5: Commit**

```bash
git add api/locus-search.js tests/unit/trending-query.spec.js
git commit -m "Add queryTrendingPlaces + trendingRowToResult (additive, not yet wired in)"
```

---

### Task 5: Rewire the handler; remove Google Places entirely

**Files:**
- Modify: `api/locus-search.js` (the `PARSE_SYSTEM_PROMPT`, `normalizeParsedParams`, `rankPlaces`, and `handler` — plus deleting `GOOGLE_PLACES_API_KEY`, `PLACES_FIELD_MASK`, `searchPlaces`, `placeToResult` entirely)
- Modify: `tests/unit/locus-parsing.spec.js` (existing file — update for the new `city`/`category` fields)
- Modify: `tests/unit/locus-handler.spec.js` (existing file — the old `key_missing`/Google-Places-degraded tests no longer apply; replace with tests for the new out-of-scope/no-trending-data/degraded paths)

**Interfaces:**
- Consumes: `queryTrendingPlaces`, `trendingRowToResult`, `CITIES`, `CATEGORIES` from Task 4; `findDemoMatch`, `DEMO_RESULTS` (unchanged, from the 2026-07-11 work).
- Produces: the handler's final response envelope gains two new `reason` values (`"out_of_scope"`, `"no_trending_data"`), both mapping to `source: "demo"`. The old `"key_missing"` reason value is retired (nothing produces it anymore — `GOOGLE_PLACES_API_KEY` no longer exists in this file).

**Gotcha worth knowing before writing this task's code:** the existing `RANK_SYSTEM_PROMPT` declares `"id": "string"` in its output schema, and the old code's candidates always had string Places-API ids, so `Map.get()` lookups worked cleanly. `trending_places` rows have **numeric** `bigint` ids. A JS `Map` does no type coercion — `map.get(42)` and `map.get("42")` are different keys. If the rank LLM echoes an id back as a JSON number while the map was built with the raw number, or vice versa, lookups can silently fail (every result filtered out via `.filter(Boolean)`, producing an empty result set for a query that had real candidates). The fix below coerces both sides to `String(...)` consistently — don't skip this.

- [ ] **Step 1: Write the failing tests for the parse-prompt extension**

Read the current `tests/unit/locus-parsing.spec.js` in full first, to see its exact existing test structure before adding to it. Then add these tests to its `normalizeParsedParams` describe block:

```javascript
test('infers a valid city and category, passing them through', () => {
    const result = normalizeParsedParams({ searchText: 'test', city: 'la', category: 'ramen' }, 'fallback');
    expect(result.city).toBe('la');
    expect(result.category).toBe('ramen');
});

test('defaults city to seattle when missing or invalid', () => {
    const result1 = normalizeParsedParams({ searchText: 'test', category: 'coffee' }, 'fallback');
    expect(result1.city).toBe('seattle');
    const result2 = normalizeParsedParams({ searchText: 'test', city: 'chicago', category: 'coffee' }, 'fallback');
    expect(result2.city).toBe('seattle');
});

test('sets category to null when missing or invalid, rather than inventing one', () => {
    const result1 = normalizeParsedParams({ searchText: 'test', city: 'seattle' }, 'fallback');
    expect(result1.category).toBeNull();
    const result2 = normalizeParsedParams({ searchText: 'test', city: 'seattle', category: 'parks' }, 'fallback');
    expect(result2.category).toBeNull();
});

test('the raw-query fallback path also defaults city/category safely', () => {
    const result = normalizeParsedParams(null, 'raw fallback query');
    expect(result.city).toBe('seattle');
    expect(result.category).toBeNull();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx playwright test tests/unit/locus-parsing.spec.js --project=desktop`
Expected: FAIL — `normalizeParsedParams` doesn't yet return `city`/`category`.

- [ ] **Step 3: Extend `PARSE_SYSTEM_PROMPT` and `normalizeParsedParams`**

Replace the existing `PARSE_SYSTEM_PROMPT` constant with the version below. **Do not rely on its original line numbers (240-252) to find it** — Task 4 inserted ~40 new lines earlier in this file, so search for the text `const PARSE_SYSTEM_PROMPT` instead:

```javascript
const VALID_CITIES = ['seattle', 'la', 'ny'];
const VALID_CATEGORIES = ['coffee', 'ramen', 'bars', 'brunch'];

const PARSE_SYSTEM_PROMPT = `You are a precise search translation engine. Parse the user's natural language query into structured search parameters.

You must output a strict JSON object with this schema:
{
  "searchText": string, // A clean, optimized search string combining the core intent and location
  "minRating": number,  // Optional. Minimum rating (1.0 to 5.0) if implied (e.g., "highly rated").
  "priceLevel": string, // Optional. One of: "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"
  "city": string,        // One of: "seattle", "la", "ny" — infer from the query, defaulting to "seattle" if no location is implied.
  "category": string     // One of: "coffee", "ramen", "bars", "brunch" — pick whichever is the closest match to the query's intent. If truly none fit (e.g. a query about parks, hotels, or shopping), output "none".
}

Rules:
1. If no location is provided or implied, default city to "seattle" (the site owner is Seattle-based).
2. "la" means Los Angeles; "ny" means New York City — infer from neighborhood/landmark names too (e.g. "Silver Lake" implies la, "Williamsburg" implies ny).
3. category must be exactly one of "coffee", "ramen", "bars", "brunch", "none" — pick the closest fit, don't invent a new category.
4. Do not include markdown formatting or explanation. Return ONLY the raw JSON.`;
```

Replace `normalizeParsedParams` (lines 120-132 of the current file) with:

```javascript
function normalizeParsedParams(parsed, fallbackQuery) {
    if (!parsed || typeof parsed.searchText !== 'string' || !parsed.searchText.trim()) {
        return { searchText: fallbackQuery, city: 'seattle', category: null };
    }
    const result = { searchText: parsed.searchText.trim().slice(0, 200) };
    if (typeof parsed.minRating === 'number' && parsed.minRating >= 1 && parsed.minRating <= 5) {
        result.minRating = parsed.minRating;
    }
    if (VALID_PRICE_LEVELS.includes(parsed.priceLevel)) {
        result.priceLevel = parsed.priceLevel;
    }
    result.city = VALID_CITIES.includes(parsed.city) ? parsed.city : 'seattle';
    result.category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : null;
    return result;
}
```

(`VALID_CITIES`/`VALID_CATEGORIES` are distinct from Task 4's `CITIES`/`CATEGORIES` constants — the former validate the LLM's raw output, matching the existing `VALID_PRICE_LEVELS` naming convention right above; the latter, from Task 4, are the canonical list `queryTrendingPlaces`/the handler iterate over. Keep both — they serve different call sites, don't try to unify them into one constant.)

- [ ] **Step 4: Run to verify they pass**

Run: `npx playwright test tests/unit/locus-parsing.spec.js --project=desktop`
Expected: PASS (all tests, including the 4 new ones)

- [ ] **Step 5: Write the failing tests for the rewired handler**

Read the current `tests/unit/locus-handler.spec.js` in full. Its existing `describe('handler key_missing routing', ...)` and `describe('handler degraded routing', ...)` blocks test behavior that's being removed in this task (the `GOOGLE_PLACES_API_KEY`-missing branch no longer exists). Replace the **entire file's contents** with:

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

test.describe('handler out-of-scope routing', () => {
    test('falls back to demo when the query has no matching category', async () => {
        const handler = freshHandler({ SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' });
        const { req, res } = fakeHandlerQuery(handler, 'best pizza in Tacoma');
        await handler(req, res);
        expect(res._status).toBe(200);
        expect(res._json.source).toBe('demo');
        expect(res._json.reason).toBe('out_of_scope');
    });
});

test.describe('handler no_trending_data routing', () => {
    test('falls back to demo when the DB returns zero rows for an in-scope city/category', async () => {
        const handler = freshHandler({ SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake-key' });
        const realFetch = global.fetch;
        global.fetch = async () => ({ ok: true, json: async () => [] });
        try {
            const { req, res } = fakeReqRes('quiet coffee shop to work from near Capitol Hill');
            await handler(req, res);
            expect(res._status).toBe(200);
            expect(res._json.source).toBe('demo');
            expect(res._json.reason).toBe('no_trending_data');
        } finally {
            global.fetch = realFetch;
        }
    });
});

test.describe('handler degraded routing', () => {
    test('falls back to degraded when the trending_places query itself fails', async () => {
        const handler = freshHandler({ SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake-key' });
        const realFetch = global.fetch;
        global.fetch = async () => ({ ok: false, status: 503, text: async () => 'db unavailable' });
        try {
            const { req, res } = fakeReqRes('quiet coffee shop to work from near Capitol Hill');
            await handler(req, res);
            expect(res._status).toBe(200);
            expect(res._json.source).toBe('degraded');
            expect(res._json.reason).toBe('upstream_error');
        } finally {
            global.fetch = realFetch;
        }
    });
});

test.describe('handler live routing', () => {
    test('returns live results from the trending_places table, ranked with whyItFits', async () => {
        const handler = freshHandler({ SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake-key', CLIPROXY_URL: '', OPENAI_API_KEY: '' });
        const realFetch = global.fetch;
        global.fetch = async (url) => {
            if (String(url).includes('trending_places')) {
                return {
                    ok: true,
                    json: async () => [
                        { id: 42, city: 'seattle', category: 'coffee', name: 'Real Coffee Co', address: '1 Pine St', rating: 4.7, review_count: 500, price_level: 'PRICE_LEVEL_MODERATE', maps_uri: 'https://maps.example/x', last_confirmed_at: '2026-07-06T08:00:00Z' },
                    ],
                };
            }
            return { ok: false, status: 500, text: async () => 'no LLM providers configured' };
        };
        try {
            const { req, res } = fakeReqRes('quiet coffee shop to work from near Capitol Hill');
            await handler(req, res);
            expect(res._status).toBe(200);
            expect(res._json.source).toBe('live');
            expect(res._json.reason).toBeNull();
            // No LLM providers configured -> rankPlaces() fails -> falls back to
            // the DB's own order with whyItFits: null, same principle as the
            // original Places-API fallback (never discard real candidates).
            expect(res._json.results).toHaveLength(1);
            expect(res._json.results[0].name).toBe('Real Coffee Co');
            expect(res._json.results[0].lastConfirmedAt).toBe('2026-07-06T08:00:00Z');
        } finally {
            global.fetch = realFetch;
        }
    });

    test('id type coercion: numeric DB ids still match string ids the rank LLM echoes back', async () => {
        // Regression test for the Map key-coercion gotcha described in this
        // task's brief — a rank LLM response with a STRING id must still
        // match a candidate whose raw DB id is a NUMBER.
        const handler = freshHandler({ SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake-key', CLIPROXY_URL: 'https://fake-cliproxy', CLIPROXY_SECRET: 'fake-secret' });
        const realFetch = global.fetch;
        global.fetch = async (url) => {
            const urlStr = String(url);
            if (urlStr.includes('trending_places')) {
                return { ok: true, json: async () => [{ id: 42, city: 'seattle', category: 'coffee', name: 'Numeric Id Place', maps_uri: 'https://maps.example/x', last_confirmed_at: '2026-07-06T08:00:00Z' }] };
            }
            if (urlStr.includes('fake-cliproxy')) {
                return {
                    ok: true,
                    json: async () => ({
                        choices: [{ message: { content: JSON.stringify({ results: [{ id: '42', whyItFits: 'Matched via string id.' }] }) } }],
                    }),
                };
            }
            return { ok: false, status: 500, text: async () => 'unexpected call' };
        };
        try {
            const { req, res } = fakeReqRes('quiet coffee shop to work from near Capitol Hill');
            await handler(req, res);
            expect(res._json.source).toBe('live');
            expect(res._json.results).toHaveLength(1);
            expect(res._json.results[0].whyItFits).toBe('Matched via string id.');
        } finally {
            global.fetch = realFetch;
        }
    });
});

function fakeHandlerQuery(handler, query) {
    return fakeReqRes(query);
}
```

Note: the `fakeHandlerQuery` wrapper above is a placeholder identity function kept only so the "out-of-scope" test's call site reads clearly — since `parseQuery`'s LLM call has no providers configured in that test's env overrides, it falls back to the raw query with `city: 'seattle', category: null` (per `normalizeParsedParams`'s fallback branch from Step 3), which is genuinely out-of-scope (`category` is `null`, not one of the 4 valid values) — this exercises the real fallback path, not a mocked shortcut.

- [ ] **Step 6: Run to verify they fail**

Run: `npx playwright test tests/unit/locus-handler.spec.js --project=desktop`
Expected: FAIL — the handler doesn't yet route through `queryTrendingPlaces`.

- [ ] **Step 7: Rewire the handler; delete the old Google Places code**

In `api/locus-search.js`:

1. Delete the `GOOGLE_PLACES_API_KEY` constant (line 3).
2. Delete the `PLACES_FIELD_MASK` constant and the entire `searchPlaces` function (lines 134-159 of the current file).
3. Delete the entire `placeToResult` function (lines 161-171) — replaced by Task 4's `trendingRowToResult`.
4. Replace `rankPlaces`'s candidate-summary mapping (inside the function, currently mapping Places-API-shaped fields) with:

```javascript
async function rankPlaces(originalQuery, candidates) {
    const candidateSummary = candidates.map((p) => ({
        id: p.id,
        name: p.name,
        address: p.address,
        rating: p.rating,
        userRatingCount: p.review_count,
        priceLevel: p.price_level,
    }));
    const userContent = JSON.stringify({ userQuery: originalQuery, candidates: candidateSummary });
    const text = await callLLM(RANK_SYSTEM_PROMPT, userContent);
    const parsed = extractJson(text);
    if (!parsed || !Array.isArray(parsed.results)) return null;
    return parsed.results.slice(0, 5);
}
```

5. Replace the entire body of `handler` from the `if (!GOOGLE_PLACES_API_KEY) { ... }` block (the old key-missing/demo-mode check) through the end of the function with:

```javascript
    function fallbackToDemo(reason) {
        const matched = findDemoMatch(cleanQuery);
        if (matched) {
            logSearch(cleanQuery, [matched], [null], req, 'demo');
            return res.status(200).json({ source: 'demo', reason, results: [matched] });
        }
        logSearch(cleanQuery, DEMO_RESULTS, DEMO_RESULTS.map(() => null), req, 'demo');
        return res.status(200).json({
            source: 'demo',
            reason,
            note: "That's outside what I track yet (Seattle, LA, and New York; coffee, ramen, bars, and brunch) — here are four real examples instead.",
            results: DEMO_RESULTS,
        });
    }

    const parsed = await parseQuery(cleanQuery);
    const inScope = CITIES.includes(parsed.city) && CATEGORIES.includes(parsed.category);

    if (!inScope) {
        return fallbackToDemo('out_of_scope');
    }

    let places;
    try {
        places = await queryTrendingPlaces(parsed.city, parsed.category);
    } catch (err) {
        console.error('TRENDING_QUERY_ERROR', err.status || 'exception', err.message);
        logSearch(cleanQuery, DEMO_RESULTS, DEMO_RESULTS.map(() => null), req, 'degraded');
        return res.status(200).json({ source: 'degraded', reason: 'upstream_error', results: DEMO_RESULTS });
    }

    if (places.length === 0) {
        return fallbackToDemo('no_trending_data');
    }

    let ranked = null;
    try {
        ranked = await rankPlaces(cleanQuery, places);
    } catch (err) {
        console.error('LOCUS_RANK_ERROR', err.message);
    }

    let finalResults;
    let finalPlaceIds;
    if (ranked) {
        // String-coerce both sides of this map — see this task's brief for
        // why: trending_places ids are numeric, but the rank LLM's declared
        // schema is string ids, and a JS Map does no type coercion.
        const byId = new Map(places.map((p) => [String(p.id), p]));
        finalResults = ranked
            .map((r) => {
                const p = byId.get(String(r.id));
                return p ? trendingRowToResult(p, r.whyItFits) : null;
            })
            .filter(Boolean);
        finalPlaceIds = ranked
            .filter((r) => byId.has(String(r.id)))
            .map((r) => String(r.id));
    } else {
        // Rank LLM failed — fall back to the DB's own order, no explanations,
        // but never discard the real trending-data results.
        const top = places.slice(0, 5);
        finalResults = top.map((p) => trendingRowToResult(p, null));
        finalPlaceIds = top.map((p) => String(p.id));
    }

    logSearch(cleanQuery, finalResults, finalPlaceIds, req, 'live');
    return res.status(200).json({ source: 'live', reason: null, results: finalResults });
}
```

(Everything before this point in `handler` — CORS headers, method check, rate limiting, query validation/sanitization — is unchanged from the current file.)

6. Update the `module.exports` block: remove `module.exports.searchPlaces = searchPlaces;` and `module.exports.placeToResult = placeToResult;` (both functions no longer exist).

- [ ] **Step 8: Run all locus-search unit tests to verify they pass**

Run: `npx playwright test tests/unit/locus-parsing.spec.js tests/unit/locus-handler.spec.js tests/unit/locus-demo.spec.js tests/unit/trending-query.spec.js --project=desktop`
Expected: PASS (all tests across all 4 files — `locus-demo.spec.js` is unaffected by this task and should still pass unchanged, confirming no regression).

- [ ] **Step 9: Commit**

```bash
git add api/locus-search.js tests/unit/locus-parsing.spec.js tests/unit/locus-handler.spec.js
git commit -m "Rewire Locus handler onto trending_places; remove Google Places entirely"
```

---

### Task 6: Vercel Cron config + frontend copy and caption

**Files:**
- Modify: `vercel.json`
- Modify: `projects/locus/index.html`

**Interfaces:**
- Consumes: the `{source, reason, note?, results}` envelope from Task 5, where each `results[]` item now includes `lastConfirmedAt` when `source === 'live'`.

- [ ] **Step 1: Add the cron schedule to `vercel.json`**

Read the current `vercel.json` in full first (it has `redirects`, `rewrites`, and `headers` keys already — add a new top-level `crons` key alongside them, don't nest it inside an existing key). Add:

```json
  "crons": [
    { "path": "/api/cron/refresh-trending-places", "schedule": "0 8 * * 1" }
  ],
```

(Monday 8am UTC — Vercel Cron schedules run in UTC.)

- [ ] **Step 2: Replace the about-blurb copy**

In `projects/locus/index.html`, replace the `<p class="about-blurb">` paragraph (currently starting "Locus does one thing: you describe a place in plain English, and it finds real ones. One LLM call turns your sentence into a structured search, Google Places returns actual candidates...") with:

```html
            <p class="about-blurb">
                Locus does one thing: you describe a place in plain English, and it
                finds real ones. A weekly research pass &mdash; grounded in live
                search, not guesswork &mdash; builds a running list of trending spots
                across Seattle, LA, and New York; your query gets matched against
                whatever it's found, then a second pass ranks the top five and
                writes a line on why each fits. It's not perfect. Coverage is only
                as good as last week's research run, and a rating or price
                sometimes goes missing rather than get guessed &mdash; better an
                honest gap than a made-up number. But it beats panning around a
                map, most of the time.
            </p>
```

- [ ] **Step 3: Add the trending caption to `updateCaption()`**

In the `<script>` block, replace the `updateCaption` function with:

```javascript
            function formatShortDate(isoString) {
                var d = new Date(isoString);
                if (isNaN(d.getTime())) return null;
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }

            function updateCaption(data) {
                if (data.source === 'demo') {
                    var text = "Demo data — live search isn't wired up yet. These four are real places with real ratings, frozen for now.";
                    if (data.note) text = data.note + ' ' + text;
                    captionEl.textContent = text;
                } else if (data.source === 'degraded') {
                    captionEl.textContent = "Live search hit a snag — here's a saved example while it recovers.";
                } else if (data.source === 'live' && data.results && data.results.length) {
                    var dates = data.results.map(function(r) { return r.lastConfirmedAt; }).filter(Boolean);
                    var oldest = dates.length ? dates.reduce(function(a, b) { return a < b ? a : b; }) : null;
                    var formatted = oldest ? formatShortDate(oldest) : null;
                    captionEl.textContent = formatted
                        ? 'Trending as of ' + formatted + ' — refreshed weekly, not real-time.'
                        : 'Trending pick — refreshed weekly, not real-time.';
                } else {
                    captionEl.textContent = '';
                }
            }
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev` and open `http://localhost:8080/projects/locus`. Confirm the about-blurb reads the new copy. A live fetch will fail locally (no serverless backend under `http-server`) — that's expected; Task 7's smoke tests cover the caption rendering with mocked responses.

- [ ] **Step 5: Commit**

```bash
git add vercel.json projects/locus/index.html
git commit -m "Add cron schedule; update Locus copy and caption for trending places"
```

---

### Task 7: Smoke test coverage for the trending caption

**Files:**
- Modify: `tests/smoke/locus.spec.js`

**Interfaces:**
- Consumes: `#sourceCaption` (unchanged element), the `{source, reason, results}` envelope with `lastConfirmedAt` per result item from Tasks 5-6.

- [ ] **Step 1: Read the existing file's conventions**

Read `tests/smoke/locus.spec.js` in full to match its exact `page.route()` mocking style.

- [ ] **Step 2: Write the new test**

Add to the existing `test.describe` block in `tests/smoke/locus.spec.js`:

```javascript
test('renders the trending caption with a formatted date when source is live', async ({ page }) => {
    await page.route('**/api/locus-search', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                source: 'live',
                reason: null,
                results: [{
                    name: 'Real Trending Cafe',
                    address: '1 Pine St, Seattle, WA',
                    rating: 4.7,
                    userRatingCount: 500,
                    priceLevel: 'PRICE_LEVEL_MODERATE',
                    mapsUri: 'https://www.google.com/maps/search/?api=1&query=Real+Trending+Cafe',
                    whyItFits: 'Consistently mentioned in this week\'s coverage.',
                    lastConfirmedAt: '2026-07-06T08:00:00Z',
                }],
            }),
        });
    });
    await page.goto('/projects/locus');
    await page.locator('#searchInput').fill('quiet coffee shop to work from near Capitol Hill');
    await page.locator('#searchBtn').click();
    await expect(page.locator('.result-name')).toContainText('Real Trending Cafe');
    await expect(page.locator('#sourceCaption')).toContainText('Trending as of');
    await expect(page.locator('#sourceCaption')).toContainText('refreshed weekly, not real-time');
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `PW_BASE_URL=http://localhost:8080 npx playwright test tests/smoke/locus.spec.js --project=desktop` (with `npm run dev` running in the background)
Expected: FAIL — `#sourceCaption` doesn't yet show a "Trending as of" message for `source: 'live'`.

- [ ] **Step 4: Fix the now-outdated `'hides the caption when source is live'` test**

This test (from the 2026-07-11 work) currently mocks a `source: 'live'` response with a **non-empty** `results` array and asserts the caption stays hidden — that assumption is no longer true (a non-empty live result now shows the trending caption, per Step 2's new test above). The real invariant worth preserving is different: an **empty** live result (e.g. the rank LLM found no good match, `noGoodMatches: true`) should still show no caption, matching `renderResults`'s own empty-results branch which already clears the caption before showing "Nothing matched...". Find that existing test in `tests/smoke/locus.spec.js` and change its mocked fixture's `results` array to `[]` (empty), keeping the rest of the test (including its `toBeHidden()` assertion on `#sourceCaption`) unchanged.

- [ ] **Step 5: Run to verify it passes**

Run: `PW_BASE_URL=http://localhost:8080 npx playwright test tests/smoke/locus.spec.js --project=desktop` (with `npm run dev` running in the background)
Expected: PASS — the new test from Step 2, the fixed empty-results test from Step 4, and every other pre-existing test in the file, no regressions.

- [ ] **Step 6: Commit**

```bash
git add tests/smoke/locus.spec.js
git commit -m "Add smoke test for the trending-places caption"
```

---

## Final verification (whole-plan)

```bash
npm run dev &
sleep 2
PW_BASE_URL=http://localhost:8080 npx playwright test --project=desktop
PW_BASE_URL=http://localhost:8080 npx playwright test --project=mobile
```

Expected: all tests pass, including every new/modified file in this plan, with zero regressions to any pre-existing test. Per this repo's established convention, some pre-existing local-only failures (Vercel analytics scripts 404ing under plain `http-server`, serverless-API-dependent tests) are expected and unrelated — verify against production (default `baseURL`, no `PW_BASE_URL` override) for the authoritative signal on anything that looks like a regression.
