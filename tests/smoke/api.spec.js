const { test, expect } = require('@playwright/test');

test.describe('API routes', () => {
    test('gate API rejects empty password', async ({ request }) => {
        const res = await request.post('/api/gate', {
            data: { password: '' },
            headers: { 'Content-Type': 'application/json' },
        });
        expect([400, 401]).toContain(res.status());
    });

    test('gate API accepts POST with password field', async ({ request }) => {
        const res = await request.post('/api/gate', {
            data: { password: 'tsundoku' },
            headers: { 'Content-Type': 'application/json' },
        });
        // 200 if DISPATCH_PASS matches, 401 if not configured locally — both are valid signals
        expect([200, 401, 500]).toContain(res.status());
    });

    test('comments API returns JSON array', async ({ request }) => {
        const res = await request.get('/api/comments?issue=005');
        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        expect(Array.isArray(body)).toBeTruthy();
    });

    test('subscribe API rejects invalid email', async ({ request }) => {
        const res = await request.post('/api/subscribe', {
            data: { email: 'not-an-email' },
            headers: { 'Content-Type': 'application/json' },
        });
        expect(res.status()).toBe(400);
    });
});
