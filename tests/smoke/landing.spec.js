const { test, expect } = require('@playwright/test');

test.describe('Landing — /dispatch/', () => {
    test('hero renders with kinetic headline + CTAs', async ({ page }) => {
        await page.goto('/dispatch/');
        await expect(page.locator('.hero-headline')).toBeVisible();
        await expect(page.locator('.hero-headline')).toContainText('Write');
        await expect(page.locator('.hero-headline em')).toContainText('keeping.');
        await page.waitForTimeout(2000);
        const inWords = await page.locator('.hero-headline .word.in').count();
        expect(inWords).toBeGreaterThanOrEqual(3);
        await expect(page.locator('a.cta-primary')).toContainText('Start writing');
        await expect(page.locator('a.cta-text')).toContainText('See the editor');
    });

    test('polaroids visible on desktop, hidden on mobile', async ({ page, isMobile }) => {
        await page.goto('/dispatch/');
        const poly = page.locator('.poly').first();
        if (isMobile) await expect(poly).toBeHidden();
        else await expect(poly).toBeVisible();
    });

    test('drifting letters present on desktop', async ({ page, isMobile }) => {
        if (isMobile) return;
        await page.goto('/dispatch/');
        const n = await page.locator('.drift').count();
        expect(n).toBeGreaterThanOrEqual(10);
    });

    test('theme toggle flips data-theme', async ({ page }) => {
        await page.goto('/dispatch/');
        const before = await page.locator('html').getAttribute('data-theme');
        await page.locator('label[for="theme-toggle"]').first().click();
        await page.waitForTimeout(200);
        const after = await page.locator('html').getAttribute('data-theme');
        expect(after).not.toEqual(before);
    });

    test('signup form rejects invalid email', async ({ page }) => {
        await page.goto('/dispatch/#signup');
        await page.locator('#signupEmail').fill('not-an-email');
        await page.locator('#signupForm button[type="submit"]').click();
        await expect(page.locator('#signupStatus')).toContainText(/email/i);
    });

    test('no horizontal scroll on mobile', async ({ page, isMobile }) => {
        if (!isMobile) return;
        await page.goto('/dispatch/');
        const overflow = await page.evaluate(() =>
            document.documentElement.scrollWidth - window.innerWidth
        );
        expect(overflow).toBeLessThanOrEqual(0);
    });
});
