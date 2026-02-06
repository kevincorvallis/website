Create a new photo story for Kevin Lee's portfolio website.

## Instructions

The user wants to create a new story page. Ask them for:
1. **Story name/slug** (e.g., "roadtrip", "seattle", "graduation")
2. **Title** (displayed large on hero)
3. **Subtitle** (small text above title, e.g., "A summer in")
4. **Description** (1-2 sentence hero description)
5. **Accent color** (hex, e.g., "#d4a574" for warm gold — suggest one based on the story mood)
6. **Chapter outline** — Ask for chapter names, taglines, and which photos go where

## What to create

After gathering info, create the following:

### 1. Image directory
```
public/[slug]/images/
```
Tell the user to add their photos here with numbered prefixes (e.g., `01-hero.jpg`, `02-chapter1-photo.jpg`).

### 2. Story data file
Create `src/data/stories/[slug].ts` using the `Story` type from `src/types/story.ts`.

Use `src/data/stories/brock.ts` as the reference template. The story should include:
- Hero section with the first image
- Chapters with a mix of section types: `photo-full`, `photo-grid`, `photo-inset`, `text-block`, `video-inset`, `hscroll-strip`, `spacer`
- Epilogue with closing images and text
- Footer attribution

### 3. Register the story
In `src/app/stories/[slug]/page.tsx`, import the new story data and add it to the `stories` map.

### 4. Verify
Run `npm run build` to confirm the new story page generates without errors.

## Available section types

| Type | Props | Use for |
|------|-------|---------|
| `photo-full` | `src`, `caption?`, `location?` | Hero-style full-bleed images with Ken Burns effect |
| `photo-inset` | `src` | Smaller centered photos |
| `photo-grid` | `images: [{src, alt}]` | Side-by-side photo pairs |
| `text-block` | `content` (HTML) | Narrative paragraphs. Use `<strong>` for emphasis |
| `video-inset` | `src`, `poster?` | Autoplay muted looping videos |
| `hscroll-strip` | `images: [{src, alt}]` | Horizontal scroll photo strips (3+ photos) |
| `spacer` | `size: "sm" \| "md" \| "lg"` | Vertical spacing |

## Story design tips
- Start each chapter with a `photo-full` for dramatic impact
- Alternate between photo types to create rhythm (full → grid → text → inset)
- Use `text-block` between photo sections to tell the narrative
- End chapters with a reflective `text-block`
- Keep text blocks short — 1-2 sentences with one `<strong>` phrase
- Use `hscroll-strip` for journey/montage sequences (3+ photos)
- The epilogue should feel like a quiet closing — slower pacing, emotional images
