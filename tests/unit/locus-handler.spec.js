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

test.describe('handler key_missing routing', () => {
    test('returns a single demo match when the query matches one and no key is configured', async () => {
        const handler = freshHandler({ GOOGLE_PLACES_API_KEY: '' });
        const { req, res } = fakeReqRes('quiet coffee shop to work from near Capitol Hill');
        await handler(req, res);
        expect(res._status).toBe(200);
        expect(res._json.source).toBe('demo');
        expect(res._json.reason).toBe('key_missing');
        expect(res._json.note).toBeUndefined();
        expect(res._json.results).toHaveLength(1);
        expect(res._json.results[0].name).toBe('Espresso Vivace Roasteria');
    });

    test('returns all four demo results with a note when the query does not match any demo query', async () => {
        const handler = freshHandler({ GOOGLE_PLACES_API_KEY: '' });
        const { req, res } = fakeReqRes('best pizza in Tacoma');
        await handler(req, res);
        expect(res._status).toBe(200);
        expect(res._json.source).toBe('demo');
        expect(res._json.reason).toBe('key_missing');
        expect(res._json.note).toContain("isn't configured yet");
        expect(res._json.results).toHaveLength(4);
    });
});
