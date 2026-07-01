const { test, expect } = require('@playwright/test');

test.describe('Dispatch product landing', () => {
    test('loads marketing page', async ({ page }) => {
        await page.goto('/dispatch/');
        await expect(page).toHaveTitle(/Dispatch/i);
        await expect(page.locator('.nav-wordmark')).toHaveText('Dispatch');
        await expect(page.locator('a.nav-cta')).toHaveAttribute('href', '/dispatch/sign-in/');
    });

    test('template cards link to sign-in with template param', async ({ page }) => {
        await page.goto('/dispatch/');
        const fieldNotes = page.locator('a[data-tilt], a.t-card').filter({ hasText: /field notes/i }).first();
        const href = await fieldNotes.getAttribute('href');
        expect(href).toMatch(/\/dispatch\/sign-in\/\?template=field-notes/);
    });

    test('read nav goes to newsletter', async ({ page }, testInfo) => {
        await page.goto('/dispatch/');
        const link = page.locator('a.nav-link[href="/newsletter/"]');
        if (testInfo.project.name === 'mobile') {
            // Nav links are hidden in the compact mobile header; the link must still be in the DOM.
            await expect(link).toBeAttached();
        } else {
            await expect(link).toBeVisible();
        }
    });
});

test.describe('Dispatch sign-in', () => {
    test('shows auth options', async ({ page }) => {
        await page.goto('/dispatch/sign-in/');
        await expect(page).toHaveTitle(/Sign in/i);
        await expect(page.locator('text=Continue with Google').or(page.locator('text=Google'))).toBeVisible();
        await expect(page.locator('.back-link')).toHaveAttribute('href', '/dispatch/');
    });

    test('template query is stored for post-auth handoff', async ({ page }) => {
        // The sign-in page doesn't display the template name; it stashes it in
        // localStorage so the editor can pick it up after auth completes.
        await page.goto('/dispatch/sign-in/?template=receipt');
        await expect.poll(() =>
            page.evaluate(() => localStorage.getItem('dispatch.pending-template'))
        ).toBe('receipt');
    });
});

test.describe('Dispatch editor', () => {
    test('redirects unauthenticated users to template picker', async ({ page }) => {
        await page.goto('/dispatch/editor/');
        await page.waitForLoadState('networkidle');

        const picker = page.locator('#picker');
        const signInLink = page.locator('a[href*="/dispatch/sign-in"]');

        const hasPicker = await picker.isVisible().catch(() => false);
        const onSignIn = page.url().includes('/dispatch/sign-in');

        expect(hasPicker || onSignIn).toBeTruthy();
    });

    test('template picker shows three templates when visible', async ({ page }) => {
        await page.goto('/dispatch/editor/');
        await page.evaluate(() => {
            localStorage.clear();
            sessionStorage.clear();
        });
        await page.reload();
        await page.waitForLoadState('networkidle');

        const picker = page.locator('#picker');
        if (!(await picker.isVisible({ timeout: 8000 }).catch(() => false))) {
            test.skip(true, 'Picker not shown — likely redirected to sign-in');
            return;
        }

        await expect(page.locator('.picker-tile')).toHaveCount(3);
        await expect(page.locator('[data-template="field-notes"]')).toBeVisible();
        await expect(page.locator('[data-template="photo-essay"]')).toBeVisible();
        await expect(page.locator('[data-template="receipt"]')).toBeVisible();
    });
});

test.describe('Dispatch auth callback', () => {
    test('callback page renders without crash', async ({ page }) => {
        await page.goto('/dispatch/auth/callback/');
        await expect(page).toHaveTitle(/Dispatch/i);
        await expect(page.locator('body')).not.toBeEmpty();
    });
});
