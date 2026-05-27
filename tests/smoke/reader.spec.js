const { test, expect } = require('@playwright/test');

test.describe('Reader — /@username/', () => {
    test('valid handle renders profile (200)', async ({ page }) => {
        const r = await page.goto('/@kevinlee');
        expect(r && r.status()).toBe(200);
        await expect(page.locator('.profile-handle')).toContainText('@kevinlee');
    });

    test('uppercase handle 301-redirects to lowercase', async ({ request }) => {
        const r = await request.get('/@KEVINLEE', { maxRedirects: 0 });
        expect(r.status()).toBe(301);
        expect(r.headers().location).toBe('/@kevinlee');
    });

    test('nonexistent handle returns styled 404 with working back link', async ({ page }) => {
        const r = await page.goto('/@bogus-user-9999');
        expect(r && r.status()).toBe(404);
        await expect(page.locator('body')).toContainText(/couldn.t find this dispatch/i);
        const href = await page.locator('.back-link').first().getAttribute('href');
        expect(href).toBe('/dispatch/');
    });

    test('valid handle + bad slug returns styled 404', async ({ page }) => {
        const r = await page.goto('/@kevinlee/this-article-does-not-exist');
        expect(r && r.status()).toBe(404);
    });

    test('script-injection in handle is not reflected', async ({ request }) => {
        const r = await request.get('/@%3Cscript%3Ealert(1)%3C%2Fscript%3E');
        expect(r.status()).toBe(404);
        const body = await r.text();
        expect(body).not.toContain('<script>alert');
    });
});
