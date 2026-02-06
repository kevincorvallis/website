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
To add a new photo story (like Brock), three files need to change:

### Step 1: Add images to `public/[name]/images/`
- Name images with numbered prefixes: `01-hero.jpg`, `02-chapter1-photo.jpg`, etc.
- Include both JPG and WebP versions when possible for performance
- Hero image should be portrait-oriented and high resolution (used as full-viewport background)

### Step 2: Create a data file at `src/data/stories/[name].ts`
Use the `Story` type from `src/types/story.ts`. Reference `src/data/stories/brock.ts` as the template.

Required fields:
- `slug` — URL path segment (e.g., `"roadtrip"` → `/stories/roadtrip`)
- `title` — Large display title on hero
- `subtitle` — Small text above title (e.g., "A year in the life of")
- `description` — Hero description paragraph
- `heroImage` — Path to hero background image in `/public`
- `accent` — Hex color for chapter numbers, captions, accent details
- `chapters[]` — Array of chapters, each with `number`, `title`, `tagline`, and `sections[]`
- `epilogue` — Closing section with `title`, `text`, and `images[]`
- `footer` — Attribution text

Available section types for chapters:
| Type | Props | Description |
|------|-------|-------------|
| `photo-full` | `src`, `caption?`, `location?` | Full-bleed viewport image with Ken Burns + gradient caption |
| `photo-inset` | `src` | Centered padded image |
| `photo-grid` | `images: [{src, alt}]` | Two-up side-by-side photos |
| `text-block` | `content` (HTML string) | Centered narrative text. Use `<strong>` for emphasis |
| `video-inset` | `src`, `poster?` | Autoplay muted looping video |
| `hscroll-strip` | `images: [{src, alt}]` | Horizontal scroll strip on desktop, vertical stack on mobile |
| `spacer` | `size: "sm" \| "md" \| "lg"` | Vertical spacing between sections |

### Step 3: Register the story in `src/app/stories/[slug]/page.tsx`
```ts
import { newStory } from "@/data/stories/newname";

const stories = {
  brock: brockStory,
  newname: newStory,  // add here
};
```

The page will auto-generate static params, metadata (OG tags), and the full story layout.

## Related Projects
The Day by Day Journal app (web + iOS + backend) lives in a separate repo at `/Users/kevin/Downloads/Projects/daybyday-journal`.
