const { test, expect } = require('@playwright/test');

test.describe('Editor — /dispatch/editor/', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/dispatch/editor/');
        await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    });

    test('template picker shows on fresh state', async ({ page }) => {
        await page.goto('/dispatch/editor/');
        await expect(page.locator('#picker.show')).toBeVisible();
        await expect(page.locator('[data-template="field-notes"]')).toBeVisible();
        await expect(page.locator('[data-template="photo-essay"]')).toBeVisible();
        await expect(page.locator('[data-template="receipt"]')).toBeVisible();
    });

    test('Field Notes loads 6 blocks with no placeholder bleed-through', async ({ page }) => {
        await page.goto('/dispatch/editor/');
        await page.locator('[data-template="field-notes"]').click();
        await page.waitForTimeout(500);
        const count = await page.locator('[data-block-id]').count();
        expect(count).toBe(6);

        const title = await page.locator('.b-cover-title').first().textContent();
        expect(title && title.trim()).toBe('Margin');

        // Placeholder ::before must NOT paint on a filled field
        const beforeContent = await page.locator('.b-cover-title').first().evaluate(el =>
            getComputedStyle(el, '::before').content
        );
        expect(beforeContent).toBe('none');
    });

    test('rail button appends a block', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name === 'mobile', 'rail is desktop-only chrome (display:none ≤820px)');
        await page.goto('/dispatch/editor/?template=blank');
        await page.waitForTimeout(400);
        const before = await page.locator('[data-block-id]').count();
        await page.locator('[data-add="chapter"]').click();
        const after = await page.locator('[data-block-id]').count();
        expect(after).toBe(before + 1);
    });

    test('top-of-canvas + button prepends (regression: was appending)', async ({ page }) => {
        await page.goto('/dispatch/editor/?template=blank');
        await page.waitForTimeout(400);
        const firstRail = page.locator('.insert-rail').first();
        await firstRail.evaluate(r => r.classList.add('active'));
        await firstRail.locator('[data-insert="chapter"]').click();
        await page.waitForTimeout(300);
        const firstType = await page.locator('[data-block-id]').first().evaluate(el => {
            const inner = el.querySelector('.b-chapter, .b-cover, .b-prose, .b-photo');
            return inner ? inner.className.split(' ')[0] : null;
        });
        expect(firstType).toBe('b-chapter');
    });

    test('preview mode hides editing chrome', async ({ page }) => {
        await page.goto('/dispatch/editor/?template=field-notes');
        await page.waitForTimeout(400);
        await page.locator('#previewBtn').click();
        await expect(page.locator('body')).toHaveClass(/preview/);
        await expect(page.locator('.rail')).toBeHidden();
        await expect(page.locator('.panel')).toBeHidden();
    });

    test('autosave persists title to localStorage', async ({ page }) => {
        await page.goto('/dispatch/editor/?template=blank');
        await page.waitForTimeout(400);
        await page.locator('.b-cover-title').first().click();
        await page.keyboard.type('My First Dispatch');
        await page.waitForTimeout(900);
        const saved = await page.evaluate(() => {
            const keys = Object.keys(localStorage).filter(k => k.startsWith('dispatch.draft.'));
            return keys.length ? JSON.parse(localStorage.getItem(keys[keys.length - 1])) : null;
        });
        expect(saved).toBeTruthy();
        expect(saved.blocks[0].data.title).toContain('My First Dispatch');
    });
});
