# klee.page /ai — Design Spec

**Date:** 2026-07-03
**Status:** Approved (design sections approved in-session)

## Goal

A dedicated, shareable AI chat page at **klee.page/ai** ("Ask Kevin") that represents all of Kevin — career, PookieB projects, photography/film, flying — replacing the fragile inline chat widget on /resume/ with a proper, maintainable interface.

## What exists today

- `api/chat.js`: streaming SSE Vercel function; colette cliproxy (Claude) primary, OpenAI gpt-4o-mini fallback; 10 req/min/IP rate limit; Supabase `chat_logs`; `<user_input>` injection defense; resume-only SYSTEM_PROMPT.
- `/resume/` inline chat IIFE inside a 1,165-line HTML file — broke in June when an i18n edit desynced function headers; hard to maintain.

## Design

### Page: `ai/index.html`

Site-native sub-page (vanilla HTML, inline `<style>` per site convention, Newsreader, `--bg`/`--text` custom properties, 620px column, `data-i18n-page="ai"`, shared `js/theme.js` + `js/i18n.js`, theme-flash-prevention head script, theme toggle + language links in the standard chrome).

Layout: header ("Ask Kevin" + one-line subtitle), scrollable message log filling the viewport, composer pinned at the bottom (textarea + send button, safe-area inset padding). Empty state shows 6 suggestion chips spanning career / projects / photography / flying. OG meta tags (title, description) for link unfurls.

### Component: `js/ai-chat.js`

Self-contained module (no framework). Responsibilities:

- POST `/api/chat` `{message, history}`; parse SSE; stream tokens into the current bubble with a ▍cursor while streaming.
- **Markdown subset** rendering: bold, italic, inline code, unordered/ordered lists — implemented via text-node splitting (never `innerHTML` on model output).
- **History**: kept in `sessionStorage` (`ai-chat-v1`), restored on load, Clear button wipes it. Last 10 turns sent as `history` (matches API).
- **Deep links**: on load, if `?q=` present and history empty → prefill and auto-send. Share button copies `https://klee.page/ai?q=<encoded first user message>`.
- **States**: composer disabled while streaming; 429 → friendly "give it a minute" message; network/5xx → inline error with Retry; empty input ignored.
- **A11y**: message log `aria-live="polite"`, `role="log"`; focus returns to textarea after send; `prefers-reduced-motion` disables the cursor blink.
- Suggestion chips call the same send path; chips hide once a conversation exists.

### Backend: `api/chat.js` (prompt-only change)

SYSTEM_PROMPT expands from resume-only to full persona. Keep verbatim: SECURITY RULES (incl. no code/commands/URLs), VOICE, all sanitization/rate-limit/streaming/logging code, 500-token cap, 500-char message cap. Add sections sourced only from the site's own pages:

- **Photography & film** — shoots film; interactive Exposure Triangle explainer on the site; portfolio of PNW work.
- **Flying** — private pilot flying single-engine aircraft; volunteer missions for Angel Flight West around the Pacific Northwest; "most meaningful thing I do outside work."
- **Dispatch** — the newsletter: essays on engineering and life (e.g., "Clean Pain" — on love, in EN/KO); ~8 issues.
- **Personal** — Seattle; Army veteran (West Point-trained, S-4 logistics); USC CS '22.
- Guidance line: when a topic maps to a site page, describe it in words but do not emit URLs (security rule retained).

### Site wiring

- `index.html` (**CRLF** — edit with CRLF preserved): line ~82 `Resume · Now` becomes `Resume · Now · Ask my AI` (`/ai`, `data-i18n="index.aiLink"`).
- `resume/index.html` (LF): remove the chat section (styles `.chat-*`, the chat HTML section, and chat script) and replace with a short section: "Want to ask about any of this? → Ask my AI" linking to `/ai`.
- `i18n/{en,fr,ko,ja}.json`: new top-level `ai` section (heading, subtitle, placeholder, send, clear, share, copied, errorRate, errorNetwork, retry, chip1–chip6) + `index.aiLink` + `resume.aiCta`.

### Out of scope

- Link-emitting concierge mode; embedded chat on /resume/; auth/identity; server changes beyond the prompt; Playwright CI.

### Deploy & verification

Push to `master` → Vercel production. Verify live: (1) `curl` `/api/chat` streams a reply mentioning flying (new knowledge); (2) load `klee.page/ai` — send a message, streaming renders; (3) `?q=` deep link auto-asks; (4) light/dark, KO locale, 375px viewport; (5) resume page shows the CTA and no dead chat code. Update the klee.page vault note.

### Risks

- CRLF flip on index.html ballooning the diff — mitigated by explicit CRLF-preserving edit and `git diff --stat` check before commit.
- Uncommitted `projects/index.html` changes in the working tree belong to other work — never staged by this project's commits.
