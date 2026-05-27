const { test, expect } = require('@playwright/test');

test.describe('Sign-in — /dispatch/sign-in/', () => {
    test('renders Google + Apple + email form', async ({ page }) => {
        await page.goto('/dispatch/sign-in/');
        await expect(page.locator('#googleBtn')).toContainText('Continue with Google');
        await expect(page.locator('#appleBtn')).toContainText('Continue with Apple');
        await expect(page.locator('#email')).toBeVisible();
        await expect(page.locator('button[type="submit"]')).toContainText('Send link');
    });

    test('rejects invalid email', async ({ page }) => {
        await page.goto('/dispatch/sign-in/');
        await page.locator('#email').fill('notvalid');
        await page.locator('button[type="submit"]').click();
        await expect(page.locator('#status')).toContainText(/email/i);
    });

    test('email auto-focuses', async ({ page }) => {
        await page.goto('/dispatch/sign-in/');
        const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
        expect(focused).toBe('email');
    });

    test('uninvited email gets 403 from API', async ({ page }) => {
        await page.goto('/dispatch/sign-in/');
        await page.locator('#email').fill('nobody@nowhere-xyz.invalid');
        await page.locator('button[type="submit"]').click();
        await page.waitForTimeout(1500);
        const status = await page.locator('#status').textContent();
        // Could be "isn't on the invite list" OR "too many tries" if rate-limited
        expect(status).toMatch(/invite|too many/i);
    });
});
