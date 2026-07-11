# Japan Trip Itinerary Page — "The Wakayama Hotfix"

**Date:** 2026-07-11
**Status:** Draft, pending spec review
**Context:** Kevin has a real trip booked for October 2026 (Kansai-south Japan: Wakayama /
Shirahama / Kushimoto), sourced from a Korean travel agency (Lotte Tour) package he
was evaluating. He wants a fun, detailed, shareable page on klee.page presenting the
itinerary to friends, who can leave comments. Content was enriched via a researcher
agent (destination facts + onsen etiquette) and an HN-mining pass (feature/creative
ideas); creative tone was drawn from three independent passes (fable-5, Gemini,
GPT-5.6-sol) that converged on dry/understated, software-engineer-voiced humor over
travel-blog enthusiasm. Technical decisions were adversarially reviewed via `/gauntlet`
(Gemini + GPT-5.6-sol, correctness + assumptions lenses) — verdict **PASS-WITH-FIXES**;
fixes are folded into the decisions below and disclosed tradeoffs are called out
explicitly.

## 1. The real itinerary (source of truth for all copy)

4 days, October 2026, round-trip Asiana Airlines (OZ), Gimpo ↔ Kansai:

| Day | Route / stay |
|---|---|
| 1 | Fly OZ1165 Gimpo 17:40 → Kansai 19:20. Sleep near the airport: **Odysis Suite Osaka Kansai Airport Hotel** (high-floor tower, ocean/city view, 15th–26th floor). |
| 2 | South to Shirahama. Stay: **Shirahama Key Terrace Hotel Seamore** — onsen hotel on Shirahama beach, infinity foot bath + ocean-facing open-air salt bath, one of Japan's storied hot-spring towns. |
| 3 | Further south to Kushimoto. Stay: **Mercure Wakayama Kushimoto Resort & Spa** — ocean-view open-air bath near Kushimoto Bridge, gets Pacific + bridge views. |
| 4 | Back to Kansai, fly OZ1155 Kansai 20:30 → Gimpo 22:25. |

5 highlighted sights (with the facts that matter for October specifically):

- **Engetsu Island** — rock arch over the ocean; the famous "sun perfectly through the arch" shot is an **equinox-only** event (late March / ~Sept 23), *not* an October phenomenon — copy must not oversell this, play it as self-aware comedy instead (sunset itself is still lovely, ~5:30–6:00pm in October).
- **Shirasaki Marine Park** — white rock coastline nicknamed "Japan's Aegean Sea."
- **Nachi Falls** — Japan's tallest single-drop waterfall (133m), beside the red 3-story Seiganto-ji pagoda; reached via the Daimonzaka stone-step trail through 800-year-old cedars (~2.5–3hr round trip from the parking lot). No direct train from Shirahama/Kushimoto — JR to Kii-Katsuura (~2hr from Shirahama, ~30-40min from Kushimoto) then a local bus.
- **Wakayama Castle** — built 1585 under Toyotomi Hideyoshi, blue-stone walls (Kishu specialty), later a Tokugawa Gosanke seat.
- **Sandanbeki cliffs** — 50m sea cliffs; an elevator drops 36m into a sea cave once used by the Kumano Suigun navy to hide boats (¥750 adult).

Food: Wakayama tuna sukiyaki set, hotel dinner buffet (free-flow drinks once), Wakayama
ramen (rich tonkotsu-shoyu, quirky help-yourself boiled-egg/pressed-mackerel-sushi side
table).

October practicalities: pleasant mid-20s°C, ~14 rainy days/month (mostly light), typhoon
risk much lower than Aug/Sept (~0.3 landfalls average). Onsen etiquette: wash before
entering, no swimsuits, tattoo policy varies by hotel — worth a quick note since 2 of 3
nights are onsen resorts.

## 2. Creative direction

Three independent creative passes (fable-5, Gemini-3.5-flash, GPT-5.6-sol) converged
independently on the same register: **dry, self-aware, "itinerary as software project"
humor**, not exclamation-mark travel-blog energy. Final copy blends the strongest lines
from each pass during implementation; the anchors are:

- **Title**: *"The Wakayama Hotfix"* (alt: *"Kevin Goes Slightly Further South"*)
- **Opening blurb**: *"I planned a four-day run down the Wakayama coast in October, and
  because I'm an engineer I built a webpage about it instead of just texting you.
  Everything below is real and mostly booked. This page has a comments section, which
  means the itinerary is now open source — tell me what I got wrong, what I'm missing,
  or what snack you want smuggled back. I will read all feedback from a bathtub facing
  the Pacific."*
- **Stat block** (deadpan, static HTML + CSS, no framework): `4 days · 3 onsen soaks ·
  5 sights · 2 flights · ∞ opportunities to forget a towel`
- **Comments prompt**: *"Open an issue. Known bugs: no equinox, possible rain. Feature
  requests, roasts, and souvenir orders all accepted — the itinerary ships in October
  regardless."*
- **Per-stop captions**: one punchy line per day (4) and per sight (5), verified against
  section 1's facts — e.g. Engetsu Island's caption explicitly jokes about missing the
  equinox rather than implying the arch-sunset alignment will happen.
- **Visualizations** (all vanilla HTML/CSS/JS, no build step):
  1. Live T-minus countdown to the Gimpo departure, monospace/terminal-styled.
  2. Days rendered as uptime-monitor rows (*"Day 2: OPERATIONAL — soak levels
     nominal"*).
  3. A `console.log` easter egg: the itinerary as JSON with a comment
     `// for the friends who were always going to open dev tools`.
  4. Per-stop route reveal on scroll (see §3.5 — replaces an earlier, more fragile
     continuous-path design per gauntlet finding).

## 3. Technical decisions

### 3.1 Page location & structure

New static page: `/japan-trip/index.html`. Follows the existing sub-page convention —
inline `<style>` block duplicating the site's CSS custom properties (only root
`index.html` uses the shared `css/main.css`, per project CLAUDE.md). Loads
`js/theme.js` and `js/i18n.js`. Section order: hero (title/blurb/countdown/stat block)
→ route map → day-by-day cards (1–4) → 5-highlights cards → hotel cards → food section
→ practical tips (weather, onsen etiquette) → comments widget → footer.

### 3.2 Nav integration

New "Travel" section added to `index.html`, matching the existing "Dispatch" section
pattern (heading + one-line subtitle + link):

```html
<section>
    <h2 data-i18n="index.travelHeading">Travel</h2>
    <p data-i18n="index.travelSubtitle">Where I'm headed next.</p>
    <p><a href="/japan-trip" data-i18n="index.travelLink">See the itinerary</a></p>
</section>
```

New keys (`index.travelHeading`, `index.travelSubtitle`, `index.travelLink`) get real
translations added to `i18n/fr.json`, `i18n/ko.json`, `i18n/ja.json` (index.html is a
translated page). `i18n/en.json` is not touched — confirmed dead code path; `i18n.js`
only fetches a translation file when `currentLang !== 'en'`.

### 3.3 i18n scope

The `/japan-trip` page's own content (itinerary, captions, etc.) is **English-only** —
no `data-i18n` attributes, no new JSON entries for it. Verified safe: `i18n.js`'s
`applyTranslations()` only overwrites text `if (val)` is truthy, so a missing key
silently leaves the original English text in place (no "undefined" rendering). A
visitor browsing in FR/KO/JA will see the site chrome (nav, footer, theme toggle)
translated and the itinerary body in English — an intentional, disclosed tradeoff, not
a bug.

### 3.4 Comments backend

Reuse the existing `dispatch_comments` table + `/api/comments.js` serverless endpoint
as-is (no new migration) — service-role-key-gated, RLS fully locked (no anon policies
exist on any table as of `20260308200000_tighten_rls_and_constraints.sql`), IP rate
limited (5 req/min, in-process).

- **Issue slug**: `trip-japan-oct` (not a bare `japan-oct26`) — gauntlet finding #3:
  fixed by clearly namespacing the slug so it can't ambiguously collide with a real or
  future newsletter issue slug.
- **Honeypot**: add an *optional* hidden-field + elapsed-time check to
  `api/comments.js`, mirroring `js/subscribe.js`'s pattern, scoped to this page's form
  only. Gauntlet finding #2 (unanimous, 4/4 seats): an optional check is a no-op
  against a bot that calls the API directly and omits the field. **Accepted as a
  disclosed tradeoff** — closing it fully would mean retrofitting all 8 existing
  newsletter comment forms, which is out of scope for this page. The honeypot still
  raises the bar against generic/naive bots, same ceiling every existing form on the
  site already has.
- **Rate limiting**: gauntlet finding #1 (3/4 seats) — the in-process `Map` resets per
  cold start / isn't shared across concurrent instances, so a distributed bot can
  exceed 5/min/IP. **Accepted as a disclosed tradeoff** — this is a pre-existing
  characteristic of every comment/subscribe endpoint on the site today, not a
  regression introduced here.
- **No moderation UI, no auth, no delete path** short of direct Supabase access — same
  trust model as existing dispatch comments. Gauntlet finding #5 (unique, weighted up):
  since this page is nav-linked (more discoverable than a newsletter issue URL), this
  is called out explicitly for Kevin's sign-off rather than silently inherited.
- **Before shipping**: do a quick manual check (grep the iOS app's known table list /
  ask if anything queries `dispatch_comments`) per gauntlet finding #7 — flagged
  PLAUSIBLE, not confirmed; `supabase/DISPATCH_PLATFORM_SCHEMA.md` only documents
  `profiles`/`articles` as iOS-shared, `dispatch_comments` isn't mentioned there at
  all, so this is likely a non-issue but worth 30 seconds of verification.

### 3.5 Route map / scroll animation

**Revised from the original continuous-scroll-path concept** per gauntlet finding #4
(6 distinct findings across all 4 seats, converging with Claude's own Round-0 take):
a whole-page `stroke-dasharray`/`stroke-dashoffset` path-draw driven continuously by
scroll position is fragile — stale path length on resize/content-load, and risks
leaving the route invisible if `prefers-reduced-motion` triggers an early return
before the "fully drawn" state is ever applied.

**Fix**: per-stop reveal via `IntersectionObserver` instead — each stop's marker/label
on a simple static SVG map lights up / fades in when its corresponding day-card
scrolls into view. No total-path-length dependency, no responsive-breakpoint
recompute, and it naturally respects `prefers-reduced-motion` (CSS default state is the
final/visible state; JS only adds the "not yet revealed" treatment for motion-OK
visitors — same defensive-default principle as `js/header-scroll.js`).

### 3.6 Imagery & Google Maps links

The only itinerary photos on hand (scraped from Lotte Tour's promotional page) are
copyrighted agency marketing images and will **not** be used. Instead:

- A small number (3–5) of separately-sourced, properly licensed (Unsplash/Wikimedia
  Commons free-license) photos of the real locations for hero/section art — roughly one
  each for the hero (Kii peninsula coastline), Nachi Falls, and the Shirasaki/Sandanbeki
  white-rock coast. Attribution credited in the page footer where the license requires
  it.
- A Google Maps deep-link per stop: `https://www.google.com/maps/search/?api=1&query=`
  + `encodeURIComponent(placeName)` — gauntlet finding #6, trivial fix, no API key
  needed.

## 4. Files touched

- `japan-trip/index.html` — new page.
- `index.html` — new "Travel" section + nav link.
- `i18n/fr.json`, `i18n/ko.json`, `i18n/ja.json` — 3 new keys each (`travelHeading`,
  `travelSubtitle`, `travelLink`).
- `api/comments.js` — add optional honeypot/elapsed check (backward compatible; existing
  newsletter comment pages unaffected since the fields stay optional).

No new Supabase migration. No changes to existing `newsletter/*/index.html` pages.

## 5. Out of scope (YAGNI)

- Emoji reactions / tallies (user confirmed comments-only is fine).
- A standalone visual theme distinct from the site's design system (user chose to match
  the existing system).
- Retrofitting honeypot protection onto the 8 existing newsletter comment pages.
- A persistent (Supabase-backed) rate limiter to replace the in-process one.
- Any comment moderation/admin UI.
- Full i18n translation of itinerary content into FR/KO/JA.

## 6. Acceptance

- `/japan-trip` renders correctly in light + dark theme, matches the site's design
  system (Newsreader font, `--bg`/`--text` vars).
- Countdown, stat block, and per-stop scroll-reveal all work; scroll-reveal degrades to
  fully-visible-static under `prefers-reduced-motion` (verify explicitly — this is the
  exact failure mode gauntlet flagged).
- Comments widget posts to `/api/comments` with `issue=trip-japan-oct` and round-trips
  (post → appears in list) without touching any existing newsletter issue's comment
  thread.
- Nav link from `index.html` works and its 3 new i18n keys render correctly in FR/KO/JA;
  switching languages and back to English still restores the original English text
  everywhere (already-verified existing behavior, not new).
- All Google Maps links open the correct real-world location.
- Mobile (≤768px) layout doesn't break for any new section.
- Manual check on the iOS-schema-conflation question (§3.4) done before/at ship time.
