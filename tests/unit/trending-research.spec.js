const { test, expect } = require('@playwright/test');

const MODULE_PATH = require.resolve('../../api/cron/refresh-trending-places.js');

function freshModule(envOverrides) {
    delete require.cache[MODULE_PATH];
    Object.assign(process.env, envOverrides);
    return require(MODULE_PATH);
}

test.describe('extractJsonArray', () => {
    test('parses a clean JSON array string', () => {
        const mod = freshModule({});
        const result = mod.extractJsonArray('[{"name":"Test"}]');
        expect(result).toEqual([{ name: 'Test' }]);
    });

    test('extracts a JSON array embedded in surrounding prose', () => {
        const mod = freshModule({});
        const result = mod.extractJsonArray('Here you go:\n[{"name":"Test"}]\nHope that helps!');
        expect(result).toEqual([{ name: 'Test' }]);
    });

    test('returns null for text with no JSON array', () => {
        const mod = freshModule({});
        expect(mod.extractJsonArray('no json here')).toBeNull();
    });

    test('returns null for empty/undefined input', () => {
        const mod = freshModule({});
        expect(mod.extractJsonArray('')).toBeNull();
        expect(mod.extractJsonArray(undefined)).toBeNull();
    });
});

test.describe('normalizeTrendingPlace', () => {
    test('passes through a fully valid place, building maps_uri from name+address', () => {
        const mod = freshModule({});
        const result = mod.normalizeTrendingPlace(
            { name: 'Test Cafe', address: '123 Main St', rating: 4.5, reviewCount: 200, priceLevel: 'PRICE_LEVEL_MODERATE', whyTrending: 'Great coffee.', sourceUrl: 'https://example.com/review' },
            'seattle', 'coffee'
        );
        expect(result).toEqual({
            city: 'seattle',
            category: 'coffee',
            name: 'Test Cafe',
            address: '123 Main St',
            rating: 4.5,
            review_count: 200,
            price_level: 'PRICE_LEVEL_MODERATE',
            maps_uri: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Test Cafe, 123 Main St'),
            why_trending: 'Great coffee.',
            source_url: 'https://example.com/review',
        });
    });

    test('omits (nulls) rating/address/priceLevel the model did not provide, never guesses', () => {
        const mod = freshModule({});
        const result = mod.normalizeTrendingPlace(
            { name: 'Mystery Spot', whyTrending: 'Mentioned a lot lately.', sourceUrl: 'https://example.com/x' },
            'la', 'bars'
        );
        expect(result.address).toBeNull();
        expect(result.rating).toBeNull();
        expect(result.review_count).toBeNull();
        expect(result.price_level).toBeNull();
        expect(result.maps_uri).toBe('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Mystery Spot, Los Angeles'));
    });

    test('drops an out-of-range rating rather than passing it through', () => {
        const mod = freshModule({});
        const result = mod.normalizeTrendingPlace(
            { name: 'Test', rating: 9.9, sourceUrl: 'https://example.com/x' },
            'ny', 'ramen'
        );
        expect(result.rating).toBeNull();
    });

    test('drops an invalid priceLevel value rather than passing it through', () => {
        const mod = freshModule({});
        const result = mod.normalizeTrendingPlace(
            { name: 'Test', priceLevel: 'FREE', sourceUrl: 'https://example.com/x' },
            'ny', 'ramen'
        );
        expect(result.price_level).toBeNull();
    });

    test('drops a rating provided as a string rather than passing it through', () => {
        const mod = freshModule({});
        const result = mod.normalizeTrendingPlace(
            { name: 'Test', rating: '4.5', sourceUrl: 'https://example.com/x' },
            'ny', 'ramen'
        );
        expect(result.rating).toBeNull();
    });

    test('drops a priceLevel provided as a number rather than passing it through', () => {
        const mod = freshModule({});
        const result = mod.normalizeTrendingPlace(
            { name: 'Test', priceLevel: 2, sourceUrl: 'https://example.com/x' },
            'ny', 'ramen'
        );
        expect(result.price_level).toBeNull();
    });

    test('drops a reviewCount provided as a string rather than passing it through', () => {
        const mod = freshModule({});
        const result = mod.normalizeTrendingPlace(
            { name: 'Test', reviewCount: '200', sourceUrl: 'https://example.com/x' },
            'ny', 'ramen'
        );
        expect(result.review_count).toBeNull();
    });

    test('ignores a model-supplied mapsUri/maps_uri, always builds its own link', () => {
        const mod = freshModule({});
        const result = mod.normalizeTrendingPlace(
            {
                name: 'Test',
                address: '123 Main St',
                mapsUri: 'https://evil.example.com',
                maps_uri: 'https://evil.example.com',
                sourceUrl: 'https://example.com/x',
            },
            'ny', 'ramen'
        );
        expect(result.maps_uri).toBe('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Test, 123 Main St'));
        expect(result.maps_uri).not.toContain('evil.example.com');
    });
});

test.describe('researchTrendingPlaces', () => {
    test('parses a valid Gemini grounded response into normalized places', async () => {
        const mod = freshModule({ GEMINI_API_KEY: 'fake-key' });
        const realFetch = global.fetch;
        global.fetch = async () => ({
            ok: true,
            json: async () => ({
                candidates: [{
                    content: {
                        parts: [{
                            text: JSON.stringify([
                                { name: 'Real Coffee Co', address: '1 Pine St', rating: 4.7, reviewCount: 500, priceLevel: 'PRICE_LEVEL_MODERATE', whyTrending: 'New opening getting buzz.', sourceUrl: 'https://example.com/a' },
                            ]),
                        }],
                    },
                }],
            }),
        });
        try {
            const result = await mod.researchTrendingPlaces('seattle', 'coffee');
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Real Coffee Co');
            expect(result[0].city).toBe('seattle');
            expect(result[0].category).toBe('coffee');
        } finally {
            global.fetch = realFetch;
        }
    });

    test('filters out entries missing required name/sourceUrl fields', async () => {
        const mod = freshModule({ GEMINI_API_KEY: 'fake-key' });
        const realFetch = global.fetch;
        global.fetch = async () => ({
            ok: true,
            json: async () => ({
                candidates: [{
                    content: {
                        parts: [{
                            text: JSON.stringify([
                                { name: 'Valid Place', sourceUrl: 'https://example.com/a' },
                                { address: 'no name here', sourceUrl: 'https://example.com/b' },
                                { name: 'No source url' },
                            ]),
                        }],
                    },
                }],
            }),
        });
        try {
            const result = await mod.researchTrendingPlaces('seattle', 'coffee');
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Valid Place');
        } finally {
            global.fetch = realFetch;
        }
    });

    test('throws with a status when the Gemini API call fails', async () => {
        const mod = freshModule({ GEMINI_API_KEY: 'fake-key' });
        const realFetch = global.fetch;
        global.fetch = async () => ({ ok: false, status: 429, text: async () => 'rate limited' });
        try {
            await expect(mod.researchTrendingPlaces('seattle', 'coffee')).rejects.toThrow();
        } finally {
            global.fetch = realFetch;
        }
    });
});
