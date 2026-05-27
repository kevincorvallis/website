// POST /api/upload
// Headers: Authorization: Bearer <supabase-access-token>
// Body: { folder?: string }
// Returns Cloudinary signed-upload params so the browser can POST directly
// to res.cloudinary.com without ever seeing the API secret.

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLOUD_NAME   = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY      = process.env.CLOUDINARY_API_KEY;
const API_SECRET   = process.env.CLOUDINARY_API_SECRET;

const ALLOWED_ORIGINS = ['https://klee.page', 'https://www.klee.page'];

const rateMap = new Map();
const RATE_LIMIT = 30;
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

async function verifyUser(token) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    return r.json();
}
async function getProfile(userId) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=handle`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows && rows[0] ? rows[0] : null;
}

function signParams(params, secret) {
    const sorted = Object.keys(params)
        .sort()
        .map(k => `${k}=${params[k]}`)
        .join('&');
    return crypto.createHash('sha1').update(sorted + secret).digest('hex');
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
    if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
        return res.status(500).json({ error: 'Image uploads are not configured yet.' });
    }

    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    if (isRateLimited(ip)) return res.status(429).json({ error: 'Too many requests' });

    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Sign in first.' });
    const user = await verifyUser(token);
    if (!user || !user.id) return res.status(401).json({ error: 'Invalid session.' });
    const profile = await getProfile(user.id);
    if (!profile || !profile.handle) return res.status(403).json({ error: 'Claim a handle first.' });

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `dispatch/${profile.handle}`;
    const params = { folder, timestamp };
    const signature = signParams(params, API_SECRET);

    return res.status(200).json({
        ok: true,
        cloud_name: CLOUD_NAME,
        api_key: API_KEY,
        timestamp,
        folder,
        signature,
        upload_url: `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
    });
};
