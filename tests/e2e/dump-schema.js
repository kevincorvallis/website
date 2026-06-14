// Introspect the live Supabase schema via PostgREST's OpenAPI spec (no DB password
// needed — the service-role key is enough). Prints columns + types + PK/FK/NOT-NULL
// for the platform tables so the schema can be captured into a tracked migration.
//
// Run via tests/e2e/dump-schema.sh (pulls prod env, then runs this).

if (process.env.DOTENV) {
    try {
        const txt = require('fs').readFileSync(process.env.DOTENV, 'utf8');
        for (const line of txt.split('\n')) {
            const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
            if (!m) continue;
            let v = m[2].trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
            v = v.replace(/\\r/g, '').replace(/\\n/g, '').replace(/[\r\n]+$/, '').trim();
            if (process.env[m[1]] === undefined) process.env[m[1]] = v;
        }
    } catch (e) {}
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WANT = (process.env.TABLES || 'profiles,articles,article_media,invitations').split(',');

(async () => {
    if (!SUPABASE_URL || !SR) { console.error('ERROR: need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
    const r = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        headers: { apikey: SR, Authorization: `Bearer ${SR}`, Accept: 'application/openapi+json' },
    });
    if (!r.ok) { console.error(`ERROR: openapi fetch ${r.status} ${(await r.text()).slice(0, 200)}`); process.exit(1); }
    const spec = await r.json();
    const defs = spec.definitions || (spec.components && spec.components.schemas) || {};

    console.log('EXPOSED TABLES: ' + Object.keys(defs).sort().join(', ') + '\n');

    for (const t of WANT) {
        const def = defs[t];
        if (!def) { console.log(`=== ${t} === (NOT FOUND in live schema)\n`); continue; }
        const props = def.properties || {};
        const req = new Set(def.required || []);
        console.log(`=== ${t} ===`);
        for (const [col, d] of Object.entries(props)) {
            const desc = (d.description || '').replace(/\s+/g, ' ').trim();
            console.log(`  ${col}\t| swagger=${d.type || '?'}${d.format ? '/' + d.format : ''}\t| notnull=${req.has(col)}\t| ${desc}`);
        }
        console.log('');
    }
})();
