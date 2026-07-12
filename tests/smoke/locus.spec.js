const { test, expect } = require('@playwright/test');

test.describe('Locus page', () => {
    test('loads with hero and search form', async ({ page }) => {
        await page.goto('/projects/locus/');
        await expect(page).toHaveTitle(/Locus/i);
        await expect(page.locator('.hero-title')).toHaveText('Locus');
        await expect(page.locator('#searchInput')).toBeVisible();
    });

    test('projects listing links to Locus', async ({ page }) => {
        await page.goto('/projects/');
        const link = page.locator('a[href="/projects/locus"]').first();
        await expect(link).toBeAttached();
        await link.click();
        await expect(page).toHaveURL(/\/projects\/locus/);
    });

    test('renders result cards from a mocked API response', async ({ page }) => {
        await page.route('**/api/locus-search', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    results: [
                        { name: 'Victrola Coffee', address: '310 E Pike St, Seattle, WA', rating: 4.5, userRatingCount: 1200, priceLevel: 'PRICE_LEVEL_MODERATE', mapsUri: 'https://maps.google.com/?cid=123', whyItFits: 'Quiet corner tables, good wifi.' },
                    ],
                }),
            });
        });
        await page.goto('/projects/locus/');
        await page.fill('#searchInput', 'quiet coffee shop capitol hill');
        await page.click('#searchBtn');
        await expect(page.locator('.result-name')).toHaveText('Victrola Coffee');
        await expect(page.locator('.result-why')).toHaveText('Quiet corner tables, good wifi.');
        await expect(page.locator('.result-map-link')).toHaveAttribute('href', 'https://maps.google.com/?cid=123');
    });

    test('shows the empty-state message when the API returns no results', async ({ page }) => {
        await page.route('**/api/locus-search', (route) => route.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }),
        }));
        await page.goto('/projects/locus/');
        await page.fill('#searchInput', 'something extremely obscure');
        await page.click('#searchBtn');
        await expect(page.locator('#statusMessage')).toContainText('Nothing matched');
    });

    test('shows the error-state message when the API fails', async ({ page }) => {
        await page.route('**/api/locus-search', (route) => route.fulfill({ status: 502 }));
        await page.goto('/projects/locus/');
        await page.fill('#searchInput', 'ramen fremont');
        await page.click('#searchBtn');
        await expect(page.locator('#statusMessage')).toContainText('Something broke on my end');
    });

    test('escapes untrusted text in result cards (XSS check)', async ({ page }) => {
        await page.route('**/api/locus-search', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    results: [{ name: '<img src=x onerror=alert(1)>', address: '', rating: null, userRatingCount: null, priceLevel: null, mapsUri: null, whyItFits: '<script>alert(2)</script>' }],
                }),
            });
        });
        await page.goto('/projects/locus/');
        await page.fill('#searchInput', 'test');
        await page.click('#searchBtn');
        await expect(page.locator('.result-name')).toHaveText('<img src=x onerror=alert(1)>');
        const nameHtml = await page.locator('.result-name').innerHTML();
        expect(nameHtml).not.toContain('<img');
    });
});
