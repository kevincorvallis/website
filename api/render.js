// GET /api/render?u=<username>&s=<slug>     → article reader page
// GET /api/render?u=<username>              → author profile (their published list)
//
// Mounted at /@username/<slug> via vercel.json rewrites.
// Renders the same structural HTML the hand-built dispatches use, scoped to a
// public read of the articles table (RLS allows anon for status='published').

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeUrl(value) {
    const url = String(value || '').trim();
    if (/^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url)) return url;
    return '';
}

const ALLOWED_PROSE_TAGS = new Set(['p','br','em','strong','a','i','b','u','code','blockquote','h2','h3','ul','ol','li']);
function sanitizeProse(html) {
    if (!html || typeof html !== 'string') return '';
    return html.split(/(<[^>]+>)/g).map(part => {
        if (!part.startsWith('<')) return escapeHtml(part);

        const close = part.match(/^<\/\s*([a-z0-9-]+)\s*>$/i);
        if (close) {
            const tag = close[1].toLowerCase();
            return ALLOWED_PROSE_TAGS.has(tag) && tag !== 'br' ? `</${tag}>` : '';
        }

        const open = part.match(/^<\s*([a-z0-9-]+)([^>]*)>$/i);
        if (!open) return '';
        const tag = open[1].toLowerCase();
        if (!ALLOWED_PROSE_TAGS.has(tag)) return '';
        if (tag === 'br') return '<br>';
        if (tag === 'a') {
            const href = (open[2] || '').match(/\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]*))/i);
            const url = href ? String(href[2] || href[3] || href[4] || '') : '';
            if (/^(https?:|mailto:|\/(?!\/))/i.test(url)) {
                return `<a href="${escapeHtml(url)}" rel="noopener noreferrer">`;
            }
            return '<a>';
        }

        // Keep prose formatting simple: allowed structural tags, no attributes.
        return `<${tag}>`;
    }).join('');
}

function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function renderBlock(block) {
    const b = block || {};
    const t = b.type;
    const d = b.data || {};
    if (t === 'cover') {
        return `<section class="b-cover">
            <h1 class="b-cover-title">${escapeHtml(d.title)}</h1>
            ${d.subtitle ? `<p class="b-cover-sub">${escapeHtml(d.subtitle)}</p>` : ''}
        </section>`;
    }
    if (t === 'chapter') {
        return `<section class="b-chapter">
            ${d.mark ? `<div class="b-chapter-mark">${escapeHtml(d.mark)}</div>` : ''}
            ${d.subtitle ? `<div class="b-chapter-sub">${escapeHtml(d.subtitle)}</div>` : ''}
        </section>`;
    }
    if (t === 'prose') {
        return `<section class="b-prose">${sanitizeProse(d.html)}</section>`;
    }
    if (t === 'photo') {
        const src = escapeHtml(safeUrl(d.src));
        const alt = escapeHtml(d.alt || '');
        const cap = d.caption ? `<figcaption class="b-photo-caption">${escapeHtml(d.caption)}</figcaption>` : '';
        const frame = ['polaroid','bleed','none'].indexOf(d.frame) >= 0 ? d.frame : 'polaroid';
        if (!src) return '';
        if (frame === 'polaroid') {
            return `<figure class="b-photo polaroid"><div class="frame"><img src="${src}" alt="${alt}" loading="lazy">${cap}</div></figure>`;
        }
        return `<figure class="b-photo ${frame}"><img src="${src}" alt="${alt}" loading="lazy">${cap}</figure>`;
    }
    if (t === 'quote') {
        return `<aside class="b-quote ${d.layout === 'side' ? 'side' : ''}">
            <p>${escapeHtml(d.text)}</p>
            ${d.attribution ? `<cite>— ${escapeHtml(d.attribution)}</cite>` : ''}
        </aside>`;
    }
    if (t === 'video') {
        const src = escapeHtml(safeUrl(d.src));
        if (!src) return '';
        return `<figure class="b-video ${d.portrait ? 'portrait' : ''}">
            <video src="${src}" ${safeUrl(d.poster) ? `poster="${escapeHtml(safeUrl(d.poster))}"` : ''} muted playsinline loop controls preload="metadata"></video>
            ${d.caption ? `<figcaption>${escapeHtml(d.caption)}</figcaption>` : ''}
        </figure>`;
    }
    return '';
}

function pageShell({ title, description, image, lang, body, slug, username, displayName }) {
    const safeImage = safeUrl(image);
    return `<!DOCTYPE html>
<html lang="${escapeHtml(lang || 'en')}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description || '')}">
<meta name="author" content="${escapeHtml(displayName || username || 'Dispatch')}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description || '')}">
${safeImage ? `<meta property="og:image" content="${escapeHtml(safeImage)}">` : ''}
<meta name="twitter:card" content="${safeImage ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${escapeHtml(title)}">
${safeImage ? `<meta name="twitter:image" content="${escapeHtml(safeImage)}">` : ''}
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>✶</text></svg>">
<script>
(function() {
    var stored = localStorage.getItem('theme');
    var sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', stored || sys);
})();
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600;1,700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400;1,6..72,600&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
:root {
    --bg: #f0eee6; --text: #1f1e1d; --caption: #8a8880; --accent: #a0826d;
    --rule: rgba(31,30,29,0.1); --paper: #ffffff;
    --font: 'Newsreader', Georgia, serif;
    --font-display: 'Cormorant Garamond', 'Newsreader', Georgia, serif;
    color-scheme: light dark;
}
[data-theme="dark"] {
    --bg: #1f1e1d; --text: #f0eee6; --caption: #7a7a75; --accent: #c4a882;
    --rule: rgba(240,238,230,0.08); --paper: #2a2723;
}
html { -webkit-font-smoothing: antialiased; }
body {
    font-family: var(--font); background: var(--bg); color: var(--text);
    font-size: 20px; line-height: 1.65;
    transition: background-color 0.6s ease, color 0.3s ease;
}
::selection { background: rgba(160,130,109,0.3); color: inherit; }
a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
a:hover { opacity: 0.6; }

header {
    max-width: 620px; margin: 0 auto;
    padding: 18px 24px;
    display: flex; justify-content: space-between; align-items: center;
}
.back-link {
    font-size: 14px; opacity: 0.55; text-decoration: none;
    transition: opacity 0.2s ease;
}
.back-link:hover { opacity: 1; }
.author-handle {
    font-family: var(--font-display); font-style: italic; font-size: 16px;
    text-decoration: none;
}
.theme-pill {
    width: 36px; height: 18px; border-radius: 100px; background: var(--text);
    position: relative; cursor: pointer;
}
.theme-pill::after {
    content: ''; position: absolute; top: 2px; left: 2px;
    width: 14px; height: 14px; border-radius: 50%; background: var(--bg);
    transition: transform 0.2s ease;
}
[data-theme="dark"] .theme-pill::after { transform: translateX(18px); }
.theme-pill input { display: none; }

main { max-width: 620px; margin: 0 auto; padding: 40px 24px 80px; }

.b-cover { padding: 32px 0 24px; text-align: left; }
.b-cover-title {
    font-family: var(--font-display); font-weight: 600; font-style: italic;
    font-size: clamp(40px, 6vw, 64px); line-height: 1.04; letter-spacing: -0.02em;
    margin-bottom: 8px;
}
.b-cover-sub {
    font-style: italic; color: var(--caption); font-size: 19px;
}
.article-meta {
    margin-top: 14px;
    font-size: 12px; font-weight: 600; letter-spacing: 0.18em;
    text-transform: uppercase; color: var(--caption);
}
.article-meta .accent { color: var(--accent); }

.b-chapter { padding: 36px 0 4px; }
.b-chapter-mark {
    font-size: 11px; font-weight: 600; letter-spacing: 0.28em;
    text-transform: uppercase; color: var(--accent);
}
.b-chapter-sub {
    font-family: var(--font-display); font-style: italic; font-weight: 600;
    font-size: 24px; margin-top: 4px;
}

.b-prose { font-size: 20px; line-height: 1.7; padding: 14px 0; }
.b-prose p { margin-bottom: 1.1em; }
.b-prose p:last-child { margin-bottom: 0; }
.b-prose em { font-style: italic; }
.b-prose strong { font-weight: 600; }
.b-prose a { color: var(--text); }

.b-photo { padding: 24px 0; text-align: center; }
.b-photo img { display: block; width: 100%; height: auto; border-radius: 4px; }
.b-photo.polaroid .frame {
    display: inline-block; background: var(--paper);
    padding: 14px 14px 56px;
    box-shadow: 0 24px 60px -28px rgba(31,30,29,0.18), 0 8px 24px -12px rgba(31,30,29,0.06);
    border-radius: 4px;
    transform: rotate(-1.2deg);
    position: relative;
    max-width: 100%;
}
.b-photo.polaroid img { max-width: 100%; border-radius: 2px; }
.b-photo.polaroid .b-photo-caption {
    position: absolute; left: 14px; right: 14px; bottom: 18px;
    font-family: var(--font-display); font-style: italic; font-size: 14px;
    color: var(--caption); text-align: center;
}
.b-photo.bleed, .b-photo.none {
    margin-left: -24px; margin-right: -24px;
}
.b-photo.bleed img, .b-photo.none img { border-radius: 0; }
.b-photo.bleed .b-photo-caption, .b-photo.none .b-photo-caption {
    font-family: var(--font-display); font-style: italic; font-size: 14px;
    color: var(--caption); text-align: center; margin-top: 12px; padding: 0 24px;
}

.b-quote {
    font-family: var(--font-display); font-style: italic;
    font-size: 28px; line-height: 1.3; text-align: center;
    padding: 32px 16px;
    border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule);
    margin: 32px 0;
}
.b-quote cite {
    display: block; margin-top: 14px;
    font-family: var(--font); font-style: normal; font-size: 14px;
    color: var(--caption); letter-spacing: 0.12em; text-transform: uppercase;
}
.b-video { margin: 32px 0; text-align: center; }
.b-video video { width: 100%; border-radius: 8px; }
.b-video.portrait { max-width: 440px; margin-left: auto; margin-right: auto; }
.b-video figcaption {
    font-family: var(--font-display); font-style: italic; font-size: 14px;
    color: var(--caption); margin-top: 12px;
}

footer {
    max-width: 620px; margin: 80px auto 0;
    padding: 40px 24px;
    border-top: 1px solid var(--rule);
    display: flex; justify-content: space-between; align-items: center;
    font-size: 13px; color: var(--caption);
}
footer .made { font-style: italic; }
footer a { color: var(--text); opacity: 0.8; }

/* Profile list (when no slug) */
.profile-hero { padding: 40px 0 24px; }
.profile-hero h1 {
    font-family: var(--font-display); font-style: italic; font-weight: 600;
    font-size: 38px; line-height: 1.1;
    margin-bottom: 4px;
}
.profile-handle {
    font-size: 11px; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase;
    color: var(--accent); margin-bottom: 18px;
}
.profile-bio {
    font-size: 18px; color: var(--text);
}
.issue-list { list-style: none; margin-top: 28px; }
.issue-list li {
    border-bottom: 1px solid var(--rule);
}
.issue-list li:last-child { border-bottom: none; }
.issue-link {
    display: flex; gap: 1.25rem; align-items: flex-start;
    padding: 1.5rem 0; text-decoration: none;
    transition: opacity 0.2s ease;
}
.issue-link:hover { opacity: 0.6; }
.issue-cover {
    width: 110px; height: 80px; border-radius: 6px;
    object-fit: cover; background: var(--rule); flex-shrink: 0;
}
.issue-meta {
    display: flex; gap: 14px; align-items: baseline; margin-bottom: 4px;
    font-size: 12px;
}
.issue-num {
    font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--accent);
}
.issue-date { color: var(--caption); }
.issue-title {
    font-family: var(--font-display); font-style: italic; font-weight: 600;
    font-size: 22px;
}
.issue-desc {
    font-size: 15px; color: var(--caption); margin-top: 4px;
}

.empty-state {
    text-align: center; padding: 80px 20px;
    color: var(--caption); font-style: italic;
}

@media (max-width: 600px) {
    body { font-size: 18px; }
    .b-cover-title { font-size: 38px; }
    .b-prose { font-size: 18px; }
    .b-photo.bleed, .b-photo.none { margin-left: -20px; margin-right: -20px; }
}

@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { transition-duration: 0.01ms !important; }
}
</style>
</head>
<body>
<header>
${username
    ? `<a href="/@${escapeHtml(username)}" class="back-link">← @${escapeHtml(username)}</a>
<a href="/@${escapeHtml(username)}" class="author-handle">${escapeHtml(displayName || username)}</a>`
    : `<a href="/dispatch/" class="back-link">← Dispatch</a>
<a href="/dispatch/" class="author-handle">Dispatch</a>`}
<label class="theme-pill" for="theme-toggle"><input type="checkbox" id="theme-toggle"></label>
</header>
${body}
<footer>
<div>Published with <a href="/dispatch/">Dispatch</a></div>
<div class="made">${username ? escapeHtml(displayName || username) + (slug ? ` · ${escapeHtml(slug)}` : '') : ''}</div>
</footer>
<script>
(function() {
    var t = document.getElementById('theme-toggle');
    var root = document.documentElement;
    if (t) {
        t.checked = root.getAttribute('data-theme') === 'dark';
        t.addEventListener('change', function() {
            var v = t.checked ? 'dark' : 'light';
            root.setAttribute('data-theme', v);
            localStorage.setItem('theme', v);
        });
    }
})();
</script>
</body>
</html>`;
}

function notFoundPage() {
    return pageShell({
        title: 'Not found — Dispatch',
        description: 'This dispatch could not be found.',
        username: '',
        slug: '',
        displayName: 'Dispatch',
        body: '<main><div class="empty-state"><p>We couldn\'t find this dispatch.</p><p style="margin-top:1em;"><a href="/dispatch/">Back to Dispatch</a></p></div></main>',
    });
}

async function fetchProfile(handle) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?handle=eq.${encodeURIComponent(handle)}&select=id,handle,display_name,bio,avatar_url`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    if (!rows || !rows[0]) return null;
    const p = rows[0];
    // Web shape: expose `username` alongside `handle` for legacy template variables
    return { id: p.id, username: p.handle, handle: p.handle, display_name: p.display_name, bio: p.bio, avatar_url: p.avatar_url };
}

async function fetchArticle(authorId, slug) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/articles?author_id=eq.${authorId}&slug=eq.${encodeURIComponent(slug)}&status=in.(published,sent)&select=id,slug,title_en,title_ko,description_en,description_ko,content_blocks,cover_image_url,published_at`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    if (!rows || !rows[0]) return null;
    const a = rows[0];
    return {
        id: a.id, slug: a.slug,
        title: a.title_en || '', title_ko: a.title_ko || null,
        subtitle: a.description_en || null, subtitle_ko: a.description_ko || null,
        body_json: a.content_blocks || [],
        cover_image_url: a.cover_image_url || null,
        published_at: a.published_at,
    };
}

async function fetchAuthorArticles(authorId) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/articles?author_id=eq.${authorId}&status=in.(published,sent)&select=id,slug,title_en,description_en,cover_image_url,published_at&order=published_at.desc`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!r.ok) return [];
    const rows = await r.json();
    return rows.map(a => ({
        id: a.id, slug: a.slug,
        title: a.title_en || '',
        subtitle: a.description_en || null,
        cover_image_url: a.cover_image_url || null,
        published_at: a.published_at,
    }));
}

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(500).send(notFoundPage());
    }

    const uRaw = (req.query.u || '').toString();
    const sRaw = (req.query.s || '').toString();
    const u = uRaw.toLowerCase();
    const s = sRaw.toLowerCase();

    if (!u || !/^[a-z0-9_]{3,20}$/.test(u)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(404).send(notFoundPage());
    }

    // Canonicalize: /@KEVINLEE → 301 /@kevinlee so handles only live at one URL
    if (uRaw !== u || sRaw !== s) {
        const canonical = '/@' + u + (s ? '/' + s : '');
        res.setHeader('Location', canonical);
        return res.status(301).end();
    }

    try {
        const profile = await fetchProfile(u);
        if (!profile) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            // 404s: cache briefly at the edge but never in browsers — a slug may go live later
            res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
            return res.status(404).send(notFoundPage());
        }

        // --- AUTHOR PROFILE PAGE (no slug) ---
        if (!s) {
            const articles = await fetchAuthorArticles(profile.id);
            const items = articles.length
                ? `<ul class="issue-list">${articles.map((a, i) => `
                    <li>
                        <a class="issue-link" href="/@${escapeHtml(profile.username)}/${escapeHtml(a.slug)}">
                            ${safeUrl(a.cover_image_url) ? `<img class="issue-cover" src="${escapeHtml(safeUrl(a.cover_image_url))}" alt="" loading="lazy">` : ''}
                            <div>
                                <div class="issue-meta">
                                    <span class="issue-num">${String(articles.length - i).padStart(3, '0')}</span>
                                    <span class="issue-date">${escapeHtml(fmtDate(a.published_at))}</span>
                                </div>
                                <div class="issue-title">${escapeHtml(a.title || 'Untitled')}</div>
                                ${a.subtitle ? `<div class="issue-desc">${escapeHtml(a.subtitle)}</div>` : ''}
                            </div>
                        </a>
                    </li>`).join('')}</ul>`
                : `<div class="empty-state">${escapeHtml(profile.display_name || profile.username)} hasn\'t published yet.</div>`;

            const body = `<main>
                <section class="profile-hero">
                    <div class="profile-handle">@${escapeHtml(profile.username)}</div>
                    <h1>${escapeHtml(profile.display_name || profile.username)}</h1>
                    ${profile.bio ? `<p class="profile-bio">${escapeHtml(profile.bio)}</p>` : ''}
                </section>
                ${items}
            </main>`;

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
            // og:image fallback: author's avatar, or the cover of their most recent published article
            const profileOg = profile.avatar_url
                || (articles[0] && articles[0].cover_image_url)
                || null;
            return res.status(200).send(pageShell({
                title: `${profile.display_name || profile.username} — Dispatch`,
                description: profile.bio || `Dispatches by @${profile.username}.`,
                image: profileOg,
                username: profile.username,
                displayName: profile.display_name,
                body,
            }));
        }

        // --- ARTICLE PAGE ---
        if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(s)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(404).send(notFoundPage());
        }

        const article = await fetchArticle(profile.id, s);
        if (!article) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            // 404s: cache briefly at the edge but never in browsers — a slug may go live later
            res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
            return res.status(404).send(notFoundPage());
        }

        const blocks = Array.isArray(article.body_json) ? article.body_json : [];
        const blocksHtml = blocks.map(renderBlock).join('\n');
        // First photo is a fallback OG image if cover_image_url is null
        const firstPhoto = blocks.find(b => b.type === 'photo' && b.data && safeUrl(b.data.src));
        const image = safeUrl(article.cover_image_url) || (firstPhoto ? safeUrl(firstPhoto.data.src) : null);

        // Prepend a meta line under the cover with author + date
        const meta = `<div class="article-meta"><span class="accent">@${escapeHtml(profile.username)}</span> · ${escapeHtml(fmtDate(article.published_at))}</div>`;
        // Inject meta after the b-cover block if present
        let combined = blocksHtml;
        if (combined.indexOf('</section>') >= 0) {
            combined = combined.replace('</section>', meta + '</section>');
        } else {
            combined = meta + combined;
        }

        const body = `<main><article>${combined}</article></main>`;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
        return res.status(200).send(pageShell({
            title: `${article.title || 'Untitled'} — @${profile.username}`,
            description: article.subtitle || `A dispatch by @${profile.username}.`,
            image,
            username: profile.username,
            displayName: profile.display_name,
            slug: article.slug,
            body,
        }));
    } catch (err) {
        console.error('render error:', err);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(500).send(notFoundPage());
    }
};
