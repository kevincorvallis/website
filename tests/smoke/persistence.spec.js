const { test, expect } = require('@playwright/test');

test.describe('Theme and language persist across reload', () => {
    test('theme choice survives a reload on the homepage', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('html')).toHaveAttribute('data-theme', /^(light|dark)$/);
        const before = await page.locator('html').getAttribute('data-theme');

        await page.locator('label[for="theme-toggle"]').click();
        await expect(page.locator('html')).not.toHaveAttribute('data-theme', before);
        const after = await page.locator('html').getAttribute('data-theme');

        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('data-theme', after);
    });

    test('language choice survives a reload on the newsletter index', async ({ page }) => {
        await page.goto('/newsletter/');
        await page.locator('#langPill').click();
        await expect(page.locator('html')).toHaveAttribute('data-lang', 'ko');

        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('data-lang', 'ko');
    });
});
