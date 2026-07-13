const { test, expect } = require('@playwright/test');

const MODULE_PATH = require.resolve('../../api/cron/refresh-trending-places.js');

function freshModule(envOverrides) {
    delete require.cache[MODULE_PATH];
    Object.assign(process.env, envOverrides);
    return require(MODULE_PATH);
}

function fakeReqRes(headers) {
    const req = { method: 'GET', headers: headers || {} };
    const res = {
        _status: 200,
        _json: null,
        status(code) { this._status = code; return this; },
        json(obj) { this._json = obj; return this; },
    };
    return { req, res };
}

test.describe('cron auth check', () => {
    test('rejects a request with no Authorization header', async () => {
        const mod = freshModule({ CRON_SECRET: 'test-secret', GEMINI_API_KEY: '', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' });
        const { req, res } = fakeReqRes({});
        await mod.handler(req, res);
        expect(res._status).toBe(401);
    });

    test('rejects a request with the wrong secret', async () => {
        const mod = freshModule({ CRON_SECRET: 'test-secret' });
        const { req, res } = fakeReqRes({ authorization: 'Bearer wrong-secret' });
        await mod.handler(req, res);
        expect(res._status).toBe(401);
    });

    test('rejects any request if CRON_SECRET itself is not configured', async () => {
        const mod = freshModule({ CRON_SECRET: '' });
        const { req, res } = fakeReqRes({ authorization: 'Bearer anything' });
        await mod.handler(req, res);
        expect(res._status).toBe(401);
    });
});

test.describe('upsertTrendingPlace', () => {
    test('returns true (new) when no existing row is found, and POSTs the upsert', async () => {
        const mod = freshModule({ SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake-key' });
        const calls = [];
        const realFetch = global.fetch;
        global.fetch = async (url, opts) => {
            calls.push({ url: String(url), method: opts && opts.method });
            if (String(url).includes('select=id')) {
                return { ok: true, json: async () => [] };
            }
            return { ok: true, json: async () => ({}) };
        };
        try {
            const isNew = await mod.upsertTrendingPlace({ city: 'seattle', name: 'Test Place', category: 'coffee', maps_uri: 'https://x', source_url: 'https://y' });
            expect(isNew).toBe(true);
            expect(calls.some((c) => c.method === 'POST')).toBe(true);
        } finally {
            global.fetch = realFetch;
        }
    });

    test('returns false (existing) when a prior row is found', async () => {
        const mod = freshModule({ SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake-key' });
        const realFetch = global.fetch;
        global.fetch = async (url) => {
            if (String(url).includes('select=id')) {
                return { ok: true, json: async () => [{ id: 42 }] };
            }
            return { ok: true, json: async () => ({}) };
        };
        try {
            const isNew = await mod.upsertTrendingPlace({ city: 'seattle', name: 'Test Place', category: 'coffee', maps_uri: 'https://x', source_url: 'https://y' });
            expect(isNew).toBe(false);
        } finally {
            global.fetch = realFetch;
        }
    });

    test('throws when the upsert POST itself fails', async () => {
        const mod = freshModule({ SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake-key' });
        const realFetch = global.fetch;
        global.fetch = async (url) => {
            if (String(url).includes('select=id')) return { ok: true, json: async () => [] };
            return { ok: false, status: 500, text: async () => 'db error' };
        };
        try {
            await expect(mod.upsertTrendingPlace({ city: 'seattle', name: 'X', category: 'coffee', maps_uri: 'https://x', source_url: 'https://y' })).rejects.toThrow();
        } finally {
            global.fetch = realFetch;
        }
    });
});
