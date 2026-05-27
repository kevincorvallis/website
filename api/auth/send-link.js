// POST /api/auth/send-link
// Body: { email: string, code?: string }
// Verifies the email/code is on the invitations list, then asks Supabase to
// email a magic link that lands on /dispatch/auth/callback.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.SITE_URL || 'https://klee.page';

const ALLOWED_ORIGINS = ['https://klee.page', 'https://www.klee.page'];

const rateMap = new Map();
const RATE_LIMIT = 3;
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

// Trust Vercel's headers in preference order; x-forwarded-for can be spoofed by the client.
function clientIp(req) {
    const vcl = req.headers['x-vercel-forwarded-for'];
    if (vcl) return String(vcl).split(',').pop().trim();
    const real = req.headers['x-real-ip'];
    if (real) return String(real).trim();
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',').pop().trim();
    return req.socket && req.socket.remoteAddress || 'unknown';
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

async function findInvitation(email, code) {
    // Match by code if provided, otherwise by email
    let url;
    if (code) {
        url = `${SUPABASE_URL}/rest/v1/invitations?code=eq.${encodeURIComponent(code)}&select=id,email,used_by,expires_at`;
    } else {
        url = `${SUPABASE_URL}/rest/v1/invitations?email=eq.${encodeURIComponent(email)}&select=id,email,used_by,expires_at`;
    }
    const response = await fetch(url, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!response.ok) return null;
    const rows = await response.json();
    if (!rows || !rows.length) return null;
    const inv = rows[0];
    // If invitation has an email lock, it must match
    if (inv.email && inv.email.toLowerCase() !== email.toLowerCase()) return null;
    // Already used by someone else
    if (inv.used_by) return null;
    // Expired
    if (inv.expires_at && new Date(inv.expires_at) < new Date()) return null;
    return inv;
}

async function sendMagicLink(email, redirectTo) {
    // Supabase Auth: send OTP / magic link via the admin REST endpoint.
    const response = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({
            email,
            create_user: true,
            options: { email_redirect_to: redirectTo },
        }),
    });
    return response.ok;
}

module.exports = async function handler(req, res) {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    if (isRateLimited(clientIp(req))) return res.status(429).json({ error: 'Too many requests' });

    const { email, code } = req.body || {};
    if (!email || typeof email !== 'string' || !isValidEmail(email.trim())) {
        return res.status(400).json({ error: 'Valid email is required' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code && typeof code === 'string' ? code.trim() : null;

    try {
        const invitation = await findInvitation(cleanEmail, cleanCode);
        if (!invitation) {
            // Don't leak which check failed
            return res.status(403).json({ error: "That email isn't on the invite list yet. Ask Kevin." });
        }

        const redirectTo = `${SITE_URL.replace(/\/$/, '')}/dispatch/auth/callback/${
            cleanCode ? `?invite=${encodeURIComponent(cleanCode)}` : ''
        }`;

        const sent = await sendMagicLink(cleanEmail, redirectTo);
        if (!sent) {
            return res.status(502).json({ error: 'Could not send the magic link. Try again.' });
        }

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('send-link error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
