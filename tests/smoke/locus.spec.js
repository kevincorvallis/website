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

    test('renders the demo caption and results when source is demo', async ({ page }) => {
        await page.route('**/api/locus-search', (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    source: 'demo',
                    reason: 'key_missing',
                    results: [{
                        name: 'Espresso Vivace Roasteria',
                        address: '532 Broadway E, Seattle, WA 98102',
                        rating: 4.5,
                        userRatingCount: 1515,
                        priceLevel: 'PRICE_LEVEL_INEXPENSIVE',
                        mapsUri: 'https://www.google.com/maps/search/?api=1&query=Espresso+Vivace',
                        whyItFits: 'A quiet Capitol Hill fixture.',
                    }],
                }),
            });
        });
        await page.goto('/projects/locus/');
        await page.locator('#searchInput').fill('quiet coffee shop to work from near Capitol Hill');
        await page.locator('#searchBtn').click();
        await expect(page.locator('#sourceCaption')).toBeVisible();
        await expect(page.locator('#sourceCaption')).toContainText('Demo data');
        await expect(page.locator('.result-name')).toContainText('Espresso Vivace Roasteria');
    });

    test('renders the degraded caption when source is degraded', async ({ page }) => {
        await page.route('**/api/locus-search', (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    source: 'degraded',
                    reason: 'key_invalid',
                    results: [{
                        name: 'Ooink', address: '3630 Stone Way N, Seattle, WA 98103',
                        rating: 4.3, userRatingCount: 285, priceLevel: 'PRICE_LEVEL_MODERATE',
                        mapsUri: 'https://www.google.com/maps/search/?api=1&query=Ooink',
                        whyItFits: 'A mid-priced ramen counter.',
                    }],
                }),
            });
        });
        await page.goto('/projects/locus/');
        await page.locator('#searchInput').fill('date night ramen spot in Fremont');
        await page.locator('#searchBtn').click();
        await expect(page.locator('#sourceCaption')).toBeVisible();
        await expect(page.locator('#sourceCaption')).toContainText('Live search hit a snag');
    });

    test('hides the caption when source is live', async ({ page }) => {
        await page.route('**/api/locus-search', (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    source: 'live',
                    reason: null,
                    results: [{
                        name: 'Real Live Place', address: '123 Main St, Seattle, WA',
                        rating: 4.8, userRatingCount: 99, priceLevel: 'PRICE_LEVEL_MODERATE',
                        mapsUri: 'https://www.google.com/maps/search/?api=1&query=Real+Live+Place',
                        whyItFits: 'Genuinely live.',
                    }],
                }),
            });
        });
        await page.goto('/projects/locus/');
        await page.locator('#searchInput').fill('anything');
        await page.locator('#searchBtn').click();
        await expect(page.locator('.result-name')).toContainText('Real Live Place');
        await expect(page.locator('#sourceCaption')).toBeHidden();
    });

    test('clicking a demo chip populates the input and submits immediately', async ({ page }) => {
        await page.route('**/api/locus-search', (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    source: 'demo',
                    reason: 'key_missing',
                    results: [{
                        name: 'The Ballard Smoke Shop', address: '5439 Ballard Ave NW, Seattle, WA 98107',
                        rating: 4.4, userRatingCount: 452, priceLevel: 'PRICE_LEVEL_INEXPENSIVE',
                        mapsUri: 'https://www.google.com/maps/search/?api=1&query=Ballard+Smoke+Shop',
                        whyItFits: 'A family-run dive bar since 1971.',
                    }],
                }),
            });
        });
        await page.goto('/projects/locus/');
        await page.locator('.demo-chip', { hasText: 'Ballard' }).click();
        await expect(page.locator('#searchInput')).toHaveValue('a bar where you can actually hear people talk, in Ballard');
        await expect(page.locator('.result-name')).toContainText('The Ballard Smoke Shop');
    });

    test('no horizontal scroll on mobile', async ({ page, isMobile }) => {
        if (!isMobile) return;
        await page.goto('/projects/locus/');
        const overflow = await page.evaluate(() =>
            document.documentElement.scrollWidth - window.innerWidth
        );
        expect(overflow).toBeLessThanOrEqual(0);
    });
});
