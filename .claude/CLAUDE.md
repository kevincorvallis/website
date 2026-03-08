# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview
Minimalist personal portfolio site for Kevin Lee — software engineer, pilot, photographer based in Seattle, WA. Domain: klee.page

## Development
```bash
npm run dev    # http-server on :8080, auto-opens browser
```
No build step, no bundler. Edit files and reload.

## Architecture
Only `index.html` uses the shared `css/main.css`. All sub-pages (`resume/`, `projects/`, `photos/`, `brock/`) have **inline `<style>` blocks** duplicating base styles and CSS custom properties. When changing the design system, update each sub-page's inline CSS independently. `brock/valentine/` is a standalone novelty page outside the design system entirely.

All pages (including sub-pages) load the shared JS files `js/theme.js` and `js/i18n.js` via `<script>` tags at the bottom of `<body>`.

### Shared JS
- `js/theme.js` — Theme toggle (syncs checkbox, localStorage, system preference listener). Requires a `#theme-toggle` checkbox on every page.
- `js/i18n.js` — i18n system (EN/FR/KO/JA). Detects language from `?lang=` param, localStorage, or browser. Loads `/i18n/{lang}.json`, applies translations via `data-i18n` (text) and `data-i18n-html` (HTML) attributes. Each page declares `data-i18n-page` on `<html>` to scope translation keys (e.g., `data-i18n-page="resume"` → keys like `resume.heading`). Dynamically loads CJK fonts for KO/JA.
- `js/header-scroll.js` — Index-only. Collapses "Kevin Lee" → "K lee" on scroll using CSS scroll-driven animations (`animation-timeline: scroll()`) with a JS fallback for Firefox/older browsers. Respects `prefers-reduced-motion`.

### Serverless API
- `api/chat.js` — Vercel serverless function for resume chat. Uses OpenAI GPT-4o-mini. Rate limited (10 req/min/IP), logs to Supabase `chat_logs`. Env var: `OPENAI_API_KEY`.

### Admin Panel (`admin/`)
Separate app for managing portfolio photos. Uses Supabase (auth + Postgres), Cloudinary (image hosting), and Sortable.js. Own `admin.css`/`admin.js`. Not part of the main design system.

### Database
Supabase (Postgres). Migrations in `supabase/migrations/`. Setup SQL in `admin/supabase-setup.sql`.

## Hosting
Deployed on Vercel. `vercel.json` configures security headers (CSP, HSTS, X-Frame-Options) and sets `outputDirectory: "."` with no build command.

## Design System
- **Font:** Newsreader (400, 600) via Google Fonts. Exception: `brock/` uses Satoshi (Fontshare).
- **Light theme:** bg `#f0eee6`, text `#1f1e1d`
- **Dark theme:** bg `#1f1e1d`, text `#f0eee6`
- **Theming:** CSS custom properties (`--bg`, `--text`) toggled via `[data-theme="dark"]` on `<html>`. Exception: `brock/` is dark-only with its own palette (`--bg: #0a0a0a`, `--text: #f0f0ec`).
- **Theme flash prevention:** Inline `<script>` in `<head>` reads `localStorage('theme')` before paint
- **Layout:** Max-width varies by page — index/resume: 620px, projects: 800px, photos/brock: 960px. All use 20px side padding.
- **Toggle:** Pill-shaped slider (40x20px) using hidden checkbox + label. `has-transition` class added after 100ms to prevent slide animation on page load
- **Responsive:** 768px breakpoint (600px for photos). All transitions respect `prefers-reduced-motion: reduce`.
