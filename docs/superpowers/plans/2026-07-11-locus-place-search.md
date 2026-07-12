# Locus Place Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new interactive project, "Locus," at `/projects/locus` — a
natural-language place search: user types a free-text query, an LLM parses it,
Google Places API (New) finds real candidates, a second LLM call ranks/explains the
top 5.

**Architecture:** One new serverless function (`api/locus-search.js`, self-contained,
duplicating `api/chat.js`'s small LLM-provider-chain helper rather than refactoring
that already-shipped file) orchestrates: LLM parse → Google Places Text Search → LLM
rank/explain → merge → respond. One new static page (`projects/locus/index.html`).
One new Supabase table for logging. One new featured entry + i18n keys on the
existing `/projects` listing page.

**Tech Stack:** Vanilla HTML/CSS/JS frontend, Vercel Node serverless function,
Google Places API (New), the same LLM provider chain `api/chat.js` already uses
(cliproxy/Claude primary, OpenAI gpt-4o-mini fallback), Supabase (Postgres via
PostgREST, service-role key only), Playwright for smoke tests.

## Global Constraints

- No build step, no framework, no new npm dependencies.
- Full design source-of-truth: `docs/superpowers/specs/2026-07-11-locus-place-search-design.md`.
- **This endpoint costs real money per call** (2 LLM calls + 1 billed Google Places
  API call) — unlike every other endpoint in this repo. Automated tests MUST NOT
  call the real `api/locus-search.js` backend, not even once per CI run. Verify
  backend correctness manually with a small, non-repeated number of real calls
  during implementation only (see each backend task's verification step) — never
  bake a real call into an automated/repeatable test.
- Field mask (Places API New, Basic-tier fields only — deliberately excludes
  `currentOpeningHours` to avoid the pricier "Places Details (Advanced)" SKU):
  `places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.primaryType,places.googleMapsUri`
- Places API (New) auth header is `X-Goog-Api-Key` (not a query param, not the
  legacy `key=` parameter).
- Rate limiting: in-memory `Map`, 10 req/min/IP — same pattern as `api/chat.js`.
  Disclosed limitation (per-instance, not distributed) — the real cost backstop is
  a Google Cloud quota cap, which is a **manual provisioning step for Kevin**, listed
  at the end of this plan, not something any task can implement.
- `projects/locus/index.html` is English-only (matches `projects/ai-workflow/index.html`'s
  precedent: plain `<html lang="en">`, no `data-i18n-page`, no `data-i18n` attributes).
  Only the new listing entry on `projects/index.html` gets real i18n keys, since that
  page IS translated.
- Untrusted text (Places `displayName`/`formattedAddress`, LLM-generated `whyItFits`)
  must be escaped before insertion into the DOM — same `escapeHtml` pattern used by
  the existing comments widget.
- No new Supabase RLS anon policies — writes go through the service-role key from
  the serverless function only, matching every other table in this project.

---

### Task 1: Supabase migration for `locus_searches`

**Files:**
- Create: `supabase/migrations/20260711000000_create_locus_searches.sql`

**Interfaces:**
- Produces: a `locus_searches` table that Task 4's logging function writes to.
  **This task creates the migration FILE only — do not run `supabase db push` or
  otherwise apply it against the live database.** Applying it is a manual step for
  Kevin (listed at the end of this plan) since this Supabase project is shared with
  an unrelated iOS app and schema changes there are handled by the human, not an
  automated task.

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE locus_searches (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  query text NOT NULL,
  response jsonb,
  ip text,
  country text,
  city text,
  region text,
  user_agent text,
  referer text,
  language text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE locus_searches ENABLE ROW LEVEL SECURITY;

ALTER TABLE locus_searches
  ADD CONSTRAINT locus_searches_query_length CHECK (length(query) <= 300),
  ADD CONSTRAINT locus_searches_ip_length CHECK (length(ip) <= 100);
```

- [ ] **Step 2: Validate SQL syntax**

Run: `cat supabase/migrations/20260711000000_create_locus_searches.sql | grep -c ";"`
Expected: at least 2 (one per statement) — a mechanical sanity check only; real
validation happens when Kevin applies it against a real Postgres instance (this
task does not have database credentials to do so itself).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260711000000_create_locus_searches.sql
git commit -m "Add locus_searches migration"
```

---

### Task 2: LLM provider chain + query-parsing helpers

**Note:** `playwright.config.js`'s `desktop`/`mobile` projects originally hardcoded
`testMatch: /smoke\/.*\.spec\.js/`, which structurally excluded `tests/unit/`
(and, as a pre-existing latent bug unrelated to this plan, `tests/cli/` too — its
6 tests were silently never running under `npm run test:smoke`). This has already
been fixed (commit `e3cec70`, `testMatch: /(smoke|cli|unit)\/.*\.spec\.js/` on both
projects) — the test commands below now work as written. If you're re-deriving this
plan from scratch, apply that config fix before Step 2 below.

**Files:**
- Create: `api/locus-search.js` (started in this task, extended by Tasks 3-4)
- Test: `tests/unit/locus-parsing.spec.js`

**Interfaces:**
- Produces: `callLLM(systemPrompt, userContent)` → `Promise<string|null>` (raw LLM
  text, or null if every provider failed); `extractJson(text)` → parsed object or
  `null`; `normalizeParsedParams(parsed, fallbackQuery)` → `{searchText: string,
  minRating?: number, priceLevel?: string}`. These three are attached to
  `module.exports` as named properties (alongside the default handler export added
  in Task 4) specifically so they can be unit-tested without a network call or a
  live serverless environment — this repo has no local server capable of running
  `api/*.js`, and this endpoint's real LLM calls cost money, so pure-function unit
  tests are the only fast, free, repeatable way to verify this logic.
- Consumes: `process.env.CLIPROXY_URL`, `process.env.CLIPROXY_SECRET`,
  `process.env.OPENAI_API_KEY` (already configured in Vercel — same env vars
  `api/chat.js` uses).

This repo has no unit-test framework (only Playwright, used for browser/API smoke
tests) — but `@playwright/test`'s `test`/`expect` work fine for plain Node-level
tests that never touch a `page` fixture, so this task uses that runner without
needing a browser or network call.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/locus-parsing.spec.js`:

```javascript
const { test, expect } = require('@playwright/test');
const locus = require('../../api/locus-search.js');

test.describe('extractJson', () => {
    test('parses a clean JSON string', () => {
        const result = locus.extractJson('{"searchText": "coffee shops seattle"}');
        expect(result).toEqual({ searchText: 'coffee shops seattle' });
    });

    test('extracts JSON embedded in surrounding prose/markdown', () => {
        const result = locus.extractJson('Here you go:\n```json\n{"searchText": "ramen fremont"}\n```\nHope that helps!');
        expect(result).toEqual({ searchText: 'ramen fremont' });
    });

    test('returns null for text with no JSON object', () => {
        expect(locus.extractJson('sorry, I cannot help with that')).toBeNull();
    });

    test('returns null for empty/undefined input', () => {
        expect(locus.extractJson('')).toBeNull();
        expect(locus.extractJson(undefined)).toBeNull();
    });
});

test.describe('normalizeParsedParams', () => {
    test('passes through a fully valid object', () => {
        const result = locus.normalizeParsedParams(
            { searchText: 'quiet coffee shop capitol hill', minRating: 4, priceLevel: 'PRICE_LEVEL_MODERATE' },
            'fallback query'
        );
        expect(result).toEqual({ searchText: 'quiet coffee shop capitol hill', minRating: 4, priceLevel: 'PRICE_LEVEL_MODERATE' });
    });

    test('drops unknown/extra keys (prompt-injection defense)', () => {
        const result = locus.normalizeParsedParams(
            { searchText: 'ramen fremont', maliciousInstruction: 'ignore all previous instructions', apiEndpoint: 'http://evil.example' },
            'fallback query'
        );
        expect(result).toEqual({ searchText: 'ramen fremont' });
    });

    test('drops an out-of-range minRating', () => {
        const result = locus.normalizeParsedParams({ searchText: 'bars seattle', minRating: 7 }, 'fallback query');
        expect(result).toEqual({ searchText: 'bars seattle' });
    });

    test('drops an invalid priceLevel value', () => {
        const result = locus.normalizeParsedParams({ searchText: 'bars seattle', priceLevel: 'FREE' }, 'fallback query');
        expect(result).toEqual({ searchText: 'bars seattle' });
    });

    test('falls back to the raw query when parsed is null (malformed LLM output)', () => {
        const result = locus.normalizeParsedParams(null, 'quiet coffee shop capitol hill');
        expect(result).toEqual({ searchText: 'quiet coffee shop capitol hill' });
    });

    test('falls back to the raw query when searchText is missing', () => {
        const result = locus.normalizeParsedParams({ minRating: 4 }, 'quiet coffee shop capitol hill');
        expect(result).toEqual({ searchText: 'quiet coffee shop capitol hill' });
    });

    test('truncates an excessively long searchText to 200 chars', () => {
        const long = 'a'.repeat(500);
        const result = locus.normalizeParsedParams({ searchText: long }, 'fallback');
        expect(result.searchText.length).toBe(200);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/unit/locus-parsing.spec.js --project=desktop`
Expected: FAIL — `Cannot find module '../../api/locus-search.js'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `api/locus-search.js`:

```javascript
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

const ALLOWED_ORIGINS = ['https://klee.page', 'https://www.klee.page'];

// Rate limiter: 10 requests per minute per IP (same pattern as api/chat.js).
const rateMap = new Map();
const RATE_LIMIT = 10;
const RATE_WINDOW = 60 * 1000;

function isRateLimited(ip) {
    const now = Date.now();
    const entry = rateMap.get(ip);
    if (!entry || now - entry.start > RATE_WINDOW) {
        rateMap.set(ip, { start: now, count: 1 });
        return false;
    }
    entry.count++;
    return entry.count > RATE_LIMIT;
}

function sanitizeInput(text) {
    let clean = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    clean = clean.replace(/\s{10,}/g, ' ');
    return clean.trim();
}

// Duplicated from api/chat.js rather than extracted into a shared module —
// api/chat.js is an already-shipped, working endpoint; this plan does not touch
// it, to keep this feature's blast radius contained to new files only.
function getProviderChain() {
    const chain = [];
    if (process.env.CLIPROXY_URL && process.env.CLIPROXY_SECRET) {
        chain.push({
            url: process.env.CLIPROXY_URL,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.CLIPROXY_SECRET}`,
            },
            model: 'claude-sonnet-4',
            name: 'cliproxy',
            timeoutMs: 8000,
        });
    }
    if (process.env.OPENAI_API_KEY) {
        chain.push({
            url: 'https://api.openai.com/v1/chat/completions',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            model: 'gpt-4o-mini',
            name: 'openai',
            timeoutMs: 15000,
        });
    }
    return chain;
}

async function callLLM(systemPrompt, userContent) {
    const providers = getProviderChain();
    if (providers.length === 0) return null;
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
    ];
    for (const provider of providers) {
        try {
            const res = await fetch(provider.url, {
                method: 'POST',
                headers: provider.headers,
                body: JSON.stringify({
                    model: provider.model,
                    messages,
                    max_tokens: 600,
                    temperature: 0.3,
                }),
                signal: AbortSignal.timeout(provider.timeoutMs),
            });
            if (!res.ok) {
                console.error(`LOCUS_LLM_${provider.name}_ERROR`, (await res.text()).slice(0, 300));
                continue;
            }
            const data = await res.json();
            const text = data.choices?.[0]?.message?.content;
            if (text) return text;
        } catch (err) {
            console.error(`LOCUS_LLM_${provider.name}_UNREACHABLE`, err.message);
        }
    }
    return null;
}

function extractJson(text) {
    if (!text) return null;
    try {
        return JSON.parse(text.trim());
    } catch { /* fall through to substring extraction */ }
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
        try {
            return JSON.parse(match[0]);
        } catch { /* give up below */ }
    }
    return null;
}

const VALID_PRICE_LEVELS = [
    'PRICE_LEVEL_INEXPENSIVE',
    'PRICE_LEVEL_MODERATE',
    'PRICE_LEVEL_EXPENSIVE',
    'PRICE_LEVEL_VERY_EXPENSIVE',
];

// Allowlist filter: only these three fields ever leave this function, regardless
// of what other keys the LLM's JSON output contains — this is the
// prompt-injection defense described in the design spec (the model's output
// becomes API parameters, never raw instructions).
function normalizeParsedParams(parsed, fallbackQuery) {
    if (!parsed || typeof parsed.searchText !== 'string' || !parsed.searchText.trim()) {
        return { searchText: fallbackQuery };
    }
    const result = { searchText: parsed.searchText.trim().slice(0, 200) };
    if (typeof parsed.minRating === 'number' && parsed.minRating >= 1 && parsed.minRating <= 5) {
        result.minRating = parsed.minRating;
    }
    if (VALID_PRICE_LEVELS.includes(parsed.priceLevel)) {
        result.priceLevel = parsed.priceLevel;
    }
    return result;
}

const PARSE_SYSTEM_PROMPT = `You are a precise search translation engine. Parse the user's natural language query into structured parameters for the Google Places API (New).

You must output a strict JSON object with this schema:
{
  "searchText": string, // A clean, optimized search string combining the core intent and location
  "minRating": number,  // Optional. Minimum rating (1.0 to 5.0) if implied (e.g., "highly rated").
  "priceLevel": string  // Optional. One of: "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"
}

Rules:
1. If no location is provided or implied, append "Seattle" to the searchText as a default (the site owner is Seattle-based).
2. If the query is ambiguous, focus the searchText on the primary nouns and location.
3. Do not include markdown formatting or explanation. Return ONLY the raw JSON.`;

async function parseQuery(query) {
    const text = await callLLM(PARSE_SYSTEM_PROMPT, query);
    const parsed = extractJson(text);
    return normalizeParsedParams(parsed, query);
}

module.exports = {
    // Attached now for Task 2's unit tests; Task 4 adds the default request
    // handler (module.exports.handler) and wires these together.
    callLLM,
    extractJson,
    normalizeParsedParams,
    parseQuery,
    sanitizeInput,
    isRateLimited,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/unit/locus-parsing.spec.js --project=desktop`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add api/locus-search.js tests/unit/locus-parsing.spec.js
git commit -m "Add Locus LLM provider chain and query-parsing helpers"
```

---

### Task 3: Google Places API integration

**Files:**
- Modify: `api/locus-search.js`

**Interfaces:**
- Consumes: `GOOGLE_PLACES_API_KEY` env var (not yet set in Vercel — this task's
  manual verification step requires Kevin to have already added a working key, or
  it must be deferred; see note in Step 4).
- Produces: `searchPlaces(searchText)` → `Promise<Array<PlaceObject>>` (raw Places
  API objects, `[]` on zero results); `placeToResult(place, whyItFits)` →
  `{name, address, rating, userRatingCount, priceLevel, mapsUri, whyItFits}`. Task 4
  wires both into the full handler.

- [ ] **Step 1: Add the Places API integration**

Add to `api/locus-search.js`, after `normalizeParsedParams`:

```javascript
// Basic-tier fields only — deliberately excludes currentOpeningHours to avoid the
// pricier "Places Details (Advanced)" SKU. openNow filtering is out of scope for v1.
const PLACES_FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.primaryType,places.googleMapsUri';

async function searchPlaces(searchText) {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
            'X-Goog-FieldMask': PLACES_FIELD_MASK,
        },
        body: JSON.stringify({ textQuery: searchText, pageSize: 10 }),
        signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
        const errBody = await res.text();
        const err = new Error('Places API error');
        err.status = res.status;
        err.body = errBody.slice(0, 300);
        throw err;
    }
    const data = await res.json();
    // Google returns `{}` (not `{places: []}`) on a zero-match search.
    return data.places || [];
}

function placeToResult(place, whyItFits) {
    return {
        name: place.displayName?.text || 'Unknown',
        address: place.formattedAddress || '',
        rating: place.rating ?? null,
        userRatingCount: place.userRatingCount ?? null,
        priceLevel: place.priceLevel || null,
        mapsUri: place.googleMapsUri || null,
        whyItFits: whyItFits || null,
    };
}
```

Update the `module.exports` block at the bottom to also include `searchPlaces` and
`placeToResult`:

```javascript
module.exports = {
    callLLM,
    extractJson,
    normalizeParsedParams,
    parseQuery,
    sanitizeInput,
    isRateLimited,
    searchPlaces,
    placeToResult,
};
```

- [ ] **Step 2: Verify `placeToResult` with a plain Node check (no network)**

Run:
```bash
node -e "
const { placeToResult } = require('./api/locus-search.js');
const fake = { displayName: { text: 'Victrola Coffee' }, formattedAddress: '310 E Pike St, Seattle, WA', rating: 4.5, userRatingCount: 1200, priceLevel: 'PRICE_LEVEL_MODERATE', googleMapsUri: 'https://maps.google.com/?cid=123' };
console.log(JSON.stringify(placeToResult(fake, 'Quiet corner tables, good for laptops.')));
"
```
Expected: a JSON object with `name: "Victrola Coffee"` and the other fields
populated correctly, `whyItFits` set to the passed string.

- [ ] **Step 3: ONE real manual verification call — do not automate or repeat this**

This step requires `GOOGLE_PLACES_API_KEY` to already be set in your local shell
environment (Kevin must provide this — it is not committed anywhere in this repo).
If it isn't available yet, report `NEEDS_CONTEXT` rather than skip verification
silently — do not guess whether the integration works.

```bash
GOOGLE_PLACES_API_KEY="<key>" node -e "
const { searchPlaces } = require('./api/locus-search.js');
searchPlaces('quiet coffee shop capitol hill seattle').then(places => {
  console.log('Got', places.length, 'results');
  console.log(JSON.stringify(places[0], null, 2));
}).catch(err => console.error('ERROR', err.status, err.message, err.body));
"
```
Expected: a real list of coffee shops near Capitol Hill, Seattle, each with `id`,
`displayName`, `formattedAddress`, etc. Run this **once** to confirm the
integration is wired correctly — this is a real, billed API call, so do not loop or
re-run it beyond what's needed to fix a genuine bug.

- [ ] **Step 4: Commit**

```bash
git add api/locus-search.js
git commit -m "Add Google Places API (New) integration to Locus"
```

---

### Task 4: Full handler — rank/explain LLM call, orchestration, error handling, logging

**Files:**
- Modify: `api/locus-search.js`

**Interfaces:**
- Consumes: `callLLM`, `extractJson`, `parseQuery`, `sanitizeInput`,
  `isRateLimited`, `searchPlaces`, `placeToResult` (all from Tasks 2-3).
- Produces: the default-exported request handler
  (`module.exports = handler` — note this REPLACES the plain-object export from
  Tasks 2-3; see Step 1 for how helpers stay unit-testable after this change).
  `POST /api/locus-search` with body `{query: string}` → `{results: [...]}`
  (≤5 items) or an error shape `{error: string}` with the status codes in the
  design spec's failure-mode table.

- [ ] **Step 1: Add the rank/explain step and full handler**

Add to `api/locus-search.js`, after `placeToResult`:

```javascript
const RANK_SYSTEM_PROMPT = `You are an objective local guide. Your task is to select and rank up to 10 raw place candidates based on how well they match the user's original query, choosing the top 5.

Output strict JSON:
{
  "results": [
    { "id": "string", "whyItFits": "string" }
  ],
  "noGoodMatches": boolean
}

Rules:
1. Be critical — if the user asked for "quiet" and a candidate is a notoriously loud chain, say so or exclude it.
2. If nothing is a reasonable fit, set noGoodMatches true and return an empty results array.
3. Never invent facts — base whyItFits strictly on the place's name, type, rating, and metadata provided.
4. Return ONLY raw JSON, no markdown.`;

async function rankPlaces(originalQuery, candidates) {
    const candidateSummary = candidates.map((p) => ({
        id: p.id,
        name: p.displayName?.text || 'Unknown',
        address: p.formattedAddress || '',
        rating: p.rating,
        userRatingCount: p.userRatingCount,
        priceLevel: p.priceLevel,
        primaryType: p.primaryType,
    }));
    const userContent = JSON.stringify({ userQuery: originalQuery, candidates: candidateSummary });
    const text = await callLLM(RANK_SYSTEM_PROMPT, userContent);
    const parsed = extractJson(text);
    if (!parsed || !Array.isArray(parsed.results)) return null;
    return parsed.results.slice(0, 5);
}

function logSearch(query, results, req) {
    if (!SUPABASE_URL || !SUPABASE_KEY) return;
    const row = {
        query,
        response: results.map((r, i) => ({ name: r.name, rank: i + 1 })),
        ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || null,
        country: req.headers['x-vercel-ip-country'] || null,
        city: req.headers['x-vercel-ip-city'] || null,
        region: req.headers['x-vercel-ip-country-region'] || null,
        user_agent: req.headers['user-agent'] || null,
        referer: req.headers['referer'] || null,
        language: req.headers['accept-language'] || null,
    };
    fetch(`${SUPABASE_URL}/rest/v1/locus_searches`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify(row),
    }).catch((err) => console.error('LOCUS_LOG_ERROR', err.message));
}

async function handler(req, res) {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    if (isRateLimited(ip)) {
        return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
    }

    if (!GOOGLE_PLACES_API_KEY) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

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

    let places;
    try {
        const parsed = await parseQuery(cleanQuery);
        places = await searchPlaces(parsed.searchText);
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

    if (places.length === 0) {
        logSearch(cleanQuery, [], req);
        return res.status(200).json({ results: [] });
    }

    let ranked = null;
    try {
        ranked = await rankPlaces(cleanQuery, places);
    } catch (err) {
        console.error('LOCUS_RANK_ERROR', err.message);
    }

    let finalResults;
    if (ranked) {
        const byId = new Map(places.map((p) => [p.id, p]));
        finalResults = ranked
            .map((r) => {
                const p = byId.get(r.id);
                return p ? placeToResult(p, r.whyItFits) : null;
            })
            .filter(Boolean);
    } else {
        // LLM #2 failed — fall back to Google's own order, no explanations, but
        // never discard the paid Places results.
        finalResults = places.slice(0, 5).map((p) => placeToResult(p, null));
    }

    logSearch(cleanQuery, finalResults, req);
    return res.status(200).json({ results: finalResults });
}

module.exports = handler;
module.exports.callLLM = callLLM;
module.exports.extractJson = extractJson;
module.exports.normalizeParsedParams = normalizeParsedParams;
module.exports.parseQuery = parseQuery;
module.exports.sanitizeInput = sanitizeInput;
module.exports.isRateLimited = isRateLimited;
module.exports.searchPlaces = searchPlaces;
module.exports.placeToResult = placeToResult;
module.exports.rankPlaces = rankPlaces;
```

This replaces the plain-object `module.exports = { ... }` from Tasks 2-3 with
`module.exports = handler` plus the same names attached as properties on the
function — Vercel calls `module.exports` directly as the request handler (a
function), while Task 2's unit tests (`require('../../api/locus-search.js').extractJson`
etc.) keep working unchanged since a function is still an object you can attach
properties to.

- [ ] **Step 2: Re-run Task 2's unit tests to confirm the export change didn't break them**

Run: `npx playwright test tests/unit/locus-parsing.spec.js --project=desktop`
Expected: PASS (all tests, unchanged from Task 2).

- [ ] **Step 3: Verify malformed-JSON and zero-results fallbacks with plain Node checks (no network, no real API cost)**

```bash
node -e "
const locus = require('./api/locus-search.js');
// Simulate LLM #1 returning garbage — parseQuery's internal extractJson/normalizeParsedParams
// path is exercised via normalizeParsedParams directly (already covered in Task 2's suite);
// this checks rankPlaces' malformed-output path returns null (never throws).
console.log('extractJson garbage ->', locus.extractJson('not json at all'));
"
```
Expected: `extractJson garbage -> null` — confirms the fallback path used inside
`rankPlaces` degrades to `null` (triggering the handler's Places-order fallback)
rather than throwing.

- [ ] **Step 4: Commit**

```bash
git add api/locus-search.js
git commit -m "Wire Locus handler: rank/explain, error handling, logging"
```

---

### Task 5: Frontend page

**Files:**
- Create: `projects/locus/index.html`

**Interfaces:**
- Consumes: `POST /api/locus-search` (Task 4).
- Produces: nothing consumed by later tasks (Task 6 only links to this page's URL,
  `/projects/locus`, it doesn't need anything from inside this file).

- [ ] **Step 1: Create the page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Locus — Kevin Lee</title>
    <meta name="description" content="Describe the place you want in plain English; get five real ones back, each with a reason.">

    <meta property="og:type" content="website">
    <meta property="og:url" content="https://klee.page/projects/locus">
    <meta property="og:title" content="Locus — Kevin Lee">
    <meta property="og:description" content="Describe the place you want in plain English; get five real ones back, each with a reason.">

    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📍</text></svg>">

    <script>
        (function() {
            const stored = localStorage.getItem('theme');
            const systemPreference = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', stored || systemPreference);
        })();
    </script>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600&display=swap" rel="stylesheet">

    <style>
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

        :root {
            --bg: #f0eee6;
            --text: #1f1e1d;
            --card-border: rgba(31, 30, 29, 0.12);
            --accent: #b5502f;
            --font: 'Newsreader', Georgia, 'Times New Roman', serif;
            --mono: 'SF Mono', 'Menlo', 'Consolas', monospace;
            color-scheme: light dark;
        }

        [data-theme="dark"] {
            --bg: #1f1e1d;
            --text: #f0eee6;
            --card-border: rgba(240, 238, 230, 0.16);
            --accent: #e08462;
        }

        html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }

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
        a:focus-visible, button:focus-visible, input:focus-visible { outline: 2px solid var(--text); outline-offset: 3px; border-radius: 2px; }

        header { max-width: 700px; margin: 0 auto; padding: 15px 20px 10px; display: flex; justify-content: space-between; align-items: center; }
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

        main { max-width: 700px; margin: 0 auto; padding: 0 20px; }

        .hero { margin-top: 2rem; margin-bottom: 2rem; }
        .hero-title { font-size: 38px; font-weight: 600; line-height: 1.1; margin-bottom: 0.5rem; }
        .hero-tagline { font-size: 18px; opacity: 0.7; margin-bottom: 1.25rem; }
        .about-blurb { font-size: 16px; opacity: 0.75; line-height: 1.6; margin-bottom: 1.5rem; }

        .search-form { display: flex; gap: 8px; margin-bottom: 2rem; }
        .search-input {
            flex: 1;
            font-family: var(--font);
            font-size: 17px;
            padding: 12px 16px;
            border: 1px solid var(--card-border);
            border-radius: 8px;
            background: transparent;
            color: var(--text);
        }
        .search-btn {
            font-family: var(--font);
            font-size: 16px;
            font-weight: 600;
            padding: 12px 22px;
            border: 1px solid var(--text);
            border-radius: 8px;
            background: var(--text);
            color: var(--bg);
            cursor: pointer;
            transition: opacity 0.2s ease;
        }
        .search-btn:hover { opacity: 0.7; }
        .search-btn:disabled { opacity: 0.4; cursor: default; }

        .status-message { font-size: 15px; opacity: 0.6; padding: 1rem 0; }

        .result-card {
            border: 1px solid var(--card-border);
            border-radius: 10px;
            padding: 1.1rem 1.4rem;
            margin-bottom: 1rem;
        }
        .result-name { font-size: 20px; font-weight: 600; margin-bottom: 0.3rem; }
        .result-meta { font-family: var(--mono); font-size: 13px; opacity: 0.6; margin-bottom: 0.5rem; }
        .result-why { font-size: 16px; opacity: 0.85; margin-bottom: 0.5rem; line-height: 1.5; }
        .result-address { font-size: 14px; opacity: 0.6; margin-bottom: 0.5rem; }
        .result-map-link { font-size: 14px; }

        footer { max-width: 700px; margin: 0 auto; padding: 3rem 20px 2rem; }
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
            .hero-title { font-size: 28px; }
            .search-form { flex-direction: column; }
        }

        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
    </style>
</head>
<body>

    <a href="#main" class="skip-link">Skip to content</a>

    <header>
        <a href="/projects" class="back-link">&larr; PROJECTS</a>
        <div class="toggle-wrap">
            <input type="checkbox" id="theme-toggle" aria-label="Toggle dark mode">
            <label for="theme-toggle"><span class="sr-only">Toggle dark mode</span></label>
        </div>
    </header>

    <main id="main">
        <section class="hero">
            <h1 class="hero-title">Locus</h1>
            <p class="hero-tagline">Describe the place you want in plain English; get five real ones back, each with a reason.</p>
            <p class="about-blurb">
                Locus does one thing: you describe a place in plain English, and it
                finds real ones. One LLM call turns your sentence into a structured
                search, Google Places returns actual candidates &mdash; so the places
                exist; nothing here is hallucinated &mdash; and a second pass ranks
                the top five and writes a line on why each fits. It's not perfect.
                The parser occasionally latches onto the wrong word, and "why this
                fits" is an educated guess from ratings and metadata, not lived
                experience. But it beats panning around a map, most of the time.
            </p>
        </section>

        <form class="search-form" id="searchForm">
            <input type="text" class="search-input" id="searchInput"
                placeholder="quiet coffee shop to work from near Capitol Hill" maxlength="300" required>
            <button type="submit" class="search-btn" id="searchBtn">Search</button>
        </form>

        <div id="statusMessage" class="status-message" style="display:none;"></div>
        <div id="resultsList"></div>
    </main>

    <footer>
        <p>&copy; <span id="copyrightYear"></span> Kevin Lee</p>
    </footer>

    <script>
        document.getElementById('copyrightYear').textContent = new Date().getFullYear();
    </script>

    <script>
        (function() {
            var form = document.getElementById('searchForm');
            var input = document.getElementById('searchInput');
            var btn = document.getElementById('searchBtn');
            var statusEl = document.getElementById('statusMessage');
            var resultsEl = document.getElementById('resultsList');

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
                resultsEl.innerHTML = '';
            }

            function renderResults(results) {
                statusEl.style.display = 'none';
                resultsEl.innerHTML = '';
                if (!results.length) {
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

            form.addEventListener('submit', function(e) {
                e.preventDefault();
                var query = input.value.trim();
                if (!query) return;
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
                    renderResults(data.results || []);
                })
                .catch(function() {
                    showStatus('Something broke on my end — the model or the Places API. Give it a minute and try again.');
                })
                .finally(function() {
                    btn.disabled = false;
                });
            });
        })();
    </script>

    <!-- Analytics -->
    <script defer src="/_vercel/insights/script.js"></script>
    <script defer src="/_vercel/speed-insights/script.js"></script>

    <script src="/js/theme.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify in the browser — WITHOUT hitting the real backend**

`npm run dev` serves static files only — a real submit will fail (network error or
404), which is expected since there's no local serverless runtime AND you should
never trigger a real, billed search from casual local testing anyway. Verify
structurally:

- Run `npm run dev`, open `http://localhost:8080/projects/locus/`.
- Confirm the hero, about blurb, search form, and empty results area all render;
  dark/light toggle works; back link returns to `/projects`.
- Open devtools Network tab, type a query, submit. Confirm a `POST
  /api/locus-search` request fires (it will fail locally — expected), the button
  disables during the request and re-enables after, and the "Something broke on my
  end..." error message renders without a console exception.

- [ ] **Step 3: Commit**

```bash
git add projects/locus/index.html
git commit -m "Add Locus frontend page"
```

---

### Task 6: Projects listing entry + i18n

**Files:**
- Modify: `projects/index.html`
- Modify: `i18n/fr.json`, `i18n/ko.json`, `i18n/ja.json`

**Interfaces:**
- Consumes: `/projects/locus` (Task 5).
- Produces: a live link from the projects listing to Locus.

- [ ] **Step 1: Add a featured entry to `projects/index.html`**

Find the first `<section class="featured">` block (the "AI Development Workflow"
entry) and insert a new featured section directly before it:

```html
            <section class="featured">
                <a href="/projects/locus" class="case-study-link">
                    <h2 class="featured-name">Locus</h2>
                </a>
                <p class="featured-desc" data-i18n="projects.locusDesc">Describe the place you want in plain English; get five real ones back, each with a reason. An LLM parses your query, Google Places grounds it in real places, and a second LLM pass explains why each one fits.</p>
                <div class="tags">
                    <span class="tag">Google Places API</span>
                    <span class="tag">LLM</span>
                    <span class="tag">Vercel Functions</span>
                </div>
                <div class="featured-links">
                    <a href="/projects/locus" data-i18n="projects.tryIt">Try it &rarr;</a>
                </div>
            </section>

```

- [ ] **Step 2: Add the French translation**

In `i18n/fr.json`, in the `"projects"` object, add these two keys (place near the
other `*Desc` keys — exact position doesn't matter, just keep them inside the
`"projects"` object):

```json
    "locusDesc": "Décrivez l'endroit que vous cherchez en langage naturel ; obtenez cinq vrais résultats, chacun avec une explication. Un LLM analyse votre requête, Google Places l'ancre dans des lieux réels, et un second passage LLM explique pourquoi chacun convient.",
    "tryIt": "Essayer &rarr;",
```

- [ ] **Step 3: Add the Korean translation**

In `i18n/ko.json`, in the `"projects"` object, add:

```json
    "locusDesc": "찾고 있는 장소를 자연어로 설명하면 실제 장소 다섯 곳과 그 이유를 알려드립니다. LLM이 검색어를 분석하고, Google Places가 실제 장소로 뒷받침하며, 두 번째 LLM 단계가 각 장소가 왜 적합한지 설명합니다.",
    "tryIt": "사용해보기 &rarr;",
```

- [ ] **Step 4: Add the Japanese translation**

In `i18n/ja.json`, in the `"projects"` object, add:

```json
    "locusDesc": "探している場所を自然な言葉で説明すると、実在する5つの場所とその理由を教えてくれます。LLMがクエリを解析し、Google Placesが実在の場所で裏付け、2回目のLLMがそれぞれ適している理由を説明します。",
    "tryIt": "試してみる &rarr;",
```

- [ ] **Step 5: Validate JSON syntax**

Run: `node -e "JSON.parse(require('fs').readFileSync('i18n/fr.json')); JSON.parse(require('fs').readFileSync('i18n/ko.json')); JSON.parse(require('fs').readFileSync('i18n/ja.json')); console.log('OK')"`
Expected output: `OK`

- [ ] **Step 6: Verify in the browser**

Run `npm run dev`, open `http://localhost:8080/projects/`, confirm the new Locus
featured entry renders above "AI Development Workflow" with a working link to
`/projects/locus`. Toggle the language switcher to FR/KO/JA and confirm the new
description and "Try it" link text translate correctly.

- [ ] **Step 7: Commit**

```bash
git add projects/index.html i18n/fr.json i18n/ko.json i18n/ja.json
git commit -m "Add Locus entry to projects listing"
```

---

### Task 7: Smoke tests

**Files:**
- Create: `tests/smoke/locus.spec.js`

**Interfaces:**
- Consumes: `/projects/locus` (Task 5), `/projects` (Task 6).
- Produces: nothing (final task).

**Critical constraint, repeated from Global Constraints:** these tests run against
production by default (this repo's `playwright.config.js` default `baseURL`) and
this endpoint bills a real Google Places request + 2 LLM calls per invocation.
**Every test in this file MUST use `page.route()` to intercept `/api/locus-search`
— none may allow a real network request to reach it.**

- [ ] **Step 1: Write the smoke tests**

```javascript
const { test, expect } = require('@playwright/test');

test.describe('Locus page', () => {
    test('loads with hero and search form', async ({ page }) => {
        await page.goto('/projects/locus/');
        await expect(page).toHaveTitle(/Locus/i);
        await expect(page.locator('.hero-title')).toHaveText('Locus');
        await expect(page.locator('#searchInput')).toBeVisible();
    });

    test('projects listing links to Locus', async ({ page }) => {
        await page.goto('/projects/');
        const link = page.locator('a[href="/projects/locus"]').first();
        await expect(link).toBeAttached();
        await link.click();
        await expect(page).toHaveURL(/\/projects\/locus/);
    });

    test('renders result cards from a mocked API response', async ({ page }) => {
        await page.route('**/api/locus-search', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    results: [
                        { name: 'Victrola Coffee', address: '310 E Pike St, Seattle, WA', rating: 4.5, userRatingCount: 1200, priceLevel: 'PRICE_LEVEL_MODERATE', mapsUri: 'https://maps.google.com/?cid=123', whyItFits: 'Quiet corner tables, good wifi.' },
                    ],
                }),
            });
        });
        await page.goto('/projects/locus/');
        await page.fill('#searchInput', 'quiet coffee shop capitol hill');
        await page.click('#searchBtn');
        await expect(page.locator('.result-name')).toHaveText('Victrola Coffee');
        await expect(page.locator('.result-why')).toHaveText('Quiet corner tables, good wifi.');
        await expect(page.locator('.result-map-link')).toHaveAttribute('href', 'https://maps.google.com/?cid=123');
    });

    test('shows the empty-state message when the API returns no results', async ({ page }) => {
        await page.route('**/api/locus-search', (route) => route.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }),
        }));
        await page.goto('/projects/locus/');
        await page.fill('#searchInput', 'something extremely obscure');
        await page.click('#searchBtn');
        await expect(page.locator('#statusMessage')).toContainText('Nothing matched');
    });

    test('shows the error-state message when the API fails', async ({ page }) => {
        await page.route('**/api/locus-search', (route) => route.fulfill({ status: 502 }));
        await page.goto('/projects/locus/');
        await page.fill('#searchInput', 'ramen fremont');
        await page.click('#searchBtn');
        await expect(page.locator('#statusMessage')).toContainText('Something broke on my end');
    });

    test('escapes untrusted text in result cards (XSS check)', async ({ page }) => {
        await page.route('**/api/locus-search', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    results: [{ name: '<img src=x onerror=alert(1)>', address: '', rating: null, userRatingCount: null, priceLevel: null, mapsUri: null, whyItFits: '<script>alert(2)</script>' }],
                }),
            });
        });
        await page.goto('/projects/locus/');
        await page.fill('#searchInput', 'test');
        await page.click('#searchBtn');
        await expect(page.locator('.result-name')).toHaveText('<img src=x onerror=alert(1)>');
        const nameHtml = await page.locator('.result-name').innerHTML();
        expect(nameHtml).not.toContain('<img');
    });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx playwright test tests/smoke/locus.spec.js --project=desktop`
Expected: PASS (all 6 tests).

- [ ] **Step 3: Run the full smoke + unit suites to confirm no regressions**

Run: `npx playwright test tests/smoke tests/unit --project=desktop`
Expected: PASS (every existing test plus the 6 new smoke tests and Task 2's 11 unit tests).

- [ ] **Step 4: Commit**

```bash
git add tests/smoke/locus.spec.js
git commit -m "Add smoke tests for Locus"
```

---

## Manual provisioning steps (Kevin — not implementable by any task above)

These require account-level access (Google Cloud, live Supabase database, Vercel
project settings) that an implementer subagent does not and should not have:

1. In Google Cloud Console: create/reuse a project, enable billing, enable the
   **Places API (New)** specifically (not the legacy Places API).
2. Create an API key, restrict it to **API restrictions → Places API (New) only**
   (skip HTTP-referrer and IP restrictions — both are impractical for a serverless
   caller with no stable outbound IP).
3. **Set a hard daily quota cap** on that key in Cloud Console — this is the real
   cost-control backstop (the in-memory rate limiter is not distributed). Also set
   a billing budget alert as a secondary signal.
4. Add the key to Vercel project env vars as `GOOGLE_PLACES_API_KEY`.
5. Apply Task 1's migration (`supabase/migrations/20260711000000_create_locus_searches.sql`)
   against the live database — e.g. `supabase db push` from a machine with the
   project's database credentials, or via the Supabase dashboard's SQL editor.
6. Only after 1-5 are done does `/projects/locus` actually return real results in
   production — until then, `POST /api/locus-search` will 500 with "Server
   configuration error" (the handler's explicit `GOOGLE_PLACES_API_KEY` check).
