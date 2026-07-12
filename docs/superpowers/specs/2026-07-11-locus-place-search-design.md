# Locus — Natural-Language Place Search

**Date:** 2026-07-11
**Status:** Draft, pending spec review
**Context:** Kevin wants a new interactive project on klee.page: type a free-text
query ("quiet coffee shop to work from near Capitol Hill"), get back 5 real places
from Google Maps with plain-language explanations of why each fits. Requirements were
gathered via targeted questions (recommended option chosen at every step); remaining
technical/creative specifics (naming, copy, prompt engineering, API field masks,
failure-mode handling, rate-limit/cost tradeoffs) were resolved by consulting
fable-5, Gemini-3.5-flash, and GPT-5.6-sol in parallel rather than further questions.

## 1. What it does

Single search box, one-shot results (no chat/conversation history). User types a
free-text query. Backend: (1) an LLM call parses the query into a clean Places
search string + optional filters, (2) Google Places API (New) Text Search returns up
to 10 real candidates, (3) a second LLM call selects and ranks the top 5, writing a
one-line "why this fits" per result. Frontend renders 5 text-only cards: name,
rating, price level, the explanation, and a Google Maps link. No photos, no
geolocation ("near me") — location comes only from what the user types, which Places
Text Search already handles well (e.g., "near Capitol Hill Seattle").

## 2. Naming & copy (from fable-5)

- **Name: Locus** — a locus is "the set of points satisfying a condition," which is
  literally what this tool computes. Short, distinctive, fits the dry/technical
  register already established on `/projects` (e.g. the AI Workflow case study's
  "Treating LLMs as unreliable tools instead of oracles").
- **Tagline** (projects listing): *"Describe the place you want in plain English;
  get five real ones back, each with a reason."*
- **Search placeholder**: *"quiet coffee shop to work from near Capitol Hill"* — an
  example query beats an instruction, and it nudges users toward including a
  neighborhood/city (see §4's no-location fallback).
- **State microcopy**:
  - Loading: *"Asking around…"*
  - Empty: *"Nothing matched. Either it doesn't exist or I parsed your query wrong —
    rephrasing usually helps."*
  - Error: *"Something broke on my end — the model or the Places API. Give it a
    minute and try again."*
- **About blurb** (first-person, honest about limitations, not oversold): *"Locus
  does one thing: you describe a place in plain English, and it finds real ones. One
  LLM call turns your sentence into a structured search, Google Places returns
  actual candidates — so the places exist; nothing here is hallucinated — and a
  second pass ranks the top five and writes a line on why each fits. It's not
  perfect. The parser occasionally latches onto the wrong word, and 'why this fits'
  is an educated guess from ratings and metadata, not lived experience. But it beats
  panning around a map, most of the time."*

## 3. Architecture

```
POST /api/locus-search  { query: string }
  │
  ├─ 1. Validate: non-empty string, ≤300 chars, reject if not
  │
  ├─ 2. LLM call #1 (query → structured Places params)
  │      via api/chat.js's existing provider chain: cliproxy (Claude Sonnet) first,
  │      OpenAI gpt-4o-mini fallback. Strict-JSON output, schema-validated,
  │      extra/unknown keys rejected (prompt-injection defense — the model's
  │      output becomes API parameters, never raw instructions).
  │      Output: { searchText: string, minRating?: number, priceLevel?: string }
  │      If malformed JSON: fall back to the (sanitized) raw user query as
  │      searchText, no filters — never fail the whole request over a parse miss.
  │      Note: `minRating`/`priceLevel` are NOT asserted as Places API (New)
  │      request-body parameters here (unconfirmed exact field names at design
  │      time) — they're passed through as ranking signals to LLM call #2 instead
  │      (e.g. "the user implied a cheap/quiet spot — weight the explanation and
  │      ranking accordingly"), applied at the LLM layer rather than the Places
  │      request layer. The implementation plan should verify current Places API
  │      docs before deciding whether either can also be sent as a real Places
  │      request filter as an optimization — that's an enhancement, not required
  │      for v1.
  │
  ├─ 3. Google Places API (New) — Text Search
  │      POST https://places.googleapis.com/v1/places:searchText
  │      Headers: Content-Type: application/json,
  │               X-Goog-Api-Key: <GOOGLE_PLACES_API_KEY>,
  │               X-Goog-FieldMask: places.id,places.displayName,
  │                 places.formattedAddress,places.rating,places.userRatingCount,
  │                 places.priceLevel,places.primaryType,places.googleMapsUri
  │      Body: { "textQuery": "<parsed searchText>", "pageSize": 10 }
  │      (Deliberately Basic-tier fields only — omitting currentOpeningHours/
  │      openNow avoids bumping into the pricier "Places Details (Advanced)" SKU;
  │      openNow filtering is out of scope for v1.)
  │      Defend against Google's empty-result quirk: a zero-match search returns
  │      `{}`, not `{places: []}` — always `data.places || []`.
  │      If Places returns 0 results: skip LLM call #2 entirely, return
  │      { results: [] } with the empty-state message — don't spend a second LLM
  │      call ranking nothing.
  │
  ├─ 4. LLM call #2 (candidates → ranked top-5 + explanations)
  │      Same provider chain. Input: original user query + up to 10 raw candidates.
  │      Output: strict JSON { results: [{id, whyItFits}] } (≤5, best-match-first)
  │      or { noGoodMatches: true, results: [] } if nothing is a reasonable fit —
  │      the model is instructed to say so rather than force a bad match.
  │      If this call fails/times out/returns malformed JSON: don't discard the
  │      paid Places results — fall back to Google's own result order for all 10
  │      (trimmed to 5) with `whyItFits: null`, so the frontend still shows real
  │      places, just without explanations.
  │
  └─ 5. Merge Places data + LLM #2's ranking/explanations by id, return:
       { results: [{name, address, rating, userRatingCount, priceLevel, mapsUri,
                     whyItFits}] }  (≤5)
       Log asynchronously to Supabase (§5) — a logging failure never fails the
       search response itself.
```

### Failure-mode handling (from GPT-5.6 cross-check)

| Failure | Response |
|---|---|
| Empty/non-string/>300-char query | `400` |
| LLM #1 malformed JSON | Fall back to raw query as `searchText`, no filters |
| Places 0 results | `200 { results: [] }`, skip LLM #2 |
| Places 4xx | `502`, generic message, log details server-side only |
| Places 401/403 (key/config issue) | `503` |
| Places 429 | `503` + short `Retry-After` |
| Places 5xx/timeout | One retry with jitter if time budget allows, else `503` |
| LLM #2 timeout/malformed/refusal | Return Places' own top-5 order, `whyItFits: null` — never discard paid results |
| Supabase log write fails | Log server-side, don't fail the search |
| Any other exception | `500`, opaque public message, no stack/key leakage in the response |

## 4. Rate limiting & cost control (disclosed tradeoff)

Same in-memory `Map`-based limiter pattern as every other endpoint on this site
(`api/chat.js`, `api/subscribe.js`, `api/comments.js`): **10 requests/min/IP**. This
is consistent with the rest of the codebase but has the same known limitation
already disclosed for the comments endpoint — it's per-serverless-instance, not a
real distributed limit, so a determined/distributed abuser could exceed it. Unlike
the comments endpoint, **this one calls a paid third-party API on every request**
(2 LLM calls + 1 billed Places API call), so the real cost-control backstop is not
the application-level limiter — it's a **hard quota cap set directly in Google
Cloud Console** on the Places API (New) key (e.g., a daily request cap), which
actually stops spending regardless of how requests are distributed. This is a
required provisioning step, not optional hardening (see §6).

Additional cheap guards: query length capped at 300 chars, Places `pageSize: 10`
(never paginated), narrow field mask (§3, never `*`).

## 5. Logging

New Supabase table `locus_searches`, modeled closely on the existing `chat_logs`
shape (same columns, adapted):

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
```

`response` stores a compact array (not the full LLM prose or full Places payload):
`[{"place_id": "...", "name": "Victrola Coffee", "rank": 1}, ...]` — enough to see
what got returned without duplicating Google's full data or bloating the table.
RLS enabled, no anon policies (matches every other table — service-role-key-only
writes from the serverless function, same as `chat_logs`/`dispatch_subscribers`).

## 6. Provisioning (Kevin, before this ships — cannot be done by an implementer)

1. In Google Cloud Console: create or reuse a project, **enable billing** (Places
   API (New) requires it even within any free-tier usage), enable the **Places API
   (New)** API specifically (not the legacy "Places API").
2. Create an API key, restrict it under **API restrictions → Places API (New)
   only**. Skip HTTP-referrer restriction (irrelevant — this key is called from a
   server, not a browser) and skip IP restriction (impractical — Vercel serverless
   has no stable outbound IP without paying for Secure Compute).
3. **Set a hard daily quota cap** on that key in Cloud Console (the real
   cost-control backstop per §4) and a billing budget alert as a secondary signal.
4. Add the key to Vercel project env vars as `GOOGLE_PLACES_API_KEY` (server-side
   only — never sent to the browser, same handling as `SUPABASE_SERVICE_ROLE_KEY`).
5. Run the new Supabase migration (§5) against the project's database.

## 7. Frontend

New page: `projects/locus/index.html`, following the established project-subpage
pattern (`projects/ai-workflow/index.html`'s exact convention: plain
`<html lang="en">`, no `data-i18n-page` — English-only, no i18n, matching that
sibling case-study page rather than `projects/merfish`'s translated variant, since
this is a genuinely interactive tool where copy precision matters more than reach).
Inline `<style>` block per site convention, back-link to `/projects`, theme toggle.

Content: page title "Locus" + tagline, the about blurb, a search `<input>` +
submit button, a results area (5 cards or empty/error state), loading state while
the request is in flight. Result card: name, rating (e.g. "4.6 (230)"), price level
(`$`–`$$$$`), the `whyItFits` line (or omitted if null per the LLM #2 fallback),
"View on Google Maps →" linking to `mapsUri`. Both `name`/`whyItFits`/address are
escaped before insertion (same `escapeHtml` pattern as the comments widget — Places
data is Google-sourced but still untrusted external text).

## 8. Projects listing entry

Add a new **featured** entry to `projects/index.html` (matching the Pindrop/
Shredders/MERFISH treatment — a real, live, interactive tool, not a lower-key
"Also Built" list row), with the tagline from §2, tags (`Google Places API`, `LLM`,
`Vercel Functions`), and a "Try it →" link to `/projects/locus`. Needs matching
`data-i18n` keys added to `i18n/fr.json`/`ko.json`/`ja.json` since the main projects
listing page IS translated (unlike the Locus page itself) — same pattern as the
Japan-trip nav link on the homepage.

## 9. Out of scope (YAGNI)

- Geolocation / "near me" queries.
- Photos (Places Photo API — separate call, separate cost, separate complexity).
- Conversational refinement / chat history.
- `openNow` filtering (would require the pricier Places Details field tier).
- A distributed/durable rate limiter — the Google Cloud quota cap (§6) is the real
  backstop; the in-memory limiter matches existing site convention.

## 10. Acceptance

- A representative query returns 5 real, plausible places with working Google Maps
  links.
- A nonsense/no-location query degrades gracefully (empty-state message, not a
  crash) rather than returning garbage.
- Simulated Places-API failure and simulated LLM-#2 failure each degrade per §3's
  table (verified in the implementation plan's tests).
- No API key or internal error detail ever reaches the browser response.
- Logging failure never breaks a live search.
- Rate limiting matches existing site convention; the Google Cloud quota cap is
  documented as a required manual step for Kevin, not something the code can enforce.
