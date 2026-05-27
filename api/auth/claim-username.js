// POST /api/auth/claim-username
// Headers: Authorization: Bearer <supabase-access-token>
// Body: { username?: string, handle?: string, invitation_code?: string, display_name?: string }
// On first sign-in only: creates a profiles row, marks the invitation as used.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED_ORIGINS = ['https://klee.page', 'https://www.klee.page'];

// Reserved server-side; these names can't be claimed because they collide with routes.
const RESERVED = new Set([
    'admin','api','auth','newsletter','dispatch','dashboard','sign-in','signin','signup',
    'read','reader','about','support','help','www','app','editor','templates',
    'kevin', // owner-only handle
    'root','system','staff','team','official','dispatch-team',
]);
const OWNER_EMAILS = new Set(
    (process.env.DISPATCH_OWNER_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean)
);

const rateMap = new Map();
const RATE_LIMIT = 5;
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

async function dbSelect(path) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!r.ok) return null;
    return r.json();
}
async function dbInsert(path, row) {
    return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            Prefer: 'return=representation',
        },
        body: JSON.stringify(row),
    });
}
async function dbDelete(path) {
    return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method: 'DELETE',
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            Prefer: 'return=minimal',
        },
    });
}

async function findValidInvitation(user, code) {
    const email = (user.email || '').toLowerCase();
    let query = null;
    if (code && typeof code === 'string' && code.trim()) {
        query = `invitations?code=eq.${encodeURIComponent(code.trim())}&select=id,email,used_by,expires_at`;
    } else if (email) {
        query = `invitations?email=eq.${encodeURIComponent(email)}&select=id,email,used_by,expires_at`;
    }
    if (!query) return null;

    const rows = await dbSelect(query);
    if (!rows || !rows.length) return null;

    const inv = rows[0];
    if (inv.used_by) return null;
    if (inv.email && inv.email.toLowerCase() !== email) return null;
    if (inv.expires_at && new Date(inv.expires_at) < new Date()) return null;
    return inv;
}

async function consumeInvitation(invitationId, userId) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/invitations?id=eq.${invitationId}&used_by=is.null`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            Prefer: 'return=representation',
        },
        body: JSON.stringify({ used_by: userId, used_at: new Date().toISOString() }),
    });
    if (!r.ok) return false;
    const rows = await r.json();
    return !!(rows && rows.length);
}

module.exports = async function handler(req, res) {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Server configuration error' });

    if (isRateLimited(clientIp(req))) return res.status(429).json({ error: 'Too many requests' });

    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Sign in first.' });

    const user = await verifyUser(token);
    if (!user || !user.id) return res.status(401).json({ error: 'Invalid session.' });

    const { username, handle, display_name, invitation_code } = req.body || {};
    const rawHandle = typeof handle === 'string' ? handle : username;
    if (!rawHandle || typeof rawHandle !== 'string') return res.status(400).json({ error: 'Handle required.' });
    const h = rawHandle.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(h)) {
        return res.status(400).json({ error: 'Handles are lowercase letters, numbers, or underscore (3–20 chars).' });
    }
    const isOwnerHandle = h === 'kevin';
    const isOwnerEmail = user.email && OWNER_EMAILS.has(user.email.toLowerCase());
    if (RESERVED.has(h) && !(isOwnerHandle && isOwnerEmail)) {
        return res.status(400).json({ error: 'That handle is reserved. Try another.' });
    }

    try {
        // Already has a profile? Return it (idempotent).
        const existing = await dbSelect(`profiles?id=eq.${user.id}&select=id,handle,display_name`);
        if (existing && existing.length) {
            const p = existing[0];
            return res.status(200).json({ ok: true, profile: Object.assign({}, p, { username: p.handle }), existing: true });
        }

        const invitation = await findValidInvitation(user, invitation_code);
        if (!invitation) {
            return res.status(403).json({ error: "That account doesn't have an unused invite." });
        }

        // Username taken?
        const taken = await dbSelect(`profiles?handle=eq.${encodeURIComponent(h)}&select=id`);
        if (taken && taken.length) return res.status(409).json({ error: 'That handle is taken.' });

        // Insert profile
        const display = (display_name && typeof display_name === 'string') ? display_name.trim().slice(0, 60) : null;
        const insertRes = await dbInsert('profiles', { id: user.id, handle: h, display_name: display });
        if (!insertRes.ok) {
            const txt = await insertRes.text();
            console.error('profile insert failed:', insertRes.status, txt);
            return res.status(502).json({ error: 'Could not claim that handle. Try again.' });
        }
        const inserted = await insertRes.json();

        const consumed = await consumeInvitation(invitation.id, user.id);
        if (!consumed) {
            await dbDelete(`profiles?id=eq.${user.id}`);
            return res.status(409).json({ error: 'That invite was already used. Ask Kevin for a fresh one.' });
        }

        const profile = inserted[0] || { id: user.id, handle: h, display_name: display };
        return res.status(200).json({ ok: true, profile: Object.assign({}, profile, { username: profile.handle }) });
    } catch (err) {
        console.error('claim-username error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
