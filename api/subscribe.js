const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED_ORIGINS = ['https://klee.page', 'https://www.klee.page'];

// Rate limiter: 5 requests per minute per IP
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

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

module.exports = async function handler(req, res) {
    // CORS
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    if (isRateLimited(ip)) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    const { email } = req.body || {};

    if (!email || typeof email !== 'string' || !isValidEmail(email.trim())) {
        return res.status(400).json({ error: 'Valid email is required' });
    }

    const row = {
        email: email.trim().toLowerCase(),
        ip,
        country: req.headers['x-vercel-ip-country'] || null,
        city: req.headers['x-vercel-ip-city'] || null,
        user_agent: req.headers['user-agent'] || null,
    };

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/dispatch_subscribers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Prefer': 'return=minimal',
            },
            body: JSON.stringify(row),
        });

        // 409 = duplicate email (unique constraint), treat as success
        if (response.ok || response.status === 409) {
            return res.status(200).json({ ok: true });
        }

        const err = await response.text();
        // Supabase returns 409 as a 400-level with a conflict message
        if (err.includes('duplicate') || err.includes('unique')) {
            return res.status(200).json({ ok: true });
        }

        console.error('Supabase subscribe error:', response.status, err);
        return res.status(502).json({ error: 'Failed to subscribe' });
    } catch (err) {
        console.error('Subscribe error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
