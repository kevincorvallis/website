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

    const { email, source, website, elapsed } = req.body || {};

    if (!email || typeof email !== 'string' || !isValidEmail(email.trim())) {
        return res.status(400).json({ error: 'Valid email is required' });
    }

    // Bot gate: the honeypot field is invisible to humans, and no human submits
    // within 1.5s of page load (kept below the ~3s mark so autofill users never
    // trip it). Silent 200 — don't teach bots which check failed. Logged so a
    // false positive is recoverable from function logs.
    if (website || (typeof elapsed === 'number' && elapsed >= 0 && elapsed < 1500)) {
        console.warn('SUBSCRIBE_BOT_DROP', email.trim().toLowerCase(), website ? 'honeypot' : 'elapsed', elapsed);
        return res.status(200).json({ ok: true });
    }

    // source distinguishes the weekly newsletter from the tool-notify waitlist.
    // Absent → newsletter (the column default); present-but-unknown → reject.
    if (source !== undefined && source !== 'newsletter' && source !== 'tool-notify') {
        return res.status(400).json({ error: 'Invalid source' });
    }

    const row = {
        email: email.trim().toLowerCase(),
        ip,
        country: req.headers['x-vercel-ip-country'] || null,
        city: req.headers['x-vercel-ip-city'] || null,
        user_agent: req.headers['user-agent'] || null,
    };
    // Only send the column for the non-default list, so newsletter inserts stay
    // byte-identical to the pre-migration shape.
    if (source && source !== 'newsletter') {
        row.source = source;
    }

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

        // Log the email so a failed signup (e.g. Supabase down) is recoverable from
        // the function logs. Email only — don't spill IP/UA into logging infra.
        console.error('SUBSCRIBE_FAILED', response.status, row.email, row.source || 'newsletter');
        return res.status(502).json({ error: 'Failed to subscribe' });
    } catch (err) {
        console.error('SUBSCRIBE_FAILED', 'exception', row.email, row.source || 'newsletter', err && err.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
