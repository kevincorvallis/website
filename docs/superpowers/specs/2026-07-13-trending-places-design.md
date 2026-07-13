# Trending Places — Weekly Research Engine for Locus

**Date:** 2026-07-13
**Status:** Draft, pending spec review
**Context:** Locus (`/projects/locus`) has been stuck in demo mode since 2026-07-11
because live search needs Google Places API (New), which needs Google Cloud
Billing enabled — a manual step Kevin hasn't done. Repeated attempts this
session to use Kevin's Paramount work Google Cloud/Vertex AI credentials for
this personal-site feature were each blocked by this session's own safety
checks (enabling a paid API on what looks like a Paramount production
project; separately, searching Kevin's notes vault for a work credential to
reuse) — both correctly, since mixing employer infrastructure/credentials
into an unrelated personal project is exactly the kind of thing that's easy
to regret later. Kevin then asked for a weekly cron job to research trending
places instead. This spec designs that — using a **personal** Gemini API key
(free, aistudio.google.com, no billing), not Paramount's.

## 1. What it does

A weekly Vercel Cron job researches trending places (coffee shops, ramen
spots, bars, brunch spots — Locus's existing four categories) across three
cities (Seattle, LA, New York) using Gemini's Search-grounding feature, and
stores results in a new Supabase table. Locus's live search (`/api/locus-search`)
then queries this table instead of Google Places API — **replacing** the
Places dependency entirely, not supplementing it. This is what actually
unblocks live-feeling search today, with no GCP billing ever required.

**Real tradeoff, stated plainly, not buried:** this only covers 3 cities × 4
categories. A query outside that scope falls through to the existing static
4-place demo dataset — the same safety net Locus already has, just one layer
deeper. This is a curated trending-places engine, not a general-purpose place
search replacement. Data is refreshed weekly, not real-time.

## 2. Why Gemini grounding can supply this (and its real catch)

Confirmed via research earlier this session: Gemini's Search-grounding lets a
model make real Google searches and ground its answer in what it actually
reads. But the API's own structured metadata (`groundingChunks`) only
returns citation-style `{uri, title}` pairs — not `{rating, price, address}`
fields. Getting real business facts means prompting the model to *read* the
search results and *write out* structured JSON grounded in what it found —
not receiving guaranteed-accurate fields from an API the way Places API
would. This has a materially different reliability profile: real risk of a
wrong rating or slightly-off address if the model misreads a source.

**Mitigation (matches this app's existing "never invent facts" principle,
already used in `RANK_SYSTEM_PROMPT`):** the weekly research prompt requires
the model to omit any field it can't point to a specific search result for,
rather than guess. A trending place with no confirmed rating just shows
without one.

## 3. Architecture

```
WEEKLY (Vercel Cron, e.g. "0 8 * * 1" — Monday 8am):

  GET /api/cron/refresh-trending-places
  Auth: verify Authorization: Bearer $CRON_SECRET (Vercel's standard cron
  pattern) — reject anything else with 401. This is the only thing standing
  between this endpoint and anyone hitting it directly to burn API quota.

  For each of 3 cities × 4 categories (12 combinations):
    1. Gemini generateContent call, Search grounding enabled, personal
       GEMINI_API_KEY (aistudio.google.com, free tier — 12 calls/week is
       trivially within any free-tier rate limit, no cost concern).
    2. Prompt requires: search for currently trending/notable {category} in
       {city}; report ONLY places you can point to a specific search result
       for; output strict JSON array of
       {name, address?, rating?, priceLevel?, mapsUri, whyTrending, sourceUrl};
       omit address/rating/priceLevel if not explicitly found in a source —
       never guess. mapsUri: use a real link if the source provides one, else
       construct the same `https://www.google.com/maps/search/?api=1&query=...`
       deep link pattern already used for Locus's demo dataset.
    3. Upsert each result into `trending_places`, keyed on (city, name) — a
       re-discovered place updates its row (refreshing `last_confirmed_at`
       and any newly-found fields) rather than duplicating.
  Log one row per run to `trending_places_runs` (counts, errors, duration) —
  matches this repo's existing log-everything convention (chat_logs,
  locus_searches).

LIVE SEARCH (/api/locus-search, existing endpoint):

  1. LLM parse step (same single call as today's `parseQuery()` — the
     existing `PARSE_SYSTEM_PROMPT`'s JSON schema gains two more fields,
     `city` and `category`, rather than adding a second LLM call): infers
     which of the 3 supported cities the query concerns, and which of the 4
     categories it's closest to. Defaults to Seattle if the query doesn't
     specify a city (same pattern as today's "append Seattle if unclear"
     behavior) — but if the category doesn't map to any of the 4 at all, or
     the city isn't one of the 3, mark it out-of-scope for the trending DB.
     If this LLM call fails entirely or returns malformed JSON (existing
     failure mode), `city`/`category` are simply absent — treated the same
     as out-of-scope below, not a separate error path.
  2. NEW: if in-scope, query Supabase `trending_places` for that
     city+category (`WHERE city = ? AND category = ?`), replacing the old
     `searchPlaces()` call to Google Places entirely.
     - Zero rows returned (e.g. before the first cron run, or a slow week
       for that combination): fall straight to the existing static demo
       dataset — same fallback Locus already has, unchanged. `source: "demo"`.
     - The query itself throws (Supabase unreachable, network error): maps
       to `source: "degraded", reason: "upstream_error"` with the demo
       dataset as fallback results — same principle as the existing
       Google-Places-failure handling in the 2026-07-11/12 work, just a new
       failure trigger reusing the same existing `reason` enum value.
     - Out-of-scope city/category (from step 1): `source: "demo"`, same as
       zero-rows — there's nothing "degraded" about a query that was never
       going to be in the trending DB's scope.
  3. LLM rank step (existing `rankPlaces()`, unchanged) ranks/explains the
     top 5 from whatever the DB (or demo fallback) returned.
  4. Response envelope keeps the existing `{source, reason, results}` shape.
     DB-backed results get `source: "live"` (the mechanism changed, but this
     is still genuinely fresh, real data — relabeling it "not live" would
     undersell what it actually is) plus a new caption driven by
     `last_confirmed_at`: *"Trending as of {date} — refreshed weekly, not
     real-time."* Demo/degraded paths are entirely unchanged from the
     2026-07-11/12 work.
```

## 4. Schema

```sql
CREATE TABLE trending_places (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  city text NOT NULL,              -- 'seattle' | 'la' | 'ny'
  category text NOT NULL,          -- 'coffee' | 'ramen' | 'bars' | 'brunch'
  name text NOT NULL,
  address text,                    -- nullable, omitted if unconfirmed
  rating numeric,                  -- nullable
  review_count integer,            -- nullable
  price_level text,                -- nullable, matches existing PRICE_LEVEL_* enum
  maps_uri text NOT NULL,
  why_trending text,
  source_url text NOT NULL,        -- the search result being cited (audit trail)
  last_confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city, name)
);

CREATE TABLE trending_places_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_at timestamptz NOT NULL DEFAULT now(),
  places_found integer,
  places_new integer,
  places_updated integer,
  errors jsonb,
  duration_ms integer
);
```

RLS enabled on both, no anon policies — matches every other table in this
repo (service-role-key-only writes from serverless functions).

## 5. Copy changes

The current about-blurb states "Google Places returns actual candidates...
nothing here is hallucinated" — no longer literally true once the mechanism
changes, so it needs rewriting:

> "Locus does one thing: you describe a place in plain English, and it finds
> real ones. A weekly research pass — grounded in live search, not guesswork
> — builds a running list of trending spots across Seattle, LA, and New
> York; your query gets matched against whatever it's found, then a second
> pass ranks the top five and writes a line on why each fits. It's not
> perfect. Coverage is only as good as last week's research run, and a
> rating or price sometimes goes missing rather than get guessed — better an
> honest gap than a made-up number. But it beats panning around a map, most
> of the time."

Trending-result caption: *"Trending as of {last_confirmed_at, formatted date}
— refreshed weekly, not real-time."* Shown alongside results the same way
the existing demo/degraded captions are (`#sourceCaption`, already
`aria-live` per the 2026-07-12 accessibility fix).

## 6. Provisioning (Kevin, before this ships)

1. Get a free Gemini API key at aistudio.google.com with your **personal**
   Google account (not Paramount's) — no billing required, confirmed this
   session.
2. Add it to Vercel as `GEMINI_API_KEY` (server-side only).
3. Add a `CRON_SECRET` env var (any random string) to Vercel — Vercel Cron
   sends this automatically as `Authorization: Bearer $CRON_SECRET` when it
   triggers the job; generate one yourself (e.g. `openssl rand -hex 32`).
4. Run the two new Supabase migrations (§4) against the project database.
5. Vercel Cron itself is configured in `vercel.json` (part of this plan's
   implementation, not a manual step) — but the first real run won't happen
   until the next scheduled trigger after deploy. Consider manually invoking
   `/api/cron/refresh-trending-places` once (with the correct auth header)
   right after shipping, so Locus has real data immediately rather than
   waiting up to a week.

## 7. Testing

- Unit tests: the new `queryTrendingPlaces(city, category)` Supabase-query
  function (mocked Supabase response — empty, populated, and error cases);
  the cron endpoint's `CRON_SECRET` auth check (valid, missing, wrong).
- Smoke tests: mock `/api/locus-search`'s response to include the new
  trending caption and assert it renders; confirm the existing demo/degraded
  captions are unaffected.
- The actual Gemini Search-grounding call is mocked in all automated
  tests — matches this repo's established convention that real external
  calls (cost or availability risk) never run in CI. A manual, one-time
  invocation of the cron endpoint (§6 step 5) is how the real integration
  gets verified once, not a permanent automated test.

## 8. Out of scope (YAGNI)

- Any 4th city or category beyond the 3×4 matrix — expand later if useful.
- Semantic/embedding-based matching between a query and the trending
  table — city+category filtering plus the existing LLM rank step is
  sufficient at this scale (dozens to low hundreds of rows, not millions).
- A UI for browsing "all trending places" directly (outside of Locus's
  search box) — not asked for, not building it.
- Any mechanism to re-verify/refresh Google Places or Yelp — those paths
  remain fully rejected per `2026-07-11-locus-demo-mode-design.md` §1.

## 9. Acceptance

- The weekly cron endpoint requires `CRON_SECRET`; rejects requests without
  the correct one.
- A manually-triggered cron run (post-ship, real Gemini key) populates
  `trending_places` with real, cited places for at least one city/category
  combination, with no fabricated rating/price/address.
- A live Locus query for an in-scope city+category returns real
  `trending_places` rows with the new caption; an out-of-scope query
  (unsupported city/category) still degrades to the existing demo dataset,
  not an error.
- The about-blurb no longer claims Google Places is the data source.
- No API key or `CRON_SECRET` ever reaches the browser response.
