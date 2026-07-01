const { test, expect } = require('@playwright/test');
const { openIssue, expectAssetOk } = require('./helpers');

// Published issues under test. Issue headers vary by design: 005 uses the
// classic hero (.issue-number "No. 005"), 006 uses a hero-label kicker
// ("Dispatch 006 · …"). numSel/numText capture each issue's own pattern.
// 007 uses the newer masthead cold-open (no hero/interstitial) and is
// covered by the index "latest" test below.
const ISSUES = [
    { num: '006', path: '/newsletter/006/', titleEn: 'Us',     numSel: '.hero-label',   numText: 'Dispatch 006', cover: '/newsletter/006/images/korea-relay-poster.jpg' },
    { num: '005', path: '/newsletter/005/', titleEn: 'Margin', numSel: '.issue-number', numText: 'No. 005',      cover: '/newsletter/005/images/camp-setup.jpg' },
];

test.describe('Newsletter index', () => {
    test('loads and surfaces the latest published issue', async ({ page }) => {
        await page.goto('/newsletter/');
        await expect(page).toHaveTitle(/Dispatch/i);
        await expect(page.locator('.page-title')).toHaveText('Dispatch');

        // Latest published issue is 007 ("Leave"), tagged "Latest" on the almanac.
        const latest = page.locator('a.entry[href="/newsletter/007/"]');
        await expect(latest).toBeVisible();
        await expect(latest.locator('.entry-tag [data-l="en"]')).toHaveText('Latest');
        // Match the EN span exactly so a title like "Leaves" couldn't satisfy "Leave".
        await expect(latest.locator('.entry-title [data-l="en"]')).toHaveText('Leave');
    });

    test('language toggle switches visible copy', async ({ page }) => {
        await page.goto('/newsletter/');
        await page.locator('#langPill').click();
        await expect(page.locator('html')).toHaveAttribute('data-lang', 'ko');
        await expect(page.locator('.page-subtitle [data-l="ko"]')).toBeVisible();
    });

    test('theme toggle updates data-theme', async ({ page }) => {
        await page.goto('/newsletter/');
        // data-theme is set pre-paint; make sure it's resolved before we capture it.
        await expect(page.locator('html')).toHaveAttribute('data-theme', /^(light|dark)$/);
        const before = await page.locator('html').getAttribute('data-theme');
        // #theme-toggle is a visually-hidden checkbox; click its label (the real control).
        await page.locator('label[for="theme-toggle"]').click();
        await expect(page.locator('html')).not.toHaveAttribute('data-theme', before);
    });
});

test.describe('Newsletter issues', () => {
    for (const issue of ISSUES) {
        test('issue ' + issue.num + ' reveals content after the intro', async ({ page }) => {
            await openIssue(page, issue.path);
            await expect(page.locator('.hero-title')).toBeVisible();
            // Match the EN span exactly to avoid loose substring matches (e.g. "Us").
            await expect(page.locator('.hero-title [data-l="en"]')).toHaveText(issue.titleEn);
            await expect(page.locator(issue.numSel)).toContainText(issue.numText);
            await expect(page.locator('.back-link')).toBeVisible();
        });

        test('issue ' + issue.num + ' cover image loads', async ({ request }) => {
            await expectAssetOk(request, issue.cover);
        });
    }

    test('intro covers content on first visit, and is skipped on return', async ({ page }) => {
        // First visit: the welcome interstitial must cover from first paint (no "leak"
        // of the article showing through before the JS-driven intro mounts).
        await page.goto('/newsletter/006/');
        await expect(page.locator('#komorebi')).toBeVisible();
        await expect(page.locator('html')).not.toHaveAttribute('data-seen', '1');

        // Return visit: with the seen flag set, the intro is suppressed up front.
        await page.evaluate(() => sessionStorage.setItem('dispatch-auth-/newsletter/006', '1'));
        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('data-seen', '1');
        await expect(page.locator('#komorebi')).toBeHidden();
    });
});

test.describe('Newsletter assets', () => {
    const assets = [
        '/newsletter/005/images/camp-setup.jpg',
        '/newsletter/005/images/sunset.mp4',
        '/newsletter/006/images/korea-relay-poster.jpg',
        '/newsletter/006/images/korea-hero.mp4',
    ];

    for (const asset of assets) {
        test('asset exists: ' + asset, async ({ request }) => {
            await expectAssetOk(request, asset);
        });
    }
});
