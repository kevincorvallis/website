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

    test('comments API silently accepts a legacy POST with no honeypot fields', async ({ request }) => {
        const res = await request.post('/api/comments', {
            data: { issue: 'zz-smoke-test', name: 'Smoke Test', comment: 'legacy client, no honeypot fields sent' },
            headers: { 'Content-Type': 'application/json' },
        });
        expect(res.status()).toBe(200);
    });

    test('comments API silently drops a submission with a filled honeypot', async ({ request }) => {
        const before = await (await request.get('/api/comments?issue=zz-smoke-test')).json();
        const res = await request.post('/api/comments', {
            data: { issue: 'zz-smoke-test', name: 'Bot', comment: 'spam via honeypot', website: 'http://spam.example', elapsed: 5000 },
            headers: { 'Content-Type': 'application/json' },
        });
        // Bot gate returns 200 (don't teach bots which check failed) but must not persist the row.
        expect(res.status()).toBe(200);
        const after = await (await request.get('/api/comments?issue=zz-smoke-test')).json();
        expect(after.length).toBe(before.length);
    });

    test('comments API silently drops a submission that arrives too fast', async ({ request }) => {
        const before = await (await request.get('/api/comments?issue=zz-smoke-test')).json();
        const res = await request.post('/api/comments', {
            data: { issue: 'zz-smoke-test', name: 'Bot', comment: 'spam via elapsed', elapsed: 400 },
            headers: { 'Content-Type': 'application/json' },
        });
        expect(res.status()).toBe(200);
        const after = await (await request.get('/api/comments?issue=zz-smoke-test')).json();
        expect(after.length).toBe(before.length);
    });
});
