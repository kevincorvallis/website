const { test, expect } = require('@playwright/test');
const { unlockNewsletter, expectAssetOk } = require('./helpers');

const ISSUES = [
    {
        num: '006',
        path: '/newsletter/006/',
        password: 'yohaku',
        titleEn: 'Margin',
        cover: '/newsletter/006/images/camp-setup.jpg',
    },
    {
        num: '005',
        path: '/newsletter/005/',
        password: 'tsundoku',
        titleEn: 'Coquelicots',
        cover: '/newsletter/005/images/coquelicots.jpg',
    },
];

test.describe('Newsletter index', () => {
    test('loads and lists latest issue first', async ({ page }) => {
        await page.goto('/newsletter/');
        await expect(page).toHaveTitle(/Dispatch/i);
        await expect(page.locator('.page-title')).toHaveText('Dispatch');

        const firstLink = page.locator('.issue-list li').first().locator('a.issue-link');
        await expect(firstLink).toHaveAttribute('href', '/newsletter/006/');
        await expect(firstLink.locator('.issue-badge')).toBeVisible();
        await expect(firstLink.locator('.issue-title')).toContainText('Margin');
    });

    test('language toggle switches visible copy', async ({ page }) => {
        await page.goto('/newsletter/');
        await page.locator('#langPill').click();
        await expect(page.locator('html')).toHaveAttribute('data-lang', 'ko');
        await expect(page.locator('.page-subtitle [data-l="ko"]')).toBeVisible();
    });

    test('theme toggle updates data-theme', async ({ page }) => {
        await page.goto('/newsletter/');
        const toggle = page.locator('#theme-toggle');
        const before = await page.locator('html').getAttribute('data-theme');
        await toggle.click();
        const after = await page.locator('html').getAttribute('data-theme');
        expect(after).not.toBe(before);
    });
});

test.describe('Newsletter issues', () => {
    for (const issue of ISSUES) {
        test('issue ' + issue.num + ' unlocks and shows hero', async ({ page }) => {
            await unlockNewsletter(page, issue.path, issue.password);

            await expect(page.locator('.hero-title')).toContainText(issue.titleEn);
            await expect(page.locator('.issue-number')).toContainText('No. ' + issue.num);
            await expect(page.locator('.back-link')).toBeVisible();
        });

        test('issue ' + issue.num + ' cover image loads', async ({ request }) => {
            await expectAssetOk(request, issue.cover);
        });
    }

    test('issue 005 gate accepts kanji password', async ({ page }) => {
        await unlockNewsletter(page, '/newsletter/005/', '積ん読');
        await expect(page.locator('.hero-title')).toContainText('Coquelicots');
    });

    test('issue 006 pre-bypass hides gate with ?key=', async ({ page }) => {
        await page.goto('/newsletter/006/?key=yohaku');
        const gate = page.locator('#gate');
        await expect(gate).toBeHidden({ timeout: 5000 });
    });
});

test.describe('Newsletter assets', () => {
    const assets = [
        '/newsletter/005/images/coquelicots.jpg',
        '/newsletter/005/images/catkungfu.mp4',
        '/newsletter/006/images/camp-setup.jpg',
        '/newsletter/006/images/sunset.mp4',
    ];

    for (const asset of assets) {
        test('asset exists: ' + asset, async ({ request }) => {
            await expectAssetOk(request, asset);
        });
    }
});
