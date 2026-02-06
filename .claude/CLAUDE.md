# Kevin Lee — Personal Website

## Overview
Minimalist personal portfolio site for Kevin Lee, a photographer and creative based in Seattle, WA.

## Tech Stack
- **Framework:** Next.js 16 (App Router) + TypeScript
- **Styling:** Tailwind CSS v4
- **Animations:** GSAP 3.12 + ScrollTrigger (scroll-driven), Framer Motion (page transitions)
- **Smooth Scroll:** Lenis 1.1.14
- **Font:** Satoshi (via Fontshare CDN)
- **Backend:** Supabase (auth + database), Cloudinary (image hosting)
- **Analytics:** Vercel Analytics + Speed Insights
- **Hosting:** Vercel

## Project Structure
```
website/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout (fonts, theme, Lenis, analytics)
│   │   ├── page.tsx                # Homepage
│   │   ├── template.tsx            # Framer Motion page transitions
│   │   ├── globals.css             # Tailwind + CSS custom properties
│   │   ├── stories/[slug]/         # Dynamic story pages (Brock, etc.)
│   │   ├── articles/[slug]/        # Dynamic article pages
│   │   └── admin/                  # Supabase-backed admin panel
│   ├── components/
│   │   ├── layout/                 # Navbar, Footer
│   │   ├── home/                   # Hero, WorkGrid, About, Projects, Connect
│   │   ├── story/                  # StoryHero, ChapterHeader, PhotoFull, etc.
│   │   ├── admin/                  # Admin-specific components
│   │   └── ui/                     # RevealOnScroll, shared utilities
│   ├── providers/                  # ThemeProvider, LenisProvider
│   ├── hooks/                      # Custom React hooks
│   ├── lib/                        # supabase.ts, cloudinary.ts
│   ├── data/stories/               # Story data (brock.ts, etc.)
│   └── types/                      # TypeScript interfaces
├── public/                         # Static assets (images, resume)
├── _old/                           # Pre-migration vanilla HTML/CSS/JS (reference)
└── package.json
```

## Design System
- **Font:** Satoshi (400, 500, 700, 900)
- **Light theme:** bg #fafafa, text #111111
- **Dark theme:** bg #0a0a0a, text #f0f0f0
- **Sections:** Hero, Work, About, Projects, Connect, Footer
- **Animations:** GSAP ScrollTrigger for reveals, Framer Motion for route transitions
- **Animation boundary:** GSAP for scroll-based, Framer Motion for page transitions only

## Adding New Stories
1. Create a data file in `src/data/stories/[name].ts` following the `Story` type
2. Import and add it to the `stories` map in `src/app/stories/[slug]/page.tsx`
3. Add images to `public/[name]/images/`

## Related Projects
The Day by Day Journal app (web + iOS + backend) lives in a separate repo at `/Users/kevin/Downloads/Projects/daybyday-journal`.
