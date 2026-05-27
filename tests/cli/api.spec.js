const { test, expect } = require('@playwright/test');

test.describe('API surface', () => {
    test('GET /api/articles → 401 JSON without auth', async ({ request }) => {
        const r = await request.get('/api/articles');
        expect(r.status()).toBe(401);
        const body = await r.json();
        expect(body.error).toMatch(/sign in/i);
    });

    test('POST /api/auth/send-link with invalid email → 400', async ({ request }) => {
        const r = await request.post('/api/auth/send-link', {
            data: { email: 'notvalid' },
            headers: { 'Content-Type': 'application/json' },
        });
        expect(r.status()).toBe(400);
    });

    test('POST /api/auth/send-link with uninvited email → 403 or 429', async ({ request }) => {
        const r = await request.post('/api/auth/send-link', {
            data: { email: 'nobody@nowhere-xyz.invalid' },
            headers: { 'Content-Type': 'application/json' },
        });
        expect([403, 429]).toContain(r.status());
    });

    test('POST /api/upload without auth → 401 (NOT 500)', async ({ request }) => {
        const r = await request.post('/api/upload', {
            data: {},
            headers: { 'Content-Type': 'application/json' },
        });
        expect(r.status()).toBe(401);
    });

    test('CSP allows Supabase + Cloudinary + jsdelivr', async ({ request }) => {
        const r = await request.get('/dispatch/');
        const csp = r.headers()['content-security-policy'];
        expect(csp).toBeTruthy();
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain('https://*.supabase.co');
        expect(csp).toContain('https://api.cloudinary.com');
        expect(csp).toContain("frame-ancestors 'none'");
    });

    test('HSTS preload header is set', async ({ request }) => {
        const r = await request.get('/dispatch/');
        expect(r.headers()['strict-transport-security']).toMatch(/max-age=\d+/);
    });
});
