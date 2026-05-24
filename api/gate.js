const ALLOWED_ORIGINS = ['https://klee.page', 'https://www.klee.page'];

module.exports = async function handler(req, res) {
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

    const pass = process.env.DISPATCH_PASS;
    if (!pass) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const { password } = req.body || {};

    if (!password || typeof password !== 'string') {
        return res.status(400).json({ ok: false });
    }

    if (password.trim().toLowerCase() === pass.toLowerCase()) {
        return res.status(200).json({ ok: true });
    }

    return res.status(401).json({ ok: false });
};
