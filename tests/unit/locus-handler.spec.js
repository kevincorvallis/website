const { test, expect } = require('@playwright/test');

const MODULE_PATH = require.resolve('../../api/locus-search.js');

function freshHandler(envOverrides) {
    delete require.cache[MODULE_PATH];
    Object.assign(process.env, envOverrides);
    return require(MODULE_PATH);
}

function fakeReqRes(query) {
    const req = { method: 'POST', headers: {}, body: { query } };
    const res = {
        _status: 200,
        _json: null,
        status(code) { this._status = code; return this; },
        json(obj) { this._json = obj; return this; },
        setHeader() {},
        end() {},
    };
    return { req, res };
}

test.describe('handler out-of-scope routing', () => {
    test('falls back to demo when the query has no matching category', async () => {
        const handler = freshHandler({ SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' });
        const { req, res } = fakeHandlerQuery(handler, 'best pizza in Tacoma');
        await handler(req, res);
        expect(res._status).toBe(200);
        expect(res._json.source).toBe('demo');
        expect(res._json.reason).toBe('out_of_scope');
    });
});

test.describe('handler no_trending_data routing', () => {
    test('falls back to demo when the DB returns zero rows for an in-scope city/category', async () => {
        const handler = freshHandler({ SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake-key', CLIPROXY_URL: 'https://fake-cliproxy', CLIPROXY_SECRET: 'fake-secret' });
        const realFetch = global.fetch;
        global.fetch = async (url, opts) => {
            const urlStr = String(url);
            if (urlStr.includes('trending_places')) {
                return { ok: true, json: async () => [] };
            }
            const body = JSON.parse(opts.body);
            if (body.messages[0].content.includes('precise search translation engine')) {
                return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ searchText: 'coffee shop', city: 'seattle', category: 'coffee' }) } }] }) };
            }
            return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ results: [] }) } }] }) };
        };
        try {
            const { req, res } = fakeReqRes('quiet coffee shop to work from near Capitol Hill');
            await handler(req, res);
            expect(res._status).toBe(200);
            expect(res._json.source).toBe('demo');
            expect(res._json.reason).toBe('no_trending_data');
        } finally {
            global.fetch = realFetch;
        }
    });
});

test.describe('handler degraded routing', () => {
    test('falls back to degraded when the trending_places query itself fails', async () => {
        const handler = freshHandler({ SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake-key', CLIPROXY_URL: 'https://fake-cliproxy', CLIPROXY_SECRET: 'fake-secret' });
        const realFetch = global.fetch;
        global.fetch = async (url, opts) => {
            const urlStr = String(url);
            if (urlStr.includes('trending_places')) {
                return { ok: false, status: 503, text: async () => 'db unavailable' };
            }
            const body = JSON.parse(opts.body);
            if (body.messages[0].content.includes('precise search translation engine')) {
                return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ searchText: 'coffee shop', city: 'seattle', category: 'coffee' }) } }] }) };
            }
            return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ results: [] }) } }] }) };
        };
        try {
            const { req, res } = fakeReqRes('quiet coffee shop to work from near Capitol Hill');
            await handler(req, res);
            expect(res._status).toBe(200);
            expect(res._json.source).toBe('degraded');
            expect(res._json.reason).toBe('upstream_error');
        } finally {
            global.fetch = realFetch;
        }
    });
});

test.describe('handler live routing', () => {
    test('falls back to the DB\'s own order (no whyItFits) when the rank LLM call fails', async () => {
        const handler = freshHandler({ SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake-key', CLIPROXY_URL: 'https://fake-cliproxy', CLIPROXY_SECRET: 'fake-secret' });
        const realFetch = global.fetch;
        global.fetch = async (url, opts) => {
            const urlStr = String(url);
            if (urlStr.includes('trending_places')) {
                return {
                    ok: true,
                    json: async () => [
                        { id: 42, city: 'seattle', category: 'coffee', name: 'Real Coffee Co', address: '1 Pine St', rating: 4.7, review_count: 500, price_level: 'PRICE_LEVEL_MODERATE', maps_uri: 'https://maps.example/x', last_confirmed_at: '2026-07-06T08:00:00Z' },
                    ],
                };
            }
            const body = JSON.parse(opts.body);
            if (body.messages[0].content.includes('precise search translation engine')) {
                return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ searchText: 'coffee shop', city: 'seattle', category: 'coffee' }) } }] }) };
            }
            // Rank call fails -> rankPlaces() returns null -> handler falls back to the DB's own order.
            return { ok: false, status: 500, text: async () => 'rank llm error' };
        };
        try {
            const { req, res } = fakeReqRes('quiet coffee shop to work from near Capitol Hill');
            await handler(req, res);
            expect(res._status).toBe(200);
            expect(res._json.source).toBe('live');
            expect(res._json.reason).toBeNull();
            expect(res._json.results).toHaveLength(1);
            expect(res._json.results[0].name).toBe('Real Coffee Co');
            expect(res._json.results[0].whyItFits).toBeNull();
            expect(res._json.results[0].lastConfirmedAt).toBe('2026-07-06T08:00:00Z');
        } finally {
            global.fetch = realFetch;
        }
    });

    test('id type coercion: numeric DB ids still match string ids the rank LLM echoes back', async () => {
        // Regression test for the Map key-coercion gotcha described in this
        // task's brief — a rank LLM response with a STRING id must still
        // match a candidate whose raw DB id is a NUMBER.
        const handler = freshHandler({ SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake-key', CLIPROXY_URL: 'https://fake-cliproxy', CLIPROXY_SECRET: 'fake-secret' });
        const realFetch = global.fetch;
        global.fetch = async (url, opts) => {
            const urlStr = String(url);
            if (urlStr.includes('trending_places')) {
                return { ok: true, json: async () => [{ id: 42, city: 'seattle', category: 'coffee', name: 'Numeric Id Place', maps_uri: 'https://maps.example/x', last_confirmed_at: '2026-07-06T08:00:00Z' }] };
            }
            const body = JSON.parse(opts.body);
            if (body.messages[0].content.includes('precise search translation engine')) {
                return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ searchText: 'coffee shop', city: 'seattle', category: 'coffee' }) } }] }) };
            }
            return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ results: [{ id: '42', whyItFits: 'Matched via string id.' }] }) } }] }) };
        };
        try {
            const { req, res } = fakeReqRes('quiet coffee shop to work from near Capitol Hill');
            await handler(req, res);
            expect(res._json.source).toBe('live');
            expect(res._json.results).toHaveLength(1);
            expect(res._json.results[0].whyItFits).toBe('Matched via string id.');
        } finally {
            global.fetch = realFetch;
        }
    });
});

function fakeHandlerQuery(handler, query) {
    return fakeReqRes(query);
}
