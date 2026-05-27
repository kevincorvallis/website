// GET  /api/articles                  → list my articles (drafts + published)
// GET  /api/articles?id=<bigint>      → fetch a single article with full content_blocks
// POST /api/articles                  → create a new draft  body: { title?, slug?, template_key?, body_json? }
// PUT  /api/articles?id=<bigint>      → update fields (autosave, publish toggle)
// DELETE /api/articles?id=<bigint>    → delete
//
// Maps the web platform vocabulary (title / body_json) to the existing
// Pookie Dispatch schema (articles.title_en / articles.content_blocks).
// articles.id is bigint. article_status enum is draft | published | sent.
// All routes require a Supabase access token in the Authorization header.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED_ORIGINS = ['https://klee.page', 'https://www.klee.page'];

const rateMap = new Map();
const RATE_LIMIT = 60;
const RATE_WINDOW = 60 * 1000;

function isRateLimited(ip) {
    const now = Date.now();
    const entry = rateMap.get(ip);
    if (!entry || now - entry.start > RATE_WINDOW) {
        rateMap.set(ip, { start: now, count: 1 });
        return false;
    }
    entry.count++;
    return entry.count > RATE_LIMIT;
}

// Trust Vercel's headers in preference order; fall back to last hop of
// x-forwarded-for (the proxy-appended value, harder to spoof than the first).
function clientIp(req) {
    const vcl = req.headers['x-vercel-forwarded-for'];
    if (vcl) return String(vcl).split(',').pop().trim();
    const real = req.headers['x-real-ip'];
    if (real) return String(real).trim();
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',').pop().trim();
    return req.socket && req.socket.remoteAddress || 'unknown';
}

async function verifyUser(token) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    return r.json();
}

async function getProfile(userId) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id,handle,display_name`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows && rows[0] ? rows[0] : null;
}

// ---- Block validation ----
const VALID_BLOCK_TYPES = new Set(['cover','chapter','prose','photo','video','audio','quote','field-card','photo-grid']);
const VALID_PHOTO_FRAMES = new Set(['polaroid','bleed','none']);
const MAX_BLOCKS = 200;
const MAX_FIELD_LENGTH = 8000;
const MAX_PROSE_LENGTH = 40000;
const MAX_URL_LENGTH = 1024;

function bad(field, msg) { return { ok: false, error: `Block ${field}: ${msg}` }; }
function isLocalUrl(value) {
    const s = String(value || '');
    return s.startsWith('data:') || s.startsWith('blob:');
}

function validateBlocks(arr) {
    if (!Array.isArray(arr)) return { ok: false, error: 'body must be an array' };
    if (arr.length > MAX_BLOCKS) return { ok: false, error: `Too many blocks (max ${MAX_BLOCKS})` };
    const cleaned = [];
    for (let i = 0; i < arr.length; i++) {
        const b = arr[i];
        if (!b || typeof b !== 'object') return bad(i, 'must be an object');
        if (!VALID_BLOCK_TYPES.has(b.type)) return bad(i, `unknown type ${b.type}`);
        const id = typeof b.id === 'string' ? b.id.slice(0, 32) : 'b' + i;
        const data = b.data && typeof b.data === 'object' ? b.data : {};
        const clean = { id, type: b.type, data: {} };
        if (b.type === 'cover') {
            clean.data.title    = String(data.title || '').slice(0, 200);
            clean.data.subtitle = String(data.subtitle || '').slice(0, 280);
        } else if (b.type === 'chapter') {
            clean.data.mark     = String(data.mark || '').slice(0, 60);
            clean.data.subtitle = String(data.subtitle || '').slice(0, 200);
        } else if (b.type === 'prose') {
            const html = String(data.html || '');
            if (html.length > MAX_PROSE_LENGTH) return bad(i, 'prose too long');
            clean.data.html = html;
        } else if (b.type === 'photo') {
            const src = String(data.src || '');
            if (src.length > MAX_URL_LENGTH) return bad(i, 'photo src too long');
            if (isLocalUrl(src)) return bad(i, 'photo must be uploaded before publish');
            if (src && !/^https?:\/\//i.test(src) && src.charAt(0) !== '/') return bad(i, 'photo src must be a URL');
            clean.data.src     = src;
            clean.data.alt     = String(data.alt || '').slice(0, 200);
            clean.data.caption = String(data.caption || '').slice(0, 280);
            clean.data.frame   = VALID_PHOTO_FRAMES.has(data.frame) ? data.frame : 'polaroid';
        } else {
            for (const k in data) {
                if (typeof data[k] === 'string') clean.data[k] = data[k].slice(0, MAX_FIELD_LENGTH);
                else if (data[k] !== null) clean.data[k] = data[k];
            }
        }
        cleaned.push(clean);
    }
    return { ok: true, blocks: cleaned };
}

function validateSlug(slug) {
    if (!slug || typeof slug !== 'string') return null;
    const s = slug.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(s)) return null;
    return s;
}

function suggestSlug(title, fallback) {
    const base = String(title || '').toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);
    if (base && /^[a-z0-9]/.test(base)) return base;
    return fallback || ('draft-' + Math.random().toString(36).slice(2, 8));
}

function isValidId(id) {
    if (typeof id === 'number') return Number.isInteger(id) && id > 0;
    if (typeof id !== 'string') return false;
    return /^\d{1,18}$/.test(id);
}

// Map a DB row to the web platform shape
function toApiArticle(row) {
    if (!row) return null;
    return {
        id: row.id,
        slug: row.slug,
        title: row.title_en || '',
        title_ko: row.title_ko || null,
        subtitle: row.description_en || null,
        subtitle_ko: row.description_ko || null,
        template_key: null,
        status: row.status,
        visibility: 'public',
        cover_image_url: row.cover_image_url || null,
        body_json: row.content_blocks || [],
        published_at: row.published_at,
        updated_at: row.created_at,
        created_at: row.created_at,
    };
}

async function dbReq(method, path, body) {
    return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            Prefer: 'return=representation',
        },
        body: body ? JSON.stringify(body) : undefined,
    });
}

module.exports = async function handler(req, res) {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Server configuration error' });

    if (isRateLimited(clientIp(req))) return res.status(429).json({ error: 'Too many requests' });

    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Sign in first.' });
    const user = await verifyUser(token);
    if (!user || !user.id) return res.status(401).json({ error: 'Invalid session.' });
    const profile = await getProfile(user.id);
    if (!profile || !profile.handle) return res.status(403).json({ error: 'Claim a handle before writing.' });

    const apiProfile = { id: profile.id, handle: profile.handle, display_name: profile.display_name };

    try {
        // ---- GET ----
        if (req.method === 'GET') {
            const id = req.query.id;
            if (id) {
                if (!isValidId(id)) return res.status(400).json({ error: 'Valid id required' });
                const r = await fetch(
                    `${SUPABASE_URL}/rest/v1/articles?id=eq.${id}&author_id=eq.${profile.id}&select=id,slug,title_en,title_ko,description_en,description_ko,status,cover_image_url,content_blocks,published_at,created_at`,
                    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
                );
                if (!r.ok) {
                    const txt = await r.text();
                    console.error('article get failed:', r.status, txt);
                    return res.status(502).json({ error: 'Could not load article' });
                }
                const rows = await r.json();
                if (!rows.length) return res.status(404).json({ error: 'Not found' });
                return res.status(200).json({ ok: true, profile: apiProfile, article: toApiArticle(rows[0]) });
            }
            const r = await fetch(
                `${SUPABASE_URL}/rest/v1/articles?author_id=eq.${profile.id}&select=id,slug,title_en,title_ko,description_en,status,cover_image_url,published_at,created_at&order=created_at.desc`,
                { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
            );
            if (!r.ok) {
                const txt = await r.text();
                console.error('articles list failed:', r.status, txt);
                return res.status(502).json({ error: 'Could not load articles' });
            }
            const rows = await r.json();
            return res.status(200).json({ ok: true, profile: apiProfile, articles: rows.map(toApiArticle) });
        }

        // ---- CREATE ----
        if (req.method === 'POST') {
            const { title, body_json } = req.body || {};
            const t = (title && typeof title === 'string') ? title.trim().slice(0, 200) : '';
            // template_key is accepted in the body for forward-compat but not persisted
            // (existing schema doesn't have this column; safe to drop)

            let validatedBlocks = [];
            if (body_json !== undefined) {
                const v = validateBlocks(body_json);
                if (!v.ok) return res.status(400).json({ error: v.error });
                validatedBlocks = v.blocks;
            }

            let base = suggestSlug(t, 'draft');
            let slug = base;
            for (let i = 0; i < 8; i++) {
                const check = await fetch(`${SUPABASE_URL}/rest/v1/articles?author_id=eq.${profile.id}&slug=eq.${encodeURIComponent(slug)}&select=id`, {
                    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
                });
                const rows = check.ok ? await check.json() : [];
                if (!rows.length) break;
                slug = `${base}-${Math.random().toString(36).slice(2, 5)}`;
            }

            const row = {
                author_id: profile.id,
                slug,
                title_en: t,
                status: 'draft',
                content_blocks: validatedBlocks,
            };
            const r = await dbReq('POST', 'articles', row);
            if (!r.ok) {
                const txt = await r.text();
                console.error('articles insert failed:', r.status, txt);
                return res.status(502).json({ error: 'Could not create draft' });
            }
            const created = await r.json();
            return res.status(201).json({ ok: true, article: toApiArticle(created[0]) });
        }

        // ---- UPDATE ----
        if (req.method === 'PUT') {
            const id = req.query.id;
            if (!isValidId(id)) return res.status(400).json({ error: 'Valid article id required' });

            const own = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${id}&author_id=eq.${profile.id}&select=id,slug,status,title_en,content_blocks`, {
                headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
            });
            const existing = own.ok ? await own.json() : [];
            if (!existing.length) return res.status(404).json({ error: 'Not found' });
            const before = existing[0];

            const updates = {};
            const patch = req.body || {};
            if ('title' in patch) updates.title_en = String(patch.title || '').trim().slice(0, 200);
            if ('title_ko' in patch) updates.title_ko = patch.title_ko ? String(patch.title_ko).trim().slice(0, 200) : null;
            if ('subtitle' in patch) updates.description_en = patch.subtitle ? String(patch.subtitle).trim().slice(0, 280) : null;
            if ('subtitle_ko' in patch) updates.description_ko = patch.subtitle_ko ? String(patch.subtitle_ko).trim().slice(0, 280) : null;
            if ('cover_image_url' in patch) {
                const u = patch.cover_image_url ? String(patch.cover_image_url).slice(0, 1024) : null;
                if (u && isLocalUrl(u)) return res.status(400).json({ error: 'cover_image_url must be an uploaded URL' });
                updates.cover_image_url = u;
            }
            // template_key is intentionally ignored on update — column doesn't exist in the existing schema yet
            if ('body_json' in patch) {
                const v = validateBlocks(patch.body_json);
                if (!v.ok) return res.status(400).json({ error: v.error });
                updates.content_blocks = v.blocks;
            }
            if ('slug' in patch) {
                const s = validateSlug(patch.slug);
                if (!s) return res.status(400).json({ error: 'Invalid slug. Use lowercase letters, numbers, and dashes.' });
                updates.slug = s;
            }

            if ('status' in patch) {
                if (!['draft','published','sent'].includes(patch.status)) return res.status(400).json({ error: 'Invalid status' });
                if (patch.status === 'published') {
                    const finalTitle  = 'title_en'       in updates ? updates.title_en       : before.title_en;
                    const finalBlocks = 'content_blocks' in updates ? updates.content_blocks : before.content_blocks;
                    if (!finalTitle || !finalTitle.trim()) return res.status(400).json({ error: 'Title is required to publish.' });
                    if (!Array.isArray(finalBlocks) || finalBlocks.length === 0) return res.status(400).json({ error: 'Add at least one block before publishing.' });
                    const hasContent = finalBlocks.some(b => {
                        if (b.type === 'cover')   return (b.data.title || '').trim() || (b.data.subtitle || '').trim();
                        if (b.type === 'prose')   return (b.data.html  || '').replace(/<[^>]+>/g, '').trim();
                        if (b.type === 'photo')   return !!b.data.src && !isLocalUrl(b.data.src);
                        if (b.type === 'chapter') return (b.data.mark || '').trim() || (b.data.subtitle || '').trim();
                        return true;
                    });
                    if (!hasContent) return res.status(400).json({ error: 'Add some content before publishing.' });
                    const stillLocal = finalBlocks.find(b => b.type === 'photo' && typeof b.data.src === 'string' && isLocalUrl(b.data.src));
                    if (stillLocal) return res.status(400).json({ error: 'A photo is still local — upload it before publishing.' });

                    updates.status = 'published';
                    updates.published_at = new Date().toISOString();
                } else {
                    updates.status = patch.status;
                    if (patch.status === 'draft') updates.published_at = null;
                }
            }

            if (!Object.keys(updates).length) return res.status(400).json({ error: 'No fields to update' });

            const r = await dbReq('PATCH', `articles?id=eq.${id}`, updates);
            if (!r.ok) {
                const txt = await r.text();
                console.error('articles update failed:', r.status, txt);
                if (txt.includes('articles_slug') || txt.includes('duplicate')) {
                    return res.status(409).json({ error: 'You already have an article with that slug.' });
                }
                return res.status(502).json({ error: 'Could not save' });
            }
            const updated = await r.json();
            return res.status(200).json({ ok: true, article: toApiArticle(updated[0]) });
        }

        // ---- DELETE ----
        if (req.method === 'DELETE') {
            const id = req.query.id;
            if (!isValidId(id)) return res.status(400).json({ error: 'Valid id required' });
            const r = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${id}&author_id=eq.${profile.id}`, {
                method: 'DELETE',
                headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: 'return=minimal' },
            });
            if (!r.ok) return res.status(502).json({ error: 'Delete failed' });
            return res.status(200).json({ ok: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        console.error('articles error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
