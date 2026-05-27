// Shared helpers for smoke tests.

/**
 * Unlock a gated newsletter issue via ?key= and dismiss the komorebi interstitial.
 * @param {import('@playwright/test').Page} page
 * @param {string} issuePath e.g. '/newsletter/005/'
 * @param {string} password
 */
async function unlockNewsletter(page, issuePath, password) {
    await page.goto(issuePath + '?key=' + encodeURIComponent(password));
    await page.waitForLoadState('networkidle');

    const gate = page.locator('#gate');
    await gate.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});

    const dismiss = page.locator('#komorebiDismiss');
    if (await dismiss.isVisible({ timeout: 3000 }).catch(() => false)) {
        await dismiss.click();
        await page.locator('#komorebi').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    }

    await page.waitForTimeout(500);
}

/**
 * HEAD-check that a static asset returns 200.
 */
async function expectAssetOk(request, path) {
    const res = await request.get(path);
    if (!res.ok()) {
        throw new Error('Asset ' + path + ' returned ' + res.status());
    }
}

module.exports = { unlockNewsletter, expectAssetOk };
