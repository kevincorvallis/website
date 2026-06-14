// Shared helpers for smoke tests.

/**
 * Open a newsletter issue with the welcome interstitial pre-dismissed.
 *
 * Seeds both possible "seen" keys (dispatch-seen / dispatch-auth) before navigation
 * so the page takes the return-visitor path: the intro is skipped and content renders
 * immediately. This avoids depending on the interstitial's animation timing.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} issuePath e.g. '/newsletter/005/'
 */
async function openIssue(page, issuePath) {
    const key = issuePath.replace(/\/$/, '') || '/';
    await page.addInitScript((k) => {
        try {
            sessionStorage.setItem('dispatch-seen-' + k, '1');
            sessionStorage.setItem('dispatch-auth-' + k, '1');
        } catch (e) {}
    }, key);
    await page.goto(issuePath);
    await page.waitForLoadState('domcontentloaded');
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

module.exports = { openIssue, expectAssetOk };
