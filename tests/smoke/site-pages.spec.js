const { test, expect } = require('@playwright/test');

// title/heading verified directly against each page's <title> and <h1> at
// the time this test was written (2026-07-12) — re-verify if either
// changes. hasThemeToggle is false only for /brock/ (dark-only palette,
// no #theme-toggle checkbox at all — confirmed via grep, not assumed).
// /projects/ai-workflow/ intentionally excluded: linked from the committed
// projects/index.html but the page itself was never committed (404 in
// production as of 2026-07-12) — not this repo's job to test an undeployed page.
const PAGES = [
    { path: '/', title: 'Kevin Lee', hasThemeToggle: true },
    { path: '/resume/', title: 'Resume — Kevin Lee', hasThemeToggle: true },
    { path: '/ai/', title: 'Ask Kevin — Kevin Lee', hasThemeToggle: true },
    { path: '/photos/', title: 'Photos — Kevin Lee', hasThemeToggle: true },
    { path: '/exposure/', title: 'The Exposure Triangle — Kevin Lee', hasThemeToggle: true },
    { path: '/film/', title: 'Film — Kevin Lee', hasThemeToggle: true },
    { path: '/now/', title: 'Now — Kevin Lee', hasThemeToggle: true },
    { path: '/privacy/', title: 'Privacy Policy — Kevin Lee', hasThemeToggle: true },
    { path: '/terms/', title: 'Terms of Service — Kevin Lee', hasThemeToggle: true },
    { path: '/workflow/', title: 'The Agent Graph — Kevin Lee', hasThemeToggle: true },
    { path: '/brock/', title: 'Brock — A Year in the Life | Kevin Lee', hasThemeToggle: false },
    { path: '/projects/merfish/', title: 'MERFISH — Kevin Lee', hasThemeToggle: true },
    { path: '/projects/shredders/', title: 'Shredders — Kevin Lee', hasThemeToggle: true },
    { path: '/projects/spacec/', title: 'SPACEc — Kevin Lee', hasThemeToggle: true },
];

test.describe('Site-wide static page smoke checks', () => {
    for (const p of PAGES) {
        test(`${p.path} loads cleanly with no console errors`, async ({ page }) => {
            const pageErrors = [];
            const consoleErrors = [];
            page.on('pageerror', (err) => pageErrors.push(err.message));
            page.on('console', (msg) => {
                if (msg.type() === 'error') consoleErrors.push(msg.text());
            });

            const response = await page.goto(p.path);
            expect(response.status()).toBeLessThan(400);
            await expect(page).toHaveTitle(p.title);
            await expect(page.locator('h1').first()).toBeVisible();

            if (p.hasThemeToggle) {
                await expect(page.locator('#theme-toggle')).toBeAttached();
            } else {
                await expect(page.locator('#theme-toggle')).toHaveCount(0);
            }

            expect(pageErrors, `uncaught page errors on ${p.path}`).toEqual([]);
            expect(consoleErrors, `console.error calls on ${p.path}`).toEqual([]);
        });
    }
});
