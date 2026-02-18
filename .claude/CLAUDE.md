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
Only `index.html` uses the shared `css/main.css` and `js/theme.js`. All sub-pages (`resume/`, `projects/`, `photos/`, `brock/`) are **self-contained** with inline `<style>` and `<script>` blocks — they duplicate the theme toggle logic, base styles, and CSS custom properties. When changing the design system, update each sub-page independently.

### Shared JS (loaded by all pages)
- `js/theme.js` — Theme toggle logic (syncs checkbox, localStorage, system preference listener)
- `js/i18n.js` — Internationalization system (EN/FR/KO/JA). Detects language from `?lang=` param, localStorage, or browser. Loads `/i18n/{lang}.json`, applies translations via `data-i18n` and `data-i18n-html` attributes. Each page declares `data-i18n-page` on `<html>` for page-scoped translation keys. Loads CJK fonts (Noto Serif/Sans) dynamically for Korean and Japanese.

### Serverless API
- `api/chat.js` — Vercel serverless function powering the resume chat. Uses OpenAI GPT-4o-mini with a system prompt containing Kevin's full resume. Includes rate limiting (10 req/min/IP), input sanitization, and logs chats to Supabase `chat_logs` table. Env var: `OPENAI_API_KEY`.

### Admin Panel (`admin/`)
Separate app for managing portfolio photos. Uses Inter font, Supabase (auth + Postgres), Cloudinary (image hosting), and Sortable.js. Has its own `admin.css` and `admin.js`. Not part of the main design system.

### Database
Supabase (Postgres). Migrations in `supabase/migrations/`. Setup SQL in `admin/supabase-setup.sql`.

## Hosting
Deployed on Vercel (previously AWS Amplify). `vercel.json` configures security headers (CSP, HSTS, X-Frame-Options) and sets `outputDirectory: "."` with no build command.

## Design System
- **Font:** Newsreader (400, 600) via Google Fonts
- **Light theme:** bg `#f0eee6`, text `#1f1e1d`
- **Dark theme:** bg `#1f1e1d`, text `#f0eee6`
- **Theming:** CSS custom properties (`--bg`, `--text`) toggled via `[data-theme="dark"]` on `<html>`
- **Theme flash prevention:** Inline `<script>` in `<head>` reads `localStorage('theme')` or system preference before paint
- **Layout:** Max-width 620px centered, 20px side padding (projects page uses 800px)
- **Toggle:** Pill-shaped slider (40x20px) using hidden checkbox + label. `has-transition` class added after 100ms to prevent slide animation on page load
- **Responsive:** 768px breakpoint (smaller font sizes)
- **Reduced motion:** All transitions respect `prefers-reduced-motion: reduce`
