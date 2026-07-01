# Dispatch Anthropic-News-Style Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the shared chrome of every Dispatch issue + interlude page (kicker/eyebrow typography, meta-row) toward the anthropic.com/news structural pattern, and add a new "More letters" (prev/next) related-content module before the subscribe form on each page — without touching each issue's bespoke content widgets, the listing page, or the `dispatch/` platform.

**Architecture:** One new shared CSS module (`.mfx-more-letters*`) added to the already-shared `css/microfeatures.css` (linked on every target page). Per-page edits are mechanical and identical in shape across 9 files: (1) add `Archivo` to the existing Google Fonts `<link>`, (2) add a `--font-sans` custom property to the page's own `:root`, (3) point the page's existing kicker rule (`.hero-label` on 8 files, `.mast-kicker`/`.mast-dateline` on issue 007) at `var(--font-sans)` with quieter color/tighter tracking, (4) insert the new `<nav class="mfx-more-letters">` markup immediately before that page's `<div class="subscribe" id="subscribe">`.

**Tech Stack:** Static HTML/CSS, no build step, no bundler (`npm run dev` = http-server on :8080). Google Fonts. No test framework exists for this codebase's HTML/CSS — verification is grep-based structural checks per task, plus one Playwright-driven visual pass across representative pages at the end (light/dark/mobile).

## Global Constraints

- Do **not** touch: the big italic display headline (`.mast-title`/`.hero-title`), body copy font, the terracotta accent color anywhere except the kicker text color specifically, the komorebi/gate interstitials, bilingual EN/KO markup conventions (`data-l="en"`/`data-l="ko"` spans), `newsletter/index.html` (listing page), or anything under `dispatch/` (the multi-user platform).
- Do **not** touch any issue's bespoke per-issue widgets (deal-wire cards, estadio graphics, relay-rink SVG, mini-player, the "receipt" format in issue 004, etc.).
- New sans font: **Archivo**, Google Fonts, weights `500;600;700` only.
- `--font-sans` value everywhere: `'Archivo', -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif` (no `[data-lang="ko"]` override needed — Archivo has no Hangul glyphs so browsers fall through to the system Korean sans per-glyph automatically).
- New shared CSS lives in `css/microfeatures.css`, namespaced `mfx-`, using only `--text`/`--bg`/`--font`/`--accent`/`--caption` with internal `--mfx-*` fallbacks (existing convention in that file).
- The "More letters" module always has exactly **2 cards**: chronological previous + next issue, or "All letters" (`/newsletter/`) where a neighbor doesn't exist (issue 001 has no previous; issue 007 has no next; the interlude has neither, per spec).
- No share icons, no category taxonomy — explicitly out of scope per the spec.
- Every teaser description in the new module is **verbatim** text already written for that issue's entry in `newsletter/index.html` — no new copywriting.

Spec: `docs/superpowers/specs/2026-07-01-dispatch-anthropic-news-style-design.md`

---

### Task 1: Shared "More letters" CSS module

**Files:**
- Modify: `css/microfeatures.css`

**Interfaces:**
- Produces: CSS classes `.mfx-more-letters`, `.mfx-more-letters-label`, `.mfx-more-letters-grid`, `.mfx-more-letter`, `.mfx-more-letter-num`, `.mfx-more-letter-title`, `.mfx-more-letter-desc`, `.mfx-more-letter-all`, and CSS custom properties `--mfx-font-sans` / `--mfx-caption`, consumed by Tasks 2–10's markup.

- [ ] **Step 1: Read the current top of the file to confirm the existing `--mfx-*` token block**

Run: `sed -n '1,16p' css/microfeatures.css`
Expected output (verbatim, already in the file):
```css
:root {
    --mfx-accent: var(--accent, #1f9e89);
    --mfx-rule: color-mix(in srgb, var(--text, #1f1e1d) 14%, transparent);
    --mfx-surface: color-mix(in srgb, var(--bg, #f0eee6) 92%, var(--text, #1f1e1d));
    --mfx-shadow: 0 8px 30px color-mix(in srgb, var(--text, #1f1e1d) 22%, transparent);
}
```

- [ ] **Step 2: Add two new tokens to that block**

Using Edit, old_string:
```css
:root {
    --mfx-accent: var(--accent, #1f9e89);
    --mfx-rule: color-mix(in srgb, var(--text, #1f1e1d) 14%, transparent);
    --mfx-surface: color-mix(in srgb, var(--bg, #f0eee6) 92%, var(--text, #1f1e1d));
    --mfx-shadow: 0 8px 30px color-mix(in srgb, var(--text, #1f1e1d) 22%, transparent);
}
```
new_string:
```css
:root {
    --mfx-accent: var(--accent, #1f9e89);
    --mfx-rule: color-mix(in srgb, var(--text, #1f1e1d) 14%, transparent);
    --mfx-surface: color-mix(in srgb, var(--bg, #f0eee6) 92%, var(--text, #1f1e1d));
    --mfx-shadow: 0 8px 30px color-mix(in srgb, var(--text, #1f1e1d) 22%, transparent);
    --mfx-font-sans: var(--font-sans, -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif);
    --mfx-caption: var(--caption, color-mix(in srgb, var(--text, #1f1e1d) 55%, transparent));
}
```

- [ ] **Step 3: Append the "More letters" module rules at the end of the file**

Run: `tail -5 css/microfeatures.css` to see the current end of file, then append (do not overwrite) the following block at the very end of `css/microfeatures.css`:

```css

/* ─── "More letters" related-entries module (Dispatch issue/interlude pages) ───────────── */
.mfx-more-letters {
    max-width: 620px;
    margin: 0 auto;
    padding: 0 1.5rem;
}
.mfx-more-letters-label {
    font-family: var(--mfx-font-sans);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--mfx-accent);
    text-align: center;
    margin-bottom: 1.5rem;
}
.mfx-more-letters-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.75rem;
}
.mfx-more-letter {
    display: block;
    text-decoration: none;
    color: var(--text, #1f1e1d);
    padding-top: 1.1rem;
    border-top: 1px solid var(--mfx-rule);
    transition: opacity 0.2s ease, border-color 0.3s ease;
}
.mfx-more-letter:hover { opacity: 0.62; }
.mfx-more-letter-num {
    display: block;
    font-family: var(--mfx-font-sans);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--mfx-accent);
    margin-bottom: 0.4rem;
}
.mfx-more-letter-title {
    display: block;
    font-family: var(--mfx-font-sans);
    font-size: 17px;
    font-weight: 600;
    line-height: 1.3;
    margin-bottom: 0.4rem;
}
.mfx-more-letter-desc {
    display: -webkit-box;
    font-family: var(--font, inherit);
    font-size: 14px;
    line-height: 1.5;
    color: var(--mfx-caption);
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
.mfx-more-letter-all {
    display: flex;
    align-items: center;
    min-height: 3.2rem;
}
.mfx-more-letter-all .mfx-more-letter-title { margin-bottom: 0; }
@media (max-width: 640px) {
    .mfx-more-letters-grid { grid-template-columns: 1fr; gap: 1.25rem; }
}
@media (prefers-reduced-motion: reduce) {
    .mfx-more-letter { transition: none; }
}
```

- [ ] **Step 4: Verify the file is well-formed**

Run: `node -e "require('fs').readFileSync('css/microfeatures.css','utf8')" && grep -c "mfx-more-letter" css/microfeatures.css`
Expected: no error from the `node -e` (confirms the file is readable/no accidental binary corruption), and a count greater than `8` printed (confirms all new classes were appended).

- [ ] **Step 5: Commit**

```bash
git add css/microfeatures.css
git commit -m "microfeatures: add shared More-letters module CSS"
```

---

### Task 2: Apply to `newsletter/template.html`

**Files:**
- Modify: `newsletter/template.html`

**Interfaces:**
- Consumes: `.mfx-more-letters*` classes from Task 1.

- [ ] **Step 1: Add Archivo to the Google Fonts link**

Using Edit, old_string:
```html
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,400;1,600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Noto+Serif+JP:wght@300;400;600&family=Noto+Serif+KR:wght@400;600&display=swap" rel="stylesheet">
```
new_string:
```html
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,400;1,600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Noto+Serif+JP:wght@300;400;600&family=Noto+Serif+KR:wght@400;600&family=Archivo:wght@500;600;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Add `--font-sans` to `:root`**

Using Edit, old_string:
```css
            --font: 'Newsreader', Georgia, 'Times New Roman', serif;
            --font-display: 'Cormorant Garamond', 'Newsreader', Georgia, serif;
```
new_string:
```css
            --font: 'Newsreader', Georgia, 'Times New Roman', serif;
            --font-display: 'Cormorant Garamond', 'Newsreader', Georgia, serif;
            --font-sans: 'Archivo', -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
```

- [ ] **Step 3: Restyle `.hero-label`**

Using Edit, old_string:
```css
        .hero-label {
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.2em;
            text-transform: uppercase;
            color: var(--accent);
            margin-bottom: 1rem;
            opacity: 0;
            transition: color 0.3s ease;
        }
```
new_string:
```css
        .hero-label {
            font-family: var(--font-sans);
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: var(--caption);
            margin-bottom: 1rem;
            opacity: 0;
            transition: color 0.3s ease;
        }
```

- [ ] **Step 4: Insert the "More letters" placeholder module before the subscribe form**

This is a template — the placeholder cards are illustrative example content that whoever copies this file for a new issue must replace (same convention as the rest of this file's example content).

Using Edit, old_string:
```html
    <div class="subscribe reveal" id="subscribe">
```
new_string:
```html
    <!-- "More letters" — replace both cards below with THIS issue's actual previous/next issue when you copy this template for a new issue. If there is no previous/next, use the "All letters" card shape (see the second card here). -->
    <nav class="mfx-more-letters reveal-fade" aria-label="More letters">
        <p class="mfx-more-letters-label">
            <span data-l="en">More letters</span><span data-l="ko">다른 편지</span>
        </p>
        <div class="mfx-more-letters-grid">
            <a href="/newsletter/" class="mfx-more-letter mfx-more-letter-all">
                <span class="mfx-more-letter-title"><span data-l="en">All letters &rarr;</span><span data-l="ko">모든 편지 &rarr;</span></span>
            </a>
            <a href="/newsletter/007/" class="mfx-more-letter">
                <span class="mfx-more-letter-num">No. 007</span>
                <span class="mfx-more-letter-title"><span data-l="en">Leave</span><span data-l="ko">휴가</span></span>
                <span class="mfx-more-letter-desc">
                    <span data-l="en">First PTO from Paramount. Dad, Justin, and me at Korea&ndash;Mexico in Guadalajara &mdash; Estadio Akron, split jerseys, whole octopus, one very good group chat.</span>
                    <span data-l="ko">파라마운트 첫 PTO. 과달라하라에서 아빠, 저스틴, 나 &mdash; 에스타디오 아크론, 갈라진 유니폼, 통문어, 아주 좋은 단톡방.</span>
                </span>
            </a>
        </div>
    </nav>

    <div class="divider reveal-fade"></div>

    <div class="subscribe reveal" id="subscribe">
```

- [ ] **Step 5: Verify**

Run: `grep -n "font-sans\|mfx-more-letters\|Archivo" newsletter/template.html`
Expected: shows the new `--font-sans` root line, `font-family: var(--font-sans);` inside `.hero-label`, `Archivo:wght@500;600;700` in the font link, and the `mfx-more-letters` block — 5+ matches total.

- [ ] **Step 6: Commit**

```bash
git add newsletter/template.html
git commit -m "newsletter template: anthropic-news-style chrome + more-letters module"
```

---

### Task 3: Apply to `newsletter/001/index.html`

**Files:**
- Modify: `newsletter/001/index.html`

**Interfaces:**
- Consumes: `.mfx-more-letters*` classes from Task 1.

- [ ] **Step 1: Add Archivo to the Google Fonts link**

Using Edit, old_string:
```html
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600&display=swap" rel="stylesheet">
```
new_string:
```html
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600&family=Archivo:wght@500;600;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Add `--font-sans` to `:root`**

Using Edit, old_string:
```css
            --font: 'adobe-jenson-pro', Georgia, 'Times New Roman', serif;
            --font-display: 'rl-horizon', 'adobe-jenson-pro', Georgia, serif;
```
new_string:
```css
            --font: 'adobe-jenson-pro', Georgia, 'Times New Roman', serif;
            --font-display: 'rl-horizon', 'adobe-jenson-pro', Georgia, serif;
            --font-sans: 'Archivo', -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
```

- [ ] **Step 3: Restyle `.hero-label`**

Using Edit, old_string:
```css
        .hero-label {
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.2em;
            text-transform: uppercase;
            color: var(--accent);
            margin-bottom: 1rem;
            opacity: 0;
            transition: color 0.3s ease;
        }
```
new_string:
```css
        .hero-label {
            font-family: var(--font-sans);
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: var(--caption);
            margin-bottom: 1rem;
            opacity: 0;
            transition: color 0.3s ease;
        }
```

- [ ] **Step 4: Insert the "More letters" module before the subscribe form**

Issue 001 is the oldest issue — no previous issue exists, so the first card is "All letters"; the second card is issue 002 ("Spring on the Mountain"), the chronological next issue.

Using Edit, old_string:
```html
    <div class="subscribe reveal" id="subscribe">
```
new_string:
```html
    <nav class="mfx-more-letters reveal-fade" aria-label="More letters">
        <p class="mfx-more-letters-label">
            <span data-l="en">More letters</span><span data-l="ko">다른 편지</span>
        </p>
        <div class="mfx-more-letters-grid">
            <a href="/newsletter/" class="mfx-more-letter mfx-more-letter-all">
                <span class="mfx-more-letter-title"><span data-l="en">All letters &rarr;</span><span data-l="ko">모든 편지 &rarr;</span></span>
            </a>
            <a href="/newsletter/002/" class="mfx-more-letter">
                <span class="mfx-more-letter-num">No. 002</span>
                <span class="mfx-more-letter-title"><span data-l="en">Spring on the Mountain</span><span data-l="ko">산 위의 봄</span></span>
                <span class="mfx-more-letter-desc">
                    <span data-l="en">Closing out ski season at Mammoth, producing at Paramount, free furniture from London, and Dylan's first visit.</span>
                    <span data-l="ko">매머드에서 시즌 마무리, 파라마운트에서 프로듀싱, 런던 사람한테 공짜 가구, Dylan 첫 방문.</span>
                </span>
            </a>
        </div>
    </nav>

    <div class="divider reveal-fade"></div>

    <div class="subscribe reveal" id="subscribe">
```

- [ ] **Step 5: Verify**

Run: `grep -n "font-sans\|mfx-more-letters\|Archivo" newsletter/001/index.html`
Expected: 5+ matches (root var, hero-label font-family, font link, more-letters block).

- [ ] **Step 6: Commit**

```bash
git add newsletter/001/index.html
git commit -m "newsletter 001: anthropic-news-style chrome + more-letters module"
```

---

### Task 4: Apply to `newsletter/002/index.html`

**Files:**
- Modify: `newsletter/002/index.html`

**Interfaces:**
- Consumes: `.mfx-more-letters*` classes from Task 1.

- [ ] **Step 1: Add Archivo to the Google Fonts link**

Using Edit, old_string:
```html
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,400;1,600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Noto+Serif+JP:wght@300;400;600&family=Noto+Serif+KR:wght@400;600&display=swap" rel="stylesheet">
```
new_string:
```html
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,400;1,600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Noto+Serif+JP:wght@300;400;600&family=Noto+Serif+KR:wght@400;600&family=Archivo:wght@500;600;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Add `--font-sans` to `:root`**

Using Edit, old_string:
```css
            --font: 'Newsreader', Georgia, 'Times New Roman', serif;
            --font-display: 'Cormorant Garamond', 'Newsreader', Georgia, serif;
```
new_string:
```css
            --font: 'Newsreader', Georgia, 'Times New Roman', serif;
            --font-display: 'Cormorant Garamond', 'Newsreader', Georgia, serif;
            --font-sans: 'Archivo', -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
```

- [ ] **Step 3: Restyle `.hero-label`**

Using Edit, old_string:
```css
        .hero-label {
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.2em;
            text-transform: uppercase;
            color: var(--accent);
            margin-bottom: 1rem;
            opacity: 0;
            transition: color 0.3s ease;
        }
```
new_string:
```css
        .hero-label {
            font-family: var(--font-sans);
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: var(--caption);
            margin-bottom: 1rem;
            opacity: 0;
            transition: color 0.3s ease;
        }
```

- [ ] **Step 4: Insert the "More letters" module before the subscribe form**

Previous = issue 001 ("Week One in LA"), next = issue 003 ("Field of Daisies").

Using Edit, old_string:
```html
    <div class="subscribe reveal" id="subscribe">
```
new_string:
```html
    <nav class="mfx-more-letters reveal-fade" aria-label="More letters">
        <p class="mfx-more-letters-label">
            <span data-l="en">More letters</span><span data-l="ko">다른 편지</span>
        </p>
        <div class="mfx-more-letters-grid">
            <a href="/newsletter/001/" class="mfx-more-letter">
                <span class="mfx-more-letter-num">No. 001</span>
                <span class="mfx-more-letter-title"><span data-l="en">Week One in LA</span><span data-l="ko">LA 첫째 주</span></span>
                <span class="mfx-more-letter-desc">
                    <span data-l="en">First week at Paramount, apartment hunting in Hollywood, and film photos from the drive down.</span>
                    <span data-l="ko">파라마운트 첫 주, 할리우드 집 구하기, 오레곤에서 내려오면서 찍은 필름 사진들.</span>
                </span>
            </a>
            <a href="/newsletter/003/" class="mfx-more-letter">
                <span class="mfx-more-letter-num">No. 003</span>
                <span class="mfx-more-letter-title"><span data-l="en">Field of Daisies</span><span data-l="ko">데이지 들판</span></span>
                <span class="mfx-more-letter-desc">
                    <span data-l="en">Youbin's H1B, Kobe back from Germany, first 1:1s as a manager, and Justin Bieber crashing Coachella. Flip your phone.</span>
                    <span data-l="ko">유빈이의 H1B, 독일에서 돌아온 Kobe, 매니저로서 첫 1:1, 그리고 코첼라에 등장한 저스틴 비버. 폰을 옆으로 돌려.</span>
                </span>
            </a>
        </div>
    </nav>

    <div class="divider reveal-fade"></div>

    <div class="subscribe reveal" id="subscribe">
```

- [ ] **Step 5: Verify**

Run: `grep -n "font-sans\|mfx-more-letters\|Archivo" newsletter/002/index.html`
Expected: 5+ matches.

- [ ] **Step 6: Commit**

```bash
git add newsletter/002/index.html
git commit -m "newsletter 002: anthropic-news-style chrome + more-letters module"
```

---

### Task 5: Apply to `newsletter/003/index.html`

**Files:**
- Modify: `newsletter/003/index.html`

**Interfaces:**
- Consumes: `.mfx-more-letters*` classes from Task 1.

- [ ] **Step 1: Add Archivo to the Google Fonts link**

Using Edit, old_string:
```html
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,400;1,600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Noto+Serif+JP:wght@300;400;600&family=Noto+Serif+KR:wght@400;600&display=swap" rel="stylesheet">
```
new_string:
```html
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,400;1,600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Noto+Serif+JP:wght@300;400;600&family=Noto+Serif+KR:wght@400;600&family=Archivo:wght@500;600;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Add `--font-sans` to `:root`**

Using Edit, old_string:
```css
            --font: 'Newsreader', Georgia, 'Times New Roman', serif;
            --font-display: 'Cormorant Garamond', 'Newsreader', Georgia, serif;
```
new_string:
```css
            --font: 'Newsreader', Georgia, 'Times New Roman', serif;
            --font-display: 'Cormorant Garamond', 'Newsreader', Georgia, serif;
            --font-sans: 'Archivo', -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
```

- [ ] **Step 3: Restyle `.hero-label`**

Using Edit, old_string:
```css
        .hero-label {
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.2em;
            text-transform: uppercase;
            color: var(--accent);
            margin-bottom: 1rem;
            opacity: 0;
            transition: color 0.3s ease;
        }
```
new_string:
```css
        .hero-label {
            font-family: var(--font-sans);
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: var(--caption);
            margin-bottom: 1rem;
            opacity: 0;
            transition: color 0.3s ease;
        }
```

- [ ] **Step 4: Insert the "More letters" module before the subscribe form**

Previous = issue 002 ("Spring on the Mountain"), next = issue 004 ("Open House").

Using Edit, old_string:
```html
    <div class="subscribe reveal" id="subscribe">
```
new_string:
```html
    <nav class="mfx-more-letters reveal-fade" aria-label="More letters">
        <p class="mfx-more-letters-label">
            <span data-l="en">More letters</span><span data-l="ko">다른 편지</span>
        </p>
        <div class="mfx-more-letters-grid">
            <a href="/newsletter/002/" class="mfx-more-letter">
                <span class="mfx-more-letter-num">No. 002</span>
                <span class="mfx-more-letter-title"><span data-l="en">Spring on the Mountain</span><span data-l="ko">산 위의 봄</span></span>
                <span class="mfx-more-letter-desc">
                    <span data-l="en">Closing out ski season at Mammoth, producing at Paramount, free furniture from London, and Dylan's first visit.</span>
                    <span data-l="ko">매머드에서 시즌 마무리, 파라마운트에서 프로듀싱, 런던 사람한테 공짜 가구, Dylan 첫 방문.</span>
                </span>
            </a>
            <a href="/newsletter/004/" class="mfx-more-letter">
                <span class="mfx-more-letter-num">No. 004</span>
                <span class="mfx-more-letter-title"><span data-l="en">Open House</span><span data-l="ko">손님맞이</span></span>
                <span class="mfx-more-letter-desc">
                    <span data-l="en">Cousins Eunice &amp; Lance flew in from the east coast, Brawley and his Bows drove down from Salt Lake, cousin Matthew got his USC psych degree, and Kobe robbed the counter on the Ring cam. Itemized as a receipt.</span>
                    <span data-l="ko">동부에서 온 사촌 유니스 &amp; 랜스, 솔트레이크에서 보우즈 신고 내려온 브롤리, USC 심리학 학위 받은 사촌 매튜, 그리고 링 카메라에 잡힌 카운터 털이범 코비. 영수증 형식.</span>
                </span>
            </a>
        </div>
    </nav>

    <div class="divider reveal-fade"></div>

    <div class="subscribe reveal" id="subscribe">
```

- [ ] **Step 5: Verify**

Run: `grep -n "font-sans\|mfx-more-letters\|Archivo" newsletter/003/index.html`
Expected: 5+ matches.

- [ ] **Step 6: Commit**

```bash
git add newsletter/003/index.html
git commit -m "newsletter 003: anthropic-news-style chrome + more-letters module"
```

---

### Task 6: Apply to `newsletter/004/index.html` (receipt format — no `.hero-label`)

**Files:**
- Modify: `newsletter/004/index.html`

**Interfaces:**
- Consumes: `.mfx-more-letters*` classes from Task 1.

Issue 004 uses a bespoke "receipt" format with no hero/masthead section at all (confirmed: no `.hero-label` CSS or markup exists in this file). Per the spec, bespoke per-issue widgets are out of scope, so this file gets only the font-loading + `--font-sans` token (for consistency/future-proofing) and the new module — there is no kicker element to restyle here.

- [ ] **Step 1: Add Archivo to the Google Fonts link**

Using Edit, old_string:
```html
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,400;1,600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Noto+Serif+JP:wght@300;400;600&family=Noto+Serif+KR:wght@400;600&display=swap" rel="stylesheet">
```
new_string:
```html
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,400;1,600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Noto+Serif+JP:wght@300;400;600&family=Noto+Serif+KR:wght@400;600&family=Archivo:wght@500;600;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Add `--font-sans` to the primary `:root`**

There are two `:root` blocks in this file — the primary theme-token one, and a second one further down scoped to the "receipt" widget's own layout variables (`--paper-w`, `--mono`, `--perf`). Only edit the primary one.

Using Edit, old_string:
```css
            --font: 'Newsreader', Georgia, 'Times New Roman', serif;
            --font-display: 'Cormorant Garamond', 'Newsreader', Georgia, serif;
```
new_string:
```css
            --font: 'Newsreader', Georgia, 'Times New Roman', serif;
            --font-display: 'Cormorant Garamond', 'Newsreader', Georgia, serif;
            --font-sans: 'Archivo', -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
```

- [ ] **Step 3: Insert the "More letters" module before the subscribe form**

Previous = issue 003 ("Field of Daisies"), next = issue 005 ("Margin"). This file has no divider immediately before its subscribe section (it ends with `</article>`), so this insertion includes its own leading divider for visual separation.

Using Edit, old_string:
```html
    <div class="subscribe reveal" id="subscribe">
```
new_string:
```html
    <div class="divider reveal-fade"></div>

    <nav class="mfx-more-letters reveal-fade" aria-label="More letters">
        <p class="mfx-more-letters-label">
            <span data-l="en">More letters</span><span data-l="ko">다른 편지</span>
        </p>
        <div class="mfx-more-letters-grid">
            <a href="/newsletter/003/" class="mfx-more-letter">
                <span class="mfx-more-letter-num">No. 003</span>
                <span class="mfx-more-letter-title"><span data-l="en">Field of Daisies</span><span data-l="ko">데이지 들판</span></span>
                <span class="mfx-more-letter-desc">
                    <span data-l="en">Youbin's H1B, Kobe back from Germany, first 1:1s as a manager, and Justin Bieber crashing Coachella. Flip your phone.</span>
                    <span data-l="ko">유빈이의 H1B, 독일에서 돌아온 Kobe, 매니저로서 첫 1:1, 그리고 코첼라에 등장한 저스틴 비버. 폰을 옆으로 돌려.</span>
                </span>
            </a>
            <a href="/newsletter/005/" class="mfx-more-letter">
                <span class="mfx-more-letter-num">No. 005</span>
                <span class="mfx-more-letter-title"><span data-l="en">Margin</span><span data-l="ko">여백</span></span>
                <span class="mfx-more-letter-desc">
                    <span data-l="en">A long weekend &mdash; a Friday screening on the Paramount lot, a Sunday that started in a church courtyard and ended on a sandy ridge above Big Bear, and a Monday that refused to put on real pants.</span>
                    <span data-l="ko">긴 주말 &mdash; 금요일 파라마운트 부지의 시사회, 교회 안마당에서 시작해 빅베어 위 능선에서 끝난 일요일, 그리고 진짜 바지를 거부한 월요일.</span>
                </span>
            </a>
        </div>
    </nav>

    <div class="divider reveal-fade"></div>

    <div class="subscribe reveal" id="subscribe">
```

- [ ] **Step 4: Verify**

Run: `grep -n "font-sans\|mfx-more-letters\|Archivo" newsletter/004/index.html`
Expected: 4+ matches (root var, font link, more-letters block — no `.hero-label` match, which is correct for this file).

- [ ] **Step 5: Commit**

```bash
git add newsletter/004/index.html
git commit -m "newsletter 004: more-letters module (receipt format has no kicker to restyle)"
```

---

### Task 7: Apply to `newsletter/005/index.html`

**Files:**
- Modify: `newsletter/005/index.html`

**Interfaces:**
- Consumes: `.mfx-more-letters*` classes from Task 1.

- [ ] **Step 1: Add Archivo to the Google Fonts link**

Using Edit, old_string:
```html
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,400;1,600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Noto+Serif+JP:wght@300;400;600&family=Noto+Serif+KR:wght@400;600&display=swap" rel="stylesheet">
```
new_string:
```html
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,400;1,600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Noto+Serif+JP:wght@300;400;600&family=Noto+Serif+KR:wght@400;600&family=Archivo:wght@500;600;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Add `--font-sans` to `:root`**

Using Edit, old_string:
```css
            --font: 'Newsreader', Georgia, 'Times New Roman', serif;
            --font-display: 'Cormorant Garamond', 'Newsreader', Georgia, serif;
```
new_string:
```css
            --font: 'Newsreader', Georgia, 'Times New Roman', serif;
            --font-display: 'Cormorant Garamond', 'Newsreader', Georgia, serif;
            --font-sans: 'Archivo', -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
```

- [ ] **Step 3: Restyle `.hero-label`**

Using Edit, old_string:
```css
        .hero-label {
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.2em;
            text-transform: uppercase;
            color: var(--accent);
            margin-bottom: 1rem;
            opacity: 0;
            transition: color 0.3s ease;
        }
```
new_string:
```css
        .hero-label {
            font-family: var(--font-sans);
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: var(--caption);
            margin-bottom: 1rem;
            opacity: 0;
            transition: color 0.3s ease;
        }
```

- [ ] **Step 4: Insert the "More letters" module before the subscribe form**

Previous = issue 004 ("Open House"), next = issue 006 ("Us").

Using Edit, old_string:
```html
    <div class="subscribe reveal" id="subscribe">
```
new_string:
```html
    <nav class="mfx-more-letters reveal-fade" aria-label="More letters">
        <p class="mfx-more-letters-label">
            <span data-l="en">More letters</span><span data-l="ko">다른 편지</span>
        </p>
        <div class="mfx-more-letters-grid">
            <a href="/newsletter/004/" class="mfx-more-letter">
                <span class="mfx-more-letter-num">No. 004</span>
                <span class="mfx-more-letter-title"><span data-l="en">Open House</span><span data-l="ko">손님맞이</span></span>
                <span class="mfx-more-letter-desc">
                    <span data-l="en">Cousins Eunice &amp; Lance flew in from the east coast, Brawley and his Bows drove down from Salt Lake, cousin Matthew got his USC psych degree, and Kobe robbed the counter on the Ring cam. Itemized as a receipt.</span>
                    <span data-l="ko">동부에서 온 사촌 유니스 &amp; 랜스, 솔트레이크에서 보우즈 신고 내려온 브롤리, USC 심리학 학위 받은 사촌 매튜, 그리고 링 카메라에 잡힌 카운터 털이범 코비. 영수증 형식.</span>
                </span>
            </a>
            <a href="/newsletter/006/" class="mfx-more-letter">
                <span class="mfx-more-letter-num">No. 006</span>
                <span class="mfx-more-letter-title"><span data-l="en">Us</span><span data-l="ko">우리</span></span>
                <span class="mfx-more-letter-desc">
                    <span data-l="en">A $111-billion merger, a manager title I'm too tired to celebrate, Pride with Justin and the Jackass crew, the World Cup, and a Korean short-track relay I can't stop crying over. On us &mdash; the people and the country that held the line.</span>
                    <span data-l="ko">1,110억 달러짜리 합병, 축하할 기운도 없는 매니저 승진, 저스틴과 함께한 프라이드와 잭애스 크루, 월드컵, 그리고 자꾸 울게 만드는 한국 쇼트트랙 계주. 우리 &mdash; 끝내 자리를 지킨 사람들과 나라에 대하여.</span>
                </span>
            </a>
        </div>
    </nav>

    <div class="divider reveal-fade"></div>

    <div class="subscribe reveal" id="subscribe">
```

- [ ] **Step 5: Verify**

Run: `grep -n "font-sans\|mfx-more-letters\|Archivo" newsletter/005/index.html`
Expected: 5+ matches.

- [ ] **Step 6: Commit**

```bash
git add newsletter/005/index.html
git commit -m "newsletter 005: anthropic-news-style chrome + more-letters module"
```

---

### Task 8: Apply to `newsletter/006/index.html`

**Files:**
- Modify: `newsletter/006/index.html`

**Interfaces:**
- Consumes: `.mfx-more-letters*` classes from Task 1.

This file's `.hero-label` rule uses the compacted multi-declaration-per-line format (different whitespace than the other files) — match it exactly.

- [ ] **Step 1: Add Archivo to the Google Fonts link**

Using Edit, old_string:
```html
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,400;1,600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Noto+Serif+JP:wght@300;400;600&family=Noto+Serif+KR:wght@400;600&display=swap" rel="stylesheet">
```
new_string:
```html
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,400;1,600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Noto+Serif+JP:wght@300;400;600&family=Noto+Serif+KR:wght@400;600&family=Archivo:wght@500;600;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Add `--font-sans` to `:root`**

Using Edit, old_string:
```css
            --font: 'Newsreader', Georgia, 'Times New Roman', serif;
            --font-display: 'Cormorant Garamond', 'Newsreader', Georgia, serif;
            --mono: ui-monospace, 'SF Mono', Menlo, monospace;
```
new_string:
```css
            --font: 'Newsreader', Georgia, 'Times New Roman', serif;
            --font-display: 'Cormorant Garamond', 'Newsreader', Georgia, serif;
            --font-sans: 'Archivo', -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
            --mono: ui-monospace, 'SF Mono', Menlo, monospace;
```

- [ ] **Step 3: Restyle `.hero-label`**

Using Edit, old_string:
```css
        .hero-label {
            font-size: 12px; font-weight: 600; letter-spacing: 0.2em;
            text-transform: uppercase; color: var(--accent); margin-bottom: 1rem;
            opacity: 0; transition: color 0.3s ease;
        }
```
new_string:
```css
        .hero-label {
            font-family: var(--font-sans); font-size: 12px; font-weight: 600; letter-spacing: 0.14em;
            text-transform: uppercase; color: var(--caption); margin-bottom: 1rem;
            opacity: 0; transition: color 0.3s ease;
        }
```

- [ ] **Step 4: Insert the "More letters" module before the subscribe form**

Previous = issue 005 ("Margin"), next = issue 007 ("Leave").

Using Edit, old_string:
```html
    <div class="subscribe reveal" id="subscribe">
```
new_string:
```html
    <nav class="mfx-more-letters reveal-fade" aria-label="More letters">
        <p class="mfx-more-letters-label">
            <span data-l="en">More letters</span><span data-l="ko">다른 편지</span>
        </p>
        <div class="mfx-more-letters-grid">
            <a href="/newsletter/005/" class="mfx-more-letter">
                <span class="mfx-more-letter-num">No. 005</span>
                <span class="mfx-more-letter-title"><span data-l="en">Margin</span><span data-l="ko">여백</span></span>
                <span class="mfx-more-letter-desc">
                    <span data-l="en">A long weekend &mdash; a Friday screening on the Paramount lot, a Sunday that started in a church courtyard and ended on a sandy ridge above Big Bear, and a Monday that refused to put on real pants.</span>
                    <span data-l="ko">긴 주말 &mdash; 금요일 파라마운트 부지의 시사회, 교회 안마당에서 시작해 빅베어 위 능선에서 끝난 일요일, 그리고 진짜 바지를 거부한 월요일.</span>
                </span>
            </a>
            <a href="/newsletter/007/" class="mfx-more-letter">
                <span class="mfx-more-letter-num">No. 007</span>
                <span class="mfx-more-letter-title"><span data-l="en">Leave</span><span data-l="ko">휴가</span></span>
                <span class="mfx-more-letter-desc">
                    <span data-l="en">First PTO from Paramount. Dad, Justin, and me at Korea&ndash;Mexico in Guadalajara &mdash; Estadio Akron, split jerseys, whole octopus, one very good group chat.</span>
                    <span data-l="ko">파라마운트 첫 PTO. 과달라하라에서 아빠, 저스틴, 나 &mdash; 에스타디오 아크론, 갈라진 유니폼, 통문어, 아주 좋은 단톡방.</span>
                </span>
            </a>
        </div>
    </nav>

    <div class="divider reveal-fade"></div>

    <div class="subscribe reveal" id="subscribe">
```

- [ ] **Step 5: Verify**

Run: `grep -n "font-sans\|mfx-more-letters\|Archivo" newsletter/006/index.html`
Expected: 5+ matches.

- [ ] **Step 6: Commit**

```bash
git add newsletter/006/index.html
git commit -m "newsletter 006: anthropic-news-style chrome + more-letters module"
```

---

### Task 9: Apply to `newsletter/007/index.html` (masthead cold-open — `.mast-kicker`/`.mast-dateline`, not `.hero-label`)

**Files:**
- Modify: `newsletter/007/index.html`

**Interfaces:**
- Consumes: `.mfx-more-letters*` classes from Task 1.

Issue 007 is the newest issue and uses a different, newer header pattern (`.masthead` / `.mast-kicker` / `.mast-dateline`) instead of `.hero-label`. It already has `--mono` in `:root` and currently styles its kicker/dateline with `font-family: var(--mono)` — this task switches those two rules to `var(--font-sans)` and tightens their tracking; it does not touch any other `--mono` usage in this file's bespoke widgets (deal-wire cards, etc. — out of scope).

- [ ] **Step 1: Add Archivo to the Google Fonts link**

Using Edit, old_string:
```html
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,400;1,600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Noto+Serif+JP:wght@300;400;600&family=Noto+Serif+KR:wght@400;600&display=swap" rel="stylesheet">
```
new_string:
```html
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,400;1,600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Noto+Serif+JP:wght@300;400;600&family=Noto+Serif+KR:wght@400;600&family=Archivo:wght@500;600;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Add `--font-sans` to `:root`**

Using Edit, old_string:
```css
            --font: 'Newsreader', Georgia, 'Times New Roman', serif;
            --font-display: 'Cormorant Garamond', 'Newsreader', Georgia, serif;
            --mono: ui-monospace, 'SF Mono', Menlo, monospace;
```
new_string:
```css
            --font: 'Newsreader', Georgia, 'Times New Roman', serif;
            --font-display: 'Cormorant Garamond', 'Newsreader', Georgia, serif;
            --font-sans: 'Archivo', -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
            --mono: ui-monospace, 'SF Mono', Menlo, monospace;
```

- [ ] **Step 3: Restyle `.mast-kicker` and `.mast-dateline`**

Using Edit, old_string:
```css
        .mast-kicker {
            display: flex; align-items: center; gap: 0.7em;
            font-family: var(--mono); font-size: 11px; font-weight: 600;
            letter-spacing: 0.28em; text-transform: uppercase; color: var(--accent);
            margin-bottom: 1.5rem; transition: color 0.3s ease;
        }
        .mast-kicker .mast-no { color: var(--caption); letter-spacing: 0.18em; }
        .mast-dateline {
            display: flex; align-items: center; flex-wrap: wrap; gap: 0.55em;
            font-family: var(--mono); font-size: 12px; letter-spacing: 0.14em;
            text-transform: uppercase; color: var(--caption);
            margin-bottom: 1.7rem; transition: color 0.3s ease;
        }
```
new_string:
```css
        .mast-kicker {
            display: flex; align-items: center; gap: 0.7em;
            font-family: var(--font-sans); font-size: 11px; font-weight: 600;
            letter-spacing: 0.16em; text-transform: uppercase; color: var(--caption);
            margin-bottom: 1.5rem; transition: color 0.3s ease;
        }
        .mast-kicker .mast-no { color: var(--caption); letter-spacing: 0.1em; }
        .mast-dateline {
            display: flex; align-items: center; flex-wrap: wrap; gap: 0.55em;
            font-family: var(--font-sans); font-size: 12px; letter-spacing: 0.1em;
            text-transform: uppercase; color: var(--caption);
            margin-bottom: 1.7rem; transition: color 0.3s ease;
        }
```

- [ ] **Step 4: Insert the "More letters" module before the subscribe form**

Issue 007 is the newest issue — no next issue exists, so the second card is "All letters". Previous = issue 006 ("Us").

Using Edit, old_string:
```html
    <div class="subscribe reveal" id="subscribe">
```
new_string:
```html
    <nav class="mfx-more-letters reveal-fade" aria-label="More letters">
        <p class="mfx-more-letters-label">
            <span data-l="en">More letters</span><span data-l="ko">다른 편지</span>
        </p>
        <div class="mfx-more-letters-grid">
            <a href="/newsletter/006/" class="mfx-more-letter">
                <span class="mfx-more-letter-num">No. 006</span>
                <span class="mfx-more-letter-title"><span data-l="en">Us</span><span data-l="ko">우리</span></span>
                <span class="mfx-more-letter-desc">
                    <span data-l="en">A $111-billion merger, a manager title I'm too tired to celebrate, Pride with Justin and the Jackass crew, the World Cup, and a Korean short-track relay I can't stop crying over. On us &mdash; the people and the country that held the line.</span>
                    <span data-l="ko">1,110억 달러짜리 합병, 축하할 기운도 없는 매니저 승진, 저스틴과 함께한 프라이드와 잭애스 크루, 월드컵, 그리고 자꾸 울게 만드는 한국 쇼트트랙 계주. 우리 &mdash; 끝내 자리를 지킨 사람들과 나라에 대하여.</span>
                </span>
            </a>
            <a href="/newsletter/" class="mfx-more-letter mfx-more-letter-all">
                <span class="mfx-more-letter-title"><span data-l="en">All letters &rarr;</span><span data-l="ko">모든 편지 &rarr;</span></span>
            </a>
        </div>
    </nav>

    <div class="divider reveal-fade"></div>

    <div class="subscribe reveal" id="subscribe">
```

- [ ] **Step 5: Verify**

Run: `grep -n "font-sans\|mfx-more-letters\|Archivo" newsletter/007/index.html`
Expected: 5+ matches.

- [ ] **Step 6: Commit**

```bash
git add newsletter/007/index.html
git commit -m "newsletter 007: anthropic-news-style chrome + more-letters module"
```

---

### Task 10: Apply to `newsletter/wounds-of-a-friend/index.html` (interlude)

**Files:**
- Modify: `newsletter/wounds-of-a-friend/index.html`

**Interfaces:**
- Consumes: `.mfx-more-letters*` classes from Task 1.

The interlude has no chronological neighbors in the weekly arc. Per spec section 4, its two cards are "All letters" and the latest issue (currently 007, "Leave").

- [ ] **Step 1: Add Archivo to the Google Fonts link**

Using Edit, old_string:
```html
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,400;1,600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Noto+Serif+KR:wght@400;600&display=swap" rel="stylesheet">
```
new_string:
```html
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,400;1,600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Noto+Serif+KR:wght@400;600&family=Archivo:wght@500;600;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Add `--font-sans` to `:root`**

Using Edit, old_string:
```css
            --font: 'Newsreader', Georgia, 'Times New Roman', serif;
            --font-display: 'Cormorant Garamond', 'Newsreader', Georgia, serif;
            --mono: ui-monospace, 'SF Mono', Menlo, monospace;
```
new_string:
```css
            --font: 'Newsreader', Georgia, 'Times New Roman', serif;
            --font-display: 'Cormorant Garamond', 'Newsreader', Georgia, serif;
            --font-sans: 'Archivo', -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
            --mono: ui-monospace, 'SF Mono', Menlo, monospace;
```

- [ ] **Step 3: Restyle `.hero-label`**

Using Edit, old_string:
```css
        .hero-label {
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.2em;
            text-transform: uppercase;
            color: var(--accent);
            margin-bottom: 1rem;
            opacity: 0;
            transition: color 0.3s ease;
        }
```
new_string:
```css
        .hero-label {
            font-family: var(--font-sans);
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: var(--caption);
            margin-bottom: 1rem;
            opacity: 0;
            transition: color 0.3s ease;
        }
```

- [ ] **Step 4: Insert the "More letters" module before the subscribe form**

Using Edit, old_string:
```html
    <div class="subscribe reveal" id="subscribe">
```
new_string:
```html
    <nav class="mfx-more-letters reveal-fade" aria-label="More letters">
        <p class="mfx-more-letters-label">
            <span data-l="en">More letters</span><span data-l="ko">다른 편지</span>
        </p>
        <div class="mfx-more-letters-grid">
            <a href="/newsletter/" class="mfx-more-letter mfx-more-letter-all">
                <span class="mfx-more-letter-title"><span data-l="en">All letters &rarr;</span><span data-l="ko">모든 편지 &rarr;</span></span>
            </a>
            <a href="/newsletter/007/" class="mfx-more-letter">
                <span class="mfx-more-letter-num">No. 007</span>
                <span class="mfx-more-letter-title"><span data-l="en">Leave</span><span data-l="ko">휴가</span></span>
                <span class="mfx-more-letter-desc">
                    <span data-l="en">First PTO from Paramount. Dad, Justin, and me at Korea&ndash;Mexico in Guadalajara &mdash; Estadio Akron, split jerseys, whole octopus, one very good group chat.</span>
                    <span data-l="ko">파라마운트 첫 PTO. 과달라하라에서 아빠, 저스틴, 나 &mdash; 에스타디오 아크론, 갈라진 유니폼, 통문어, 아주 좋은 단톡방.</span>
                </span>
            </a>
        </div>
    </nav>

    <div class="divider reveal-fade"></div>

    <div class="subscribe reveal" id="subscribe">
```

- [ ] **Step 5: Verify**

Run: `grep -n "font-sans\|mfx-more-letters\|Archivo" newsletter/wounds-of-a-friend/index.html`
Expected: 5+ matches.

- [ ] **Step 6: Commit**

```bash
git add newsletter/wounds-of-a-friend/index.html
git commit -m "newsletter wounds-of-a-friend: anthropic-news-style chrome + more-letters module"
```

---

### Task 11: Cross-page visual verification

**Files:** none modified — verification only.

**Interfaces:**
- Consumes: all changes from Tasks 1–10.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (leave running; it serves on `http://localhost:8080` and auto-opens a browser — if a server is already running on 8080, skip this step).

- [ ] **Step 2: Visually verify issue 001 (oldest, `.hero-label` pattern) in light mode**

Navigate to `http://localhost:8080/newsletter/001/`. Confirm:
- The kicker text ("A weekly letter") now renders in a sans-serif (Archivo), not the serif body font.
- Scrolling to the bottom, a "More letters" section appears before the subscribe form with exactly 2 cards: "All letters" and "No. 002 — Spring on the Mountain".
- The big italic title and body copy look unchanged from before this project.
- No layout overflow/wrapping issues in the new module.

- [ ] **Step 3: Visually verify issue 001 in dark mode and on mobile**

Toggle the theme switch in the header (top-right pill). Confirm the "More letters" cards, hairline rule, and label color all adapt correctly to dark mode (no unreadable text, no hardcoded light-mode colors). Then resize the browser to ~375px wide (or use device emulation) and confirm the 2 cards stack vertically instead of side-by-side.

- [ ] **Step 4: Visually verify issue 007 (masthead/`.mast-kicker` pattern, latest issue)**

Navigate to `http://localhost:8080/newsletter/007/`. Confirm:
- `.mast-kicker` ("Dispatch No. 007") and `.mast-dateline` now render in Archivo, tighter-tracked than before, in the muted caption color (not terracotta).
- The "More letters" section shows "No. 006 — Us" and "All letters" (007 is the latest issue, so no "next" card).
- All of 007's bespoke widgets (deal-wire card, estadio graphics, mini-player, etc.) are visually unaffected.

- [ ] **Step 5: Visually verify issue 004 (receipt format, no kicker)**

Navigate to `http://localhost:8080/newsletter/004/`. Confirm the receipt-format content is completely unaffected, and a "More letters" section (with a leading divider) appears before the subscribe form showing "No. 003 — Field of Daisies" and "No. 005 — Margin".

- [ ] **Step 6: Visually verify the interlude**

Navigate to `http://localhost:8080/newsletter/wounds-of-a-friend/`. Confirm the "More letters" section shows "All letters" and "No. 007 — Leave", and the interlude's own quiet/typographic hero is unaffected.

- [ ] **Step 7: Confirm existing functionality still works**

On at least one page (e.g. issue 006), confirm: the language pill toggles EN/KO for both the new module and existing content; the subscribe form still submits (or shows its existing validation/error UI); no new errors appear in the browser console.

- [ ] **Step 8: Confirm all 9 files reference the new font consistently**

Run: `grep -rlL "Archivo" newsletter/template.html newsletter/001/index.html newsletter/002/index.html newsletter/003/index.html newsletter/004/index.html newsletter/005/index.html newsletter/006/index.html newsletter/007/index.html newsletter/wounds-of-a-friend/index.html`
Expected: **empty output** (`-L` lists files that do NOT match — empty means every file now references Archivo).

---

### Task 12: Publish

**Files:** none modified.

- [ ] **Step 1: Review the full diff**

Run: `git log --oneline -12` and `git diff master@{12} --stat` (or `git diff origin/master --stat` if not yet pushed) to confirm exactly the 9 newsletter files + `css/microfeatures.css` changed, nothing else.

- [ ] **Step 2: Push to the remote**

Run: `git push`
Expected: pushes the new commits from Tasks 1–10 to `origin/master`. Vercel's git integration deploys automatically on push to `master` — no manual deploy command needed (per this project's existing Vercel setup: `outputDirectory: "."`, no build command).

- [ ] **Step 3: Confirm the deploy**

Run: `git log -1 --format=%H` to get the deployed commit SHA, then check the Vercel dashboard or `vercel ls` (if the Vercel CLI is authenticated) to confirm a new production deployment triggered for that commit.
