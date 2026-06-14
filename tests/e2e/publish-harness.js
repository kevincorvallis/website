// E2E harness: drive a REAL authenticated publish on a live Supabase-backed deploy,
// verify the published article renders publicly, then ALWAYS delete the test article.
//
// How it authenticates WITHOUT interactive magic-link/OAuth:
//   - Mints a session via Supabase password grant using the PUBLIC anon key
//     (the same key shipped in dispatch/js/dispatch-config.js — no secret handled here).
//   - Injects the v2 session into the editor's localStorage before page scripts run,
//     so supabase-js boots already signed-in (the editor checks auth at load).
//
// Requirements (a password-capable account that already has a CLAIMED handle):
//   DISPATCH_TEST_EMAIL      test account email
//   DISPATCH_TEST_PASSWORD   test account password
// Optional:
//   DISPATCH_BASE_URL        default https://klee.page
//
// Run:
//   DISPATCH_TEST_EMAIL=… DISPATCH_TEST_PASSWORD=… node tests/e2e/publish-harness.js
//
// Safety: unique obviously-test title/slug, one publish, deleted in `finally` even on
// failure (incl. when publish itself fails — the draft id is still returned for cleanup).
// Credentials come from env only; nothing is written to disk.

const fs = require('fs');
const path = require('path');
const { chromium, request } = require('@playwright/test');

// --- Public config, read from the shipped client config (single source of truth) ---
const cfgPath = path.join(__dirname, '..', '..', 'dispatch', 'js', 'dispatch-config.js');
const cfg = fs.readFileSync(cfgPath, 'utf8');
const SUPABASE_URL = (cfg.match(/DISPATCH_SUPABASE_URL\s*=\s*'([^']+)'/) || [])[1];
const ANON = (cfg.match(/DISPATCH_SUPABASE_ANON_KEY\s*=\s*'([^']+)'/) || [])[1];
const REF = (SUPABASE_URL.match(/https:\/\/([^.]+)\./) || [])[1];
const STORAGE_KEY = `sb-${REF}-auth-token`;

const BASE = (process.env.DISPATCH_BASE_URL || 'https://klee.page').replace(/\/$/, '');
const EMAIL = process.env.DISPATCH_TEST_EMAIL;
const PASSWORD = process.env.DISPATCH_TEST_PASSWORD;

// Unique body text — only present if the article BODY actually renders (not just <title>).
const MARKER_BASE = 'Automated end-to-end publish verification';

function log(obj) { console.log(JSON.stringify(obj, null, 2)); }

(async () => {
    if (!SUPABASE_URL || !ANON || !REF) {
        log({ result: 'ERROR', error: 'Could not read Supabase URL/anon key from dispatch-config.js' });
        process.exit(1);
    }
    if (!EMAIL || !PASSWORD) {
        log({
            result: 'SKIP',
            why: 'Set DISPATCH_TEST_EMAIL and DISPATCH_TEST_PASSWORD to run.',
            need: 'A password-capable account that already has a claimed @handle on the platform.',
            storageKey: STORAGE_KEY,
            base: BASE,
        });
        process.exit(0);
    }

    const stamp = Date.now();
    const title = `E2E publish check ${stamp}`;
    const marker = `${MARKER_BASE} ${stamp}`;
    const steps = [];
    let page = null;
    let articleId = null, handle = null, slug = null, bearer = null;

    const rc = await request.newContext();
    const browser = await chromium.launch();

    try {
        // 1) Mint a session via password grant (public anon key — no secret).
        const tokRes = await rc.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            headers: { apikey: ANON, 'Content-Type': 'application/json' },
            data: { email: EMAIL, password: PASSWORD },
        });
        if (!tokRes.ok()) {
            throw new Error(`password grant failed: ${tokRes.status()} ${(await tokRes.text()).slice(0, 200)}`);
        }
        const session = await tokRes.json();
        bearer = session.access_token;
        if (!session.expires_at) {
            session.expires_at = Math.floor(Date.now() / 1000) + (session.expires_in || 3600);
        }
        steps.push(`minted session for user ${session.user && session.user.id}`);

        // 2) Inject the session before any page script runs.
        page = await browser.newPage();
        const pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(e.message));
        await page.addInitScript(([key, val]) => {
            try { localStorage.setItem(key, val); } catch (e) {}
        }, [STORAGE_KEY, JSON.stringify(session)]);

        await page.goto(`${BASE}/dispatch/editor/`, { waitUntil: 'load' });

        // 3) Let the editor's own boot recognize the session + load the profile.
        try {
            await page.waitForFunction(
                () => !!(window.Dispatch && typeof window.Dispatch.getProfile === 'function' && window.Dispatch.getProfile()),
                null,
                { timeout: 25000 }
            );
        } catch (e) {
            throw new Error('editor did not boot signed-in within 25s — session injection failed, or the account has no claimed @handle (editor bounced to claim/sign-in)');
        }
        const profile = await page.evaluate(() => {
            const p = window.Dispatch.getProfile();
            return { handle: p.handle || p.username, id: p.id };
        });
        handle = profile.handle;
        steps.push(`editor booted signed-in as @${handle}`);

        // 4) Create + publish via the SAME client API the Publish button calls.
        //    Publish is caught INSIDE the browser so draft.id always returns for cleanup.
        const pub = await page.evaluate(async ({ t, mk, cid, pid }) => {
            const draft = await window.Dispatch.createArticle({
                title: t,
                body_json: [
                    { id: cid, type: 'cover', data: { title: t, subtitle: 'automated E2E harness — safe to delete' } },
                    { id: pid, type: 'prose', data: { html: '<p>' + mk + '</p>' } },
                ],
            });
            try {
                const published = await window.Dispatch.publishArticle(draft.id, {});
                return { id: draft.id, slug: (published && published.slug) || draft.slug, status: published && published.status };
            } catch (e) {
                return { id: draft.id, slug: draft.slug, error: e.message };
            }
        }, { t: title, mk: marker, cid: `cover-${stamp}`, pid: `prose-${stamp}` });

        articleId = pub.id;            // set BEFORE any throw so finally can clean up
        slug = pub.slug;
        steps.push(`created id=${articleId} slug=${slug}` + (pub.error ? ` PUBLISH-ERR=${pub.error}` : ` status=${pub.status}`));
        if (pub.error) throw new Error(`publish failed: ${pub.error}`);
        if (pub.status !== 'published') throw new Error(`publish did not set status=published (got ${pub.status})`);

        // 5) INDEPENDENT verification with retry (eventual consistency / ISR / caching).
        //    Assert on the BODY marker, cache-busted, via a fresh request context.
        let rendered = false, lastStatus = 0;
        for (let i = 0; i < 6; i++) {
            const readRes = await rc.get(`${BASE}/@${handle}/${slug}?cb=${Date.now()}`);
            lastStatus = readRes.status();
            const html = await readRes.text();
            if (lastStatus === 200 && html.includes(marker)) { rendered = true; break; }
            await new Promise((r) => setTimeout(r, 1500));
        }
        steps.push(`reader verify -> status=${lastStatus} bodyRendered=${rendered}`);
        if (!rendered) throw new Error(`published article did not render publicly (last status ${lastStatus}, body marker missing)`);

        log({ result: 'PASS', handle, slug, articleId, readUrl: `${BASE}/@${handle}/${slug}`, steps, pageErrors });
    } catch (e) {
        log({ result: 'FAIL', error: e.message, steps });
        process.exitCode = 1;
    } finally {
        // 6) Guaranteed cleanup — delete the test article. Use the LIVE token from the
        //    browser (it may have auto-refreshed) and fall back to the minted one.
        let delToken = bearer;
        try {
            if (page && !page.isClosed()) {
                const cur = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY);
                if (cur) { const s = JSON.parse(cur); if (s && s.access_token) delToken = s.access_token; }
            }
        } catch (e) { /* keep minted token */ }

        if (articleId && delToken) {
            try {
                const del = await rc.delete(`${BASE}/api/articles?id=${articleId}`, {
                    headers: { Authorization: `Bearer ${delToken}` },
                });
                console.log(`cleanup: DELETE article ${articleId} -> ${del.status()}`);
                if (!del.ok()) console.log(`cleanup WARNING: delete returned ${del.status()} — verify @${handle} has no leftover test article`);
            } catch (e) {
                console.log(`cleanup FAILED for article ${articleId}: ${e.message} — delete it manually!`);
            }
        }
        await browser.close();
        await rc.dispose();
    }
})();
