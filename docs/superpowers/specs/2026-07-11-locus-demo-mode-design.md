# Locus — Demo Mode & Graceful Degradation

**Date:** 2026-07-11
**Status:** Draft, pending spec review
**Context:** Amends `2026-07-11-locus-place-search-design.md`. Locus is live at
`/projects/locus` but currently returns a raw `500` on every search, because
`GOOGLE_PLACES_API_KEY` isn't provisioned yet (that's a manual Google Cloud
step documented in the original spec §6, still Kevin's to do). Kevin asked
for something better than "wait for the manual step" — this spec adds a real
demo mode instead of a vendor swap, after a 15-agent research pass ruled out
every free-API alternative (see §1).

## 1. Why not swap providers (decision record)

Two AI models (GPT-5.6-sol, Gemini) were consulted for alternatives to
Google Places' billing-required free tier. A 15-agent research fan-out
verified their recommendations against primary sources before any code
changed, and found the leading pick didn't hold up:

| Option | Verdict | Why |
|---|---|---|
| **Yelp Fusion/Places API** | **Rejected** | Converted to paid-only in Aug 2024 (confirmed via Yelp's own current docs + a TechCrunch report on the backlash). Free access is now a 30-day/5,000-call trial explicitly barred from "commercial deployment"; paid plans start at $229/mo and **require a credit card at signup** — the exact friction this was meant to avoid. |
| **Geoapify** | **Rejected** | Genuinely free, no card, 3,000 credits/day — but confirmed (3 independent sources) to have **no rating, review-count, or price field at all**. Locus's entire value is explaining *why* a place fits using rating/price/review signals; an LLM asked to rank places with none of that would produce confident-sounding but ungrounded explanations. |
| **Foursquare** | **Rejected** | Free tier exists but ratings/tips are Premium-only ("no free tier, paying from the first call") — same data-richness problem as Geoapify. Its own free-tier call limits are also in a confusing, self-contradictory transition as of mid-2026. |
| **OpenStreetMap (Nominatim/Overpass)** | **Rejected** | Nominatim's own usage policy explicitly names "auto-complete search" as something you "must not implement... using the API" against the public instance. OSM's data model has no native ratings/reviews concept (`stars=*` is reserved for objective board classifications, not user sentiment). |

**Conclusion:** there is no honest free replacement for Google Places that
keeps the tool's actual value proposition intact. Google Places (New)
remains the intended live provider — nothing about `api/locus-search.js`'s
Google Places integration changes. What both consulted models agreed on for
a different reason — a real demo mode — is what actually ships here.

## 2. What changes

`api/locus-search.js` gains a third response state. Today it's binary: a
live Google Places call succeeds, or a missing key / any failure returns an
opaque `4xx`/`5xx`. After this change:

- **`live`** — Google Places call succeeded. Unchanged behavior.
- **`degraded`** — a key is configured but the live call itself failed
  (timeout, 429, 5xx, malformed response). Same failure-mode table as the
  original spec §3, just now carrying a `source: "degraded"` tag the
  frontend can caption honestly instead of a bare error string.
- **`demo`** — no key is configured at all (today's actual state), or the
  request is a click on one of the four demo example chips (see §3).
  Returns real, honestly-sourced example data (§4) with an explicit label.

`GOOGLE_PLACES_API_KEY` missing no longer returns `500`. It returns `200`
with `source: "demo"` and a small labeled set of results — the tool works
and looks intentional *today*, before Kevin ever touches Google Cloud.

### Response shape

```json
{
  "source": "live" | "degraded" | "demo",
  "reason": "timeout" | "places_rate_limited" | "key_invalid" | "upstream_error" | "key_missing" | null,
  "results": [ { "name", "address", "rating", "userRatingCount", "priceLevel", "mapsUri", "whyItFits" } ]
}
```

Note: `reason: "places_rate_limited"` (Google Places itself returning 429) is
distinct from the app-level request limiter (10/min/IP, unchanged from the
original spec) — the app-level limiter still returns a real HTTP `429` with
its existing `{ error: "Too many requests..." }` body, before any of this
logic runs. Only Places' *own* rate-limit response gets folded into
`source: "degraded"` at HTTP `200`.

`results` keeps the exact same per-item shape in all three modes — the
frontend never branches on item shape, only on `source`.

### Backend logic (`api/locus-search.js`)

```javascript
const DEMO_QUERIES = [
    { query: 'quiet coffee shop to work from near Capitol Hill', ... },
    { query: 'date night ramen spot in Fremont', ... },
    { query: 'a bar where you can actually hear people talk, in Ballard', ... },
    { query: 'best view brunch spot in downtown Seattle', ... },
];

function findDemoMatch(cleanQuery) {
    const normalized = cleanQuery.trim().toLowerCase();
    return DEMO_QUERIES.find((d) => d.query.toLowerCase() === normalized) || null;
}
```

In `handler`, immediately after sanitizing the query:

1. If `!GOOGLE_PLACES_API_KEY`: skip straight to demo — try `findDemoMatch`;
   if it matches one of the four, return that record with
   `source: "demo", reason: "key_missing"`. If it doesn't match (a visitor
   typed a custom query with no key configured), return `source: "demo",
   reason: "key_missing"` with **all four** demo records and a `note`
   explaining live search isn't configured yet — never silently substitute
   one demo answer for an arbitrary query as if it were a real match to
   *that* query.
2. If the key IS present: try the existing live path unchanged. On success,
   `source: "live"`. On failure, map the original spec's failure-mode table
   to a `reason` and return **200** instead of the original `502`/`503`:
   401/403 → `reason: "key_invalid"`; Places 429 → `reason:
   "places_rate_limited"`; timeout/5xx → `reason: "timeout"` or
   `"upstream_error"` respectively. HTTP status is `200` for every
   non-4xx-request-validation case, so the frontend has one code path (only
   the app-level rate limiter's `429` and request-validation `400` remain
   real non-200s, matching the original spec — nothing about input
   validation changes). On any of these failures, respond with the demo
   dataset (§4) as `results`, `source: "degraded"`, and the matching
   `reason` — same principle as `key_missing`: never leave the visitor
   looking at a blank/broken screen.
3. A demo-chip click always calls the same `POST /api/locus-search`
   endpoint with the demo query's exact text — no separate endpoint, no
   client-side-only demo data. The server matches it via `findDemoMatch`
   and returns the pre-baked record with `source: "demo"`. This keeps the
   demo path exercised by the same code the live path runs through
   (sanitization, rate limiting, logging), and means the frontend has no
   separate demo-rendering code path — same `renderResults`.

Demo searches still call `logSearch` (marked distinctly, e.g.
`query` prefixed or a `source` column value — reuse the existing
`response` jsonb shape, add nothing new to the `locus_searches` table).

## 3. Frontend (`projects/locus/index.html`)

- Four demo-query chips rendered below the search input, above the results
  area: pill-shaped buttons (matching this site's existing toggle/pill
  visual language), labeled "Try:" followed by the four queries verbatim.
  Clicking a chip **populates the input AND submits immediately** — unlike
  a live query, there's no ambiguity to let the user edit (it's a fixed,
  known-good example), and instant results are the point.
- Every result set carries a small caption directly above the cards, driven
  by `source`:
  - `live`: no caption (unchanged).
  - `degraded`: *"Live search hit a snag — here's a saved example while it
    recovers."* — shown only when a live attempt was actually made and
    failed, never on first load.
  - `demo`: *"Demo data — live search isn't wired up yet. These four are
    real places with real ratings, frozen for now."* Honest, not
    apologetic, consistent with the existing about-blurb's voice.
- No change to escaping/rendering — demo records go through the exact same
  `escapeHtml` + card-building code as live results.

## 4. Demo dataset (real places, sourced 2026-07-11)

Four real Seattle places, one per example query, each independently
web-searched for a current rating/review-count/price/address (primary
source: Google Maps data via Wanderlog aggregation, cross-checked against
Yelp where available — Yelp numbers differ somewhat platform-to-platform;
Google's numbers are used since that's the platform Locus's live path
queries). This is a frozen snapshot, not a live feed — treat as
approximately accurate as of this date, not perpetually current.

| Query | Place | Address | Rating | Price |
|---|---|---|---|---|
| quiet coffee shop to work from near Capitol Hill | Espresso Vivace Roasteria | 532 Broadway E, Seattle, WA 98102 | 4.5 (1,515) | $ |
| date night ramen spot in Fremont | Ooink | 3630 Stone Way N, Seattle, WA 98103 | 4.3 (285) | $$ |
| a bar where you can actually hear people talk, in Ballard | The Ballard Smoke Shop | 5439 Ballard Ave NW, Seattle, WA 98107 | 4.4 (452) | $ |
| best view brunch spot in downtown Seattle | Goldfinch Tavern | 99 Union St, Seattle, WA 98101 | 4.3 (1,011) | $$$ |

Full records (exact `whyItFits` text, `mapsUri`, `userRatingCount`) are
specified in the implementation plan's Task brief verbatim — not repeated
here to avoid drift between two documents.

## 5. Testing

- Unit tests (`tests/unit/`) for `findDemoMatch`: exact match, case
  insensitivity, whitespace, and no-match cases.
- Smoke tests (`tests/smoke/locus.spec.js`, extended): mock
  `/api/locus-search` to return each of the three `source` values and
  assert the frontend renders the correct caption (or none) for each; a
  real (unmocked) click-through of all four demo chips against the actual
  deployed `key_missing` behavior, since demo mode has no real API cost —
  this is the one place in this feature where hitting the real endpoint in
  an automated test is fine, unlike the live-Places path.
- No changes to the existing mocked-live-search or error-state tests.

## 6. Out of scope

- No new Supabase migration — reuses `locus_searches` unchanged.
- No admin/refresh mechanism for the demo dataset — it's a static snapshot,
  regenerate manually if it goes stale (a place closing, rating drifting).
- No geolocation-based demo selection — the four queries are fixed for
  everyone.
- Google Places integration itself is unchanged — once Kevin completes the
  original spec's §6 provisioning, `source: "live"` starts flowing with no
  further code changes.

## 7. Acceptance

- Visiting `/projects/locus` today (no API key configured) and clicking any
  demo chip returns real results with an honest `demo` caption — no 500,
  no crash.
- Typing a custom query today (no key) returns the demo set with a `note`
  clarifying it isn't a match to that specific query, not a fabricated
  "match."
- Once a key is configured and live, all `demo`-mode behavior stays dormant
  and unreachable except via `key_missing`/simulated-failure tests.
- No demo record's rating/address/link is fabricated — each has a cited
  source in the implementation plan.
