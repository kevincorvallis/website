// Visual regression. Today: Playwright's built-in toHaveScreenshot.
// To pipe to Percy:
//   const percySnapshot = require('@percy/playwright');
//   await percySnapshot(page, 'landing-hero');
// Then: percy exec -- npm run test:visual

const { test, expect } = require('@playwright/test');

async function freeze(page) {
    await page.addStyleTag({
        content: `*,*::before,*::after{
            animation-duration:0s!important; animation-delay:0s!important;
            transition-duration:0s!important; transition-delay:0s!important;
        }`,
    });
    await page.evaluate(async () => { await document.fonts.ready; });
}

test.describe('Visual regression', () => {
    test('landing hero', async ({ page }) => {
        await page.goto('/dispatch/');
        await freeze(page);
        await expect(page.locator('.hero')).toHaveScreenshot('landing-hero.png', { maxDiffPixelRatio: 0.02 });
    });

    test('landing manifesto', async ({ page }) => {
        await page.goto('/dispatch/#manifesto');
        await freeze(page);
        await page.waitForTimeout(800);
        await expect(page.locator('#manifesto')).toHaveScreenshot('landing-manifesto.png', { maxDiffPixelRatio: 0.02 });
    });

    test('sign-in', async ({ page }) => {
        await page.goto('/dispatch/sign-in/');
        await freeze(page);
        await expect(page).toHaveScreenshot('sign-in-full.png', { fullPage: true, maxDiffPixelRatio: 0.02 });
    });

    test('editor template picker', async ({ page }) => {
        await page.goto('/dispatch/editor/');
        await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
        await page.reload();
        await freeze(page);
        await page.waitForSelector('#picker.show');
        await expect(page.locator('#picker')).toHaveScreenshot('editor-picker.png', { maxDiffPixelRatio: 0.02 });
    });

    test('reader profile', async ({ page }) => {
        await page.goto('/@kevinlee');
        await freeze(page);
        await expect(page).toHaveScreenshot('reader-profile.png', { fullPage: true, maxDiffPixelRatio: 0.02 });
    });
});
