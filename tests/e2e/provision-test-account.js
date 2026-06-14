// One-time: provision a dedicated @e2ebot test account for the publish harness.
//
// Needs the Supabase SERVICE-ROLE key (master DB credential). It is read from the
// environment only and never printed or written to disk by this script. Run it in
// YOUR shell so the secret stays on your machine:
//
//   vercel env pull /tmp/p.env --environment=production --yes
//   set -a && . /tmp/p.env && set +a        # loads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//   node tests/e2e/provision-test-account.js
//   rm -f /tmp/p.env
//
// It creates (idempotently): a confirmed auth user + a `profiles` row with handle
// `e2ebot`, then prints the exact `npm run test:e2e` command to run next.
//
// Optional env overrides: E2E_EMAIL, E2E_PASSWORD, E2E_HANDLE.

// Optionally load SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from a dotenv file
// (e.g. the one `vercel env pull` writes) so no fragile shell `set -a` sourcing is
// needed. Only fills vars that aren't already set; never logs values.
if (process.env.DOTENV) {
    try {
        const txt = require('fs').readFileSync(process.env.DOTENV, 'utf8');
        for (const line of txt.split('\n')) {
            const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
            if (!m) continue;
            let v = m[2].trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
                v = v.slice(1, -1);
            }
            // Vercel CLI writes a trailing escaped newline on values; strip escapes/ws.
            v = v.replace(/\\r/g, '').replace(/\\n/g, '').replace(/[\r\n]+$/, '').trim();
            if (process.env[m[1]] === undefined) process.env[m[1]] = v;
        }
    } catch (e) { /* ignore — fall back to real env */ }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;

const EMAIL = process.env.E2E_EMAIL || 'e2ebot@klee.page';
const HANDLE = process.env.E2E_HANDLE || 'e2ebot';
// Strong random password unless one is supplied; printed once at the end.
const PASSWORD = process.env.E2E_PASSWORD ||
    ('E2e!' + require('crypto').randomBytes(12).toString('base64url'));

function sr(method, path, body) {
    return fetch(`${SUPABASE_URL}/${path}`, {
        method,
        headers: {
            apikey: SR,
            Authorization: `Bearer ${SR}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
}

(async () => {
    if (!SUPABASE_URL || !SR) {
        console.error('ERROR: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment first.');
        process.exit(1);
    }
    if (!/^[a-z0-9_]{3,20}$/.test(HANDLE)) {
        console.error(`ERROR: handle "${HANDLE}" must match ^[a-z0-9_]{3,20}$ (no hyphens).`);
        process.exit(1);
    }

    // 1) Create (or find) the confirmed auth user.
    let userId = null;
    const create = await sr('POST', 'auth/v1/admin/users', { email: EMAIL, password: PASSWORD, email_confirm: true });
    if (create.ok) {
        userId = (await create.json()).id;
        console.log(`created auth user ${EMAIL}`);
    } else {
        const txt = await create.text();
        // Already exists → look it up and (re)set the password so we know it.
        const list = await sr('GET', `auth/v1/admin/users?email=${encodeURIComponent(EMAIL)}`);
        const found = list.ok ? (await list.json()).users?.find(u => (u.email || '').toLowerCase() === EMAIL.toLowerCase()) : null;
        if (!found) { console.error(`ERROR creating user: ${create.status} ${txt.slice(0, 200)}`); process.exit(1); }
        userId = found.id;
        await sr('PUT', `auth/v1/admin/users/${userId}`, { password: PASSWORD, email_confirm: true });
        console.log(`reused existing auth user ${EMAIL} (password reset)`);
    }

    // 2) Ensure a profiles row WITH a handle. Note: a DB trigger may auto-create a
    //    handle-less profile row on user signup — in that case set the handle.
    const existing = await sr('GET', `rest/v1/profiles?id=eq.${userId}&select=id,handle`);
    const rows = existing.ok ? await existing.json() : [];
    if (rows.length && rows[0].handle) {
        console.log(`profile already exists: @${rows[0].handle}`);
    } else if (rows.length) {
        const upd = await sr('PATCH', `rest/v1/profiles?id=eq.${userId}`, { handle: HANDLE, display_name: 'E2E Bot' });
        if (!upd.ok) { console.error(`ERROR setting handle: ${upd.status} ${(await upd.text()).slice(0, 200)}`); process.exit(1); }
        console.log(`set handle @${HANDLE} on existing (handle-less) profile`);
    } else {
        const ins = await sr('POST', 'rest/v1/profiles', { id: userId, handle: HANDLE, display_name: 'E2E Bot' });
        if (!ins.ok) { console.error(`ERROR inserting profile: ${ins.status} ${(await ins.text()).slice(0, 200)}`); process.exit(1); }
        console.log(`created profile @${HANDLE}`);
    }

    console.log('\n✅ Test account ready.\n');

    if (process.env.E2E_RUN === '1') {
        // Run the publish harness inline with the freshly-provisioned creds.
        console.log('Running publish harness…\n');
        process.env.DISPATCH_TEST_EMAIL = EMAIL;
        process.env.DISPATCH_TEST_PASSWORD = PASSWORD;
        require('./publish-harness.js');
    } else {
        console.log('Run the harness with:\n');
        console.log(`  DISPATCH_TEST_EMAIL='${EMAIL}' DISPATCH_TEST_PASSWORD='${PASSWORD}' npm run test:e2e\n`);
    }
})();
