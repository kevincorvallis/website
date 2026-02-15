# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview
Minimalist personal portfolio site for Kevin Lee — software engineer, pilot, photographer based in Seattle, WA. Domain: klee.page

## Development
```bash
npm run dev    # http-server on :8080, auto-opens browser
```
No build step, no bundler. Edit files and reload.

## Tech Stack
- **Frontend:** Vanilla HTML/CSS/JS (no framework)
- **Font:** Newsreader (via Google Fonts CDN)
- **Hosting:** AWS Amplify

## Project Structure
```
website/
├── index.html          # Single-page portfolio (editorial, narrow layout)
├── css/main.css        # All styles
├── js/main.js          # Theme toggle + copyright year
├── images/             # Portfolio photography
├── photos/             # Photo gallery page (self-contained, inline CSS/JS)
├── brock/              # Photo story (self-contained, inline CSS/JS, dark theme)
├── admin/              # Portfolio admin panel (Supabase-backed)
├── articles/           # Legacy article content (jQuery/FontAwesome, separate from main design)
├── assets/             # Static assets (resume, legacy CSS/JS)
└── package.json        # http-server only
```

## Design System
- **Font:** Newsreader (400, 600)
- **Light theme:** bg `#f0eee6`, text `#1f1e1d`
- **Dark theme:** bg `#1f1e1d`, text `#f0eee6`
- **Theming:** CSS custom properties (`--bg`, `--text`) toggled via `[data-theme="dark"]` on `<html>`
- **Layout:** Max-width 620px centered, 20px side padding
- **Toggle:** Pill-shaped slider (40x20px) using hidden checkbox + label
- **Sections:** Bio, Projects, Photography, Connect, Footer
- **Responsive:** 768px breakpoint (smaller font sizes)
- **Reduced motion:** All transitions respect `prefers-reduced-motion: reduce`
