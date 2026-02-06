# Kevin Lee — Personal Website

## Overview
Minimalist personal portfolio site for Kevin Lee, a photographer and creative based in Seattle, WA.

## Tech Stack
- **Frontend:** Vanilla HTML/CSS/JS (no framework)
- **Animations:** GSAP 3.12 + ScrollTrigger
- **Smooth Scroll:** Lenis 1.1.14
- **Font:** Satoshi (via Fontshare CDN)
- **Hosting:** AWS Amplify

## Project Structure
```
website/
├── index.html          # Single-page site
├── css/main.css        # All styles (~490 lines)
├── js/main.js          # All interactions (~107 lines)
├── images/             # Portfolio photography
├── admin/              # Portfolio admin panel (Supabase-backed)
├── articles/           # Article content
├── assets/             # Static assets
└── package.json        # http-server only
```

## Design System
- **Font:** Satoshi (400, 500, 700, 900)
- **Light theme:** bg #fafafa, text #111111
- **Dark theme:** bg #0a0a0a, text #f0f0f0
- **Sections:** Hero, Work, About, Projects, Connect, Footer
- **Animations:** Simple fade-up reveals via GSAP ScrollTrigger

## Related Projects
The Day by Day Journal app (web + iOS + backend) lives in a separate repo at `/Users/kevin/Downloads/Projects/daybyday-journal`.
