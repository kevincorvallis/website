const { test, expect } = require('@playwright/test');

test.describe('Japan trip page', () => {
    test('loads with hero and title', async ({ page }) => {
        await page.goto('/japan-trip/');
        await expect(page).toHaveTitle(/Wakayama Hotfix/i);
        await expect(page.locator('.hero-title')).toHaveText('The Wakayama Hotfix');
    });

    test('nav link from homepage resolves', async ({ page }) => {
        await page.goto('/');
        const link = page.locator('a[href="/japan-trip"]');
        await expect(link).toBeAttached();
        await link.click();
        await expect(page).toHaveURL(/\/japan-trip/);
    });

    test('all 4 day cards and 5 highlight cards render', async ({ page }) => {
        await page.goto('/japan-trip/');
        await expect(page.locator('.day-card')).toHaveCount(4);
        await expect(page.locator('.card-eyebrow')).toHaveCount(5);
    });

    // This page's widget is hardcoded to issue=trip-japan-oct — the real, shared
    // comment thread friends will actually read. Playwright runs against production
    // by default (see Task 1's note), so a real POST here would permanently plant a
    // fake "Smoke Test ####" comment in that real thread. Route interception verifies
    // the frontend↔API contract without ever touching the live backend.
    test('comments widget renders comments returned by the API', async ({ page }) => {
        // Single handler for the whole /api/comments* path (GET with query string
        // included) — registering two overlapping page.route() patterns for the same
        // request is ordering-sensitive in Playwright; one handler avoids that entirely.
        await page.route('**/api/comments*', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([{ id: 1, name: 'A Friend', comment: 'Looks fun!', created_at: new Date().toISOString() }]),
            });
        });
        await page.goto('/japan-trip/');
        await expect(page.locator('.comment-name').filter({ hasText: 'A Friend' })).toBeVisible();
        await expect(page.locator('#commentsEmpty')).toBeHidden();
    });

    test('comments widget submits the right payload without hitting the real API', async ({ page }) => {
        let capturedBody = null;
        await page.route('**/api/comments*', async (route) => {
            if (route.request().method() === 'POST') {
                capturedBody = route.request().postDataJSON();
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
            } else {
                await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
            }
        });
        await page.goto('/japan-trip/');
        await page.fill('#commentName', 'Test Friend');
        await page.fill('#commentText', 'Automated smoke test — intercepted, never persisted.');
        await page.click('#commentBtn');
        await expect.poll(() => capturedBody).not.toBeNull();
        expect(capturedBody.issue).toBe('trip-japan-oct');
        expect(capturedBody.name).toBe('Test Friend');
        expect(typeof capturedBody.elapsed).toBe('number');
    });

    test('route map markers reveal on scroll', async ({ page }) => {
        await page.goto('/japan-trip/');
        // The hero (photo + stat block + countdown + full SVG map) pushes every day
        // card below the fold on load — even Day 1 is not visible without scrolling,
        // so both markers start pending; neither is revealed until scrolled to.
        const marker1 = page.locator('.route-stop[data-stop="1"]');
        await expect(marker1).toHaveClass(/pending/);
        const marker4 = page.locator('.route-stop[data-stop="4"]');
        await expect(marker4).toHaveClass(/pending/);
        await page.locator('.day-card[data-day="1"]').scrollIntoViewIfNeeded();
        await expect(marker1).not.toHaveClass(/pending/);
        await page.locator('.day-card[data-day="4"]').scrollIntoViewIfNeeded();
        await expect(marker4).not.toHaveClass(/pending/);
    });
});
