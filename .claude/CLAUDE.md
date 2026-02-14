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
- **Animations:** GSAP 3.12 + ScrollTrigger
- **Smooth Scroll:** Lenis 1.1.14
- **Font:** Satoshi (via Fontshare CDN)
- **Hosting:** AWS Amplify

## Project Structure
```
website/
├── index.html          # Single-page portfolio
├── css/main.css        # All styles (~510 lines)
├── js/main.js          # All interactions (~80 lines)
├── images/             # Portfolio photography
├── brock/              # Photo story (self-contained, inline CSS/JS, dark theme)
├── admin/              # Portfolio admin panel (Supabase-backed)
├── articles/           # Legacy article content (jQuery/FontAwesome, separate from main design)
├── assets/             # Static assets (resume, legacy CSS/JS)
└── package.json        # http-server only
```

## Design System
- **Font:** Satoshi (400, 500, 700, 900)
- **Light theme:** bg `#fafafa`, text `#111111`
- **Dark theme:** bg `#0a0a0a`, text `#f0f0f0`
- **Theming:** CSS custom properties (`--bg`, `--text`, `--border`, etc.) toggled via `[data-theme="dark"]` on `<html>`
- **Sections:** Hero, Work, About, Projects, Connect, Footer
- **Animations:** `.reveal` class elements fade-up on scroll via GSAP ScrollTrigger
- **Responsive:** 768px breakpoint (hamburger menu, single-column grids)
- **Typography:** `clamp()` for fluid sizing, `100dvh` for mobile viewport
- **Reduced motion:** All animations respect `prefers-reduced-motion: reduce`
