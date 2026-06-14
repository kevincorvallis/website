const { test, expect } = require('@playwright/test');

test.describe('API routes', () => {
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
