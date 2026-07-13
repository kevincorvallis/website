const { test, expect } = require('@playwright/test');

const MODULE_PATH = require.resolve('../../api/locus-search.js');

function freshModule(envOverrides) {
    delete require.cache[MODULE_PATH];
    Object.assign(process.env, envOverrides);
    return require(MODULE_PATH);
}

test.describe('queryTrendingPlaces', () => {
    test('queries Supabase filtered by city and category, returns rows', async () => {
        const mod = freshModule({ SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake-key' });
        let capturedUrl = null;
        const realFetch = global.fetch;
        global.fetch = async (url) => {
            capturedUrl = String(url);
            return { ok: true, json: async () => [{ id: 1, city: 'seattle', category: 'coffee', name: 'Test Cafe' }] };
        };
        try {
            const result = await mod.queryTrendingPlaces('seattle', 'coffee');
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Test Cafe');
            expect(capturedUrl).toContain('city=eq.seattle');
            expect(capturedUrl).toContain('category=eq.coffee');
        } finally {
            global.fetch = realFetch;
        }
    });

    test('throws with a status when the query fails', async () => {
        const mod = freshModule({ SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake-key' });
        const realFetch = global.fetch;
        global.fetch = async () => ({ ok: false, status: 503, text: async () => 'unavailable' });
        try {
            await expect(mod.queryTrendingPlaces('seattle', 'coffee')).rejects.toThrow();
        } finally {
            global.fetch = realFetch;
        }
    });
});

test.describe('trendingRowToResult', () => {
    test('maps a DB row to the results[] item shape, carrying whyItFits and lastConfirmedAt', () => {
        const mod = freshModule({});
        const row = {
            name: 'Test Cafe', address: '1 Main St', rating: 4.5, review_count: 100,
            price_level: 'PRICE_LEVEL_MODERATE', maps_uri: 'https://maps.example/x',
            last_confirmed_at: '2026-07-06T08:00:00Z',
        };
        const result = mod.trendingRowToResult(row, 'Great vibe.');
        expect(result).toEqual({
            name: 'Test Cafe', address: '1 Main St', rating: 4.5, userRatingCount: 100,
            priceLevel: 'PRICE_LEVEL_MODERATE', mapsUri: 'https://maps.example/x',
            whyItFits: 'Great vibe.', lastConfirmedAt: '2026-07-06T08:00:00Z',
        });
    });

    test('handles null fields gracefully (never fabricates a value)', () => {
        const mod = freshModule({});
        const row = { name: 'Minimal Place', maps_uri: 'https://maps.example/y', last_confirmed_at: '2026-07-06T08:00:00Z' };
        const result = mod.trendingRowToResult(row, null);
        expect(result.address).toBe('');
        expect(result.rating).toBeNull();
        expect(result.userRatingCount).toBeNull();
        expect(result.priceLevel).toBeNull();
        expect(result.whyItFits).toBeNull();
    });
});
