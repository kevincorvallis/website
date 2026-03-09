const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED_ORIGINS = ['https://klee.page', 'https://www.klee.page'];

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

module.exports = async function handler(req, res) {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    // GET — fetch comments for an issue
    if (req.method === 'GET') {
        const issue = req.query.issue;
        if (!issue || typeof issue !== 'string' || !/^[a-zA-Z0-9-]+$/.test(issue) || issue.length > 20) {
            return res.status(400).json({ error: 'Valid issue param required' });
        }

        try {
            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/dispatch_comments?issue=eq.${issue}&order=created_at.desc&select=id,name,comment,created_at`,
                {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                    },
                }
            );

            if (!response.ok) {
                console.error('Supabase comments fetch error:', response.status);
                return res.status(502).json({ error: 'Failed to fetch comments' });
            }

            const comments = await response.json();
            return res.status(200).json(comments);
        } catch (err) {
            console.error('Comments fetch error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    // POST — submit a comment
    if (req.method === 'POST') {
        const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
        if (isRateLimited(ip)) {
            return res.status(429).json({ error: 'Too many requests' });
        }

        const { issue, name, comment } = req.body || {};

        if (!issue || typeof issue !== 'string' || !/^[a-zA-Z0-9-]+$/.test(issue) || issue.length > 20) {
            return res.status(400).json({ error: 'Valid issue required' });
        }
        if (!name || typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 100) {
            return res.status(400).json({ error: 'Valid name required' });
        }
        if (!comment || typeof comment !== 'string' || comment.trim().length === 0 || comment.trim().length > 2000) {
            return res.status(400).json({ error: 'Valid comment required' });
        }

        const row = {
            issue: issue.trim(),
            name: name.trim(),
            comment: comment.trim(),
            ip,
        };

        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/dispatch_comments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Prefer': 'return=minimal',
                },
                body: JSON.stringify(row),
            });

            if (response.ok) {
                return res.status(200).json({ ok: true });
            }

            const err = await response.text();
            console.error('Supabase comment insert error:', response.status, err);
            return res.status(502).json({ error: 'Failed to post comment' });
        } catch (err) {
            console.error('Comment post error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
