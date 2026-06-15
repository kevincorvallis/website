// E2E: real integration test of the DEPLOYED author dashboard.
// Seeds real articles as the test user, drives the live dashboard against the real
// backend (list + edit-link + delete), and ALWAYS cleans up the seeded articles.
//
// Requires (same as publish-harness): DISPATCH_TEST_EMAIL, DISPATCH_TEST_PASSWORD.
// Optional DISPATCH_BASE_URL (default https://klee.page).
// The dashboard page must already be DEPLOYED at BASE/dispatch/dashboard/.

const fs = require('fs');
const path = require('path');
const { chromium, request } = require('@playwright/test');

const cfg = fs.readFileSync(path.join(__dirname, '..', '..', 'dispatch', 'js', 'dispatch-config.js'), 'utf8');
const SUPABASE_URL = (cfg.match(/DISPATCH_SUPABASE_URL\s*=\s*'([^']+)'/) || [])[1];
const ANON = (cfg.match(/DISPATCH_SUPABASE_ANON_KEY\s*=\s*'([^']+)'/) || [])[1];
const REF = (SUPABASE_URL.match(/https:\/\/([^.]+)\./) || [])[1];
const STORAGE_KEY = `sb-${REF}-auth-token`;
const BASE = (process.env.DISPATCH_BASE_URL || 'https://klee.page').replace(/\/$/, '');
const EMAIL = process.env.DISPATCH_TEST_EMAIL;
const PASSWORD = process.env.DISPATCH_TEST_PASSWORD;

function log(o) { console.log(JSON.stringify(o, null, 2)); }

(async () => {
    if (!EMAIL || !PASSWORD) { log({ result: 'SKIP', why: 'set DISPATCH_TEST_EMAIL + DISPATCH_TEST_PASSWORD' }); process.exit(0); }

    const stamp = Date.now();
    const draftTitle = `E2E dash draft ${stamp}`;
    const sentTitle = `E2E dash sent ${stamp}`;
    const steps = [];
    const created = [];           // article ids to clean up
    let bearer = null, page = null;

    const rc = await request.newContext();
    const browser = await chromium.launch();

    function apiPost(p, body) { return rc.post(`${BASE}${p}`, { headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, data: body }); }

    try {
        // 1) session
        const tok = await rc.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { headers: { apikey: ANON, 'Content-Type': 'application/json' }, data: { email: EMAIL, password: PASSWORD } });
        if (!tok.ok()) throw new Error(`password grant ${tok.status()}`);
        const session = await tok.json();
        bearer = session.access_token;
        if (!session.expires_at) session.expires_at = Math.floor(Date.now() / 1000) + (session.expires_in || 3600);
        steps.push('minted session');

        // 2) pre-check the dashboard is deployed
        const pre = await rc.get(`${BASE}/dispatch/dashboard/?cb=${Date.now()}`);
        const preHtml = await pre.text();
        if (pre.status() !== 200 || !preHtml.includes('id="desk"')) {
            throw new Error('dashboard not deployed at ' + BASE + '/dispatch/dashboard/ (deploy first)');
        }
        steps.push('dashboard page is deployed');

        // 3) seed real data: one draft + one published
        const body = (t) => ({ title: t, body_json: [
            { id: 'c', type: 'cover', data: { title: t, subtitle: 'dashboard E2E — safe to delete' } },
            { id: 'p', type: 'prose', data: { html: '<p>Dashboard integration check.</p>' } },
        ] });
        const dr = await apiPost('/api/articles', body(draftTitle));
        if (!dr.ok()) throw new Error('create draft ' + dr.status());
        const draftId = (await dr.json()).article.id; created.push(draftId);
        const sr = await apiPost('/api/articles', body(sentTitle));
        if (!sr.ok()) throw new Error('create sent ' + sr.status());
        const sentArt = (await sr.json()).article; created.push(sentArt.id);
        const pub = await rc.put(`${BASE}/api/articles?id=${sentArt.id}`, { headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, data: { status: 'published' } });
        if (!pub.ok()) throw new Error('publish ' + pub.status());
        const sentSlug = (await pub.json()).article.slug;
        steps.push(`seeded draft#${draftId} + published#${sentArt.id} (slug ${sentSlug})`);

        // 4) load the deployed dashboard signed-in and verify it lists both
        page = await browser.newPage();
        const errs = []; page.on('pageerror', e => errs.push(e.message));
        await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) {} }, [STORAGE_KEY, JSON.stringify(session)]);
        await page.goto(`${BASE}/dispatch/dashboard/`, { waitUntil: 'load' });
        await page.waitForFunction(() => !document.getElementById('desk').classList.contains('hidden'), null, { timeout: 20000 });

        const view = await page.evaluate(({ d, s }) => {
            function row(list, title) {
                return Array.from(document.querySelectorAll('#' + list + ' .row'))
                    .find(r => r.querySelector('.row-title').textContent === title);
            }
            var dr = row('draftsList', d), sr = row('sentList', s);
            return {
                draftPresent: !!dr,
                sentPresent: !!sr,
                draftEditHref: dr && dr.querySelector('a.act') && dr.querySelector('a.act').getAttribute('href'),
                sentViewHref: sr && sr.querySelector('a.act') && sr.querySelector('a.act').getAttribute('href'),
            };
        }, { d: draftTitle, s: sentTitle });
        steps.push(`dashboard shows draft=${view.draftPresent} sent=${view.sentPresent}`);
        if (!view.draftPresent || !view.sentPresent) throw new Error('dashboard did not list seeded articles: ' + JSON.stringify(view));
        if (view.draftEditHref !== `/dispatch/editor/?cloud=${draftId}`) throw new Error('wrong edit href: ' + view.draftEditHref);
        const expectedView = `/@e2ebot/${encodeURIComponent(sentSlug)}`;
        if (view.sentViewHref !== expectedView) steps.push(`note: sent view href=${view.sentViewHref} (expected ${expectedView})`);

        // 5) delete the draft through the UI and confirm it's really gone
        await page.evaluate((t) => {
            var r = Array.from(document.querySelectorAll('#draftsList .row')).find(x => x.querySelector('.row-title').textContent === t);
            r.querySelector('.act.danger').click();   // arm
        }, draftTitle);
        await page.waitForTimeout(200);
        await page.evaluate((t) => {
            var r = Array.from(document.querySelectorAll('#draftsList .row')).find(x => x.querySelector('.row-title').textContent === t);
            if (r) r.querySelector('.act.danger').click(); // confirm
        }, draftTitle);
        await page.waitForTimeout(1500);
        const goneInUI = await page.evaluate((t) => !Array.from(document.querySelectorAll('#draftsList .row')).some(x => x.querySelector('.row-title').textContent === t), draftTitle);
        const check = await rc.get(`${BASE}/api/articles?id=${draftId}`, { headers: { Authorization: `Bearer ${bearer}` } });
        const goneInDb = check.status() === 404 || check.status() === 400;
        steps.push(`delete: goneInUI=${goneInUI} dbStatus=${check.status()}`);
        if (goneInUI && goneInDb) { created.splice(created.indexOf(draftId), 1); } // already deleted
        if (!goneInUI || !goneInDb) throw new Error(`delete not confirmed (ui=${goneInUI}, db=${check.status()})`);

        log({ result: 'PASS', base: BASE, steps, pageErrors: errs });
    } catch (e) {
        log({ result: 'FAIL', error: e.message, steps });
        process.exitCode = 1;
    } finally {
        for (const id of created) {
            try { const d = await rc.delete(`${BASE}/api/articles?id=${id}`, { headers: { Authorization: `Bearer ${bearer}` } }); console.log(`cleanup DELETE ${id} -> ${d.status()}`); }
            catch (e) { console.log(`cleanup failed ${id}: ${e.message}`); }
        }
        await browser.close();
        await rc.dispose();
    }
})();
