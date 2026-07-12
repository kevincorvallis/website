const { test, expect } = require('@playwright/test');
const locusSearch = require('../../api/locus-search.js');

test.describe('findDemoMatch', () => {
    test('matches the exact demo query text', () => {
        const result = locusSearch.findDemoMatch('quiet coffee shop to work from near Capitol Hill');
        expect(result).not.toBeNull();
        expect(result.name).toBe('Espresso Vivace Roasteria');
    });

    test('matches case-insensitively', () => {
        const result = locusSearch.findDemoMatch('QUIET COFFEE SHOP TO WORK FROM NEAR CAPITOL HILL');
        expect(result).not.toBeNull();
        expect(result.name).toBe('Espresso Vivace Roasteria');
    });

    test('matches with surrounding whitespace', () => {
        const result = locusSearch.findDemoMatch('  date night ramen spot in Fremont  ');
        expect(result).not.toBeNull();
        expect(result.name).toBe('Ooink');
    });

    test('returns null for a query that does not match any demo query', () => {
        const result = locusSearch.findDemoMatch('best pizza in Tacoma');
        expect(result).toBeNull();
    });

    test('returns null for an empty string', () => {
        const result = locusSearch.findDemoMatch('');
        expect(result).toBeNull();
    });

    test('DEMO_RESULTS has exactly 4 entries with the required fields', () => {
        expect(locusSearch.DEMO_RESULTS).toHaveLength(4);
        locusSearch.DEMO_RESULTS.forEach((r) => {
            expect(typeof r.name).toBe('string');
            expect(typeof r.address).toBe('string');
            expect(typeof r.rating).toBe('number');
            expect(typeof r.userRatingCount).toBe('number');
            expect(typeof r.priceLevel).toBe('string');
            expect(typeof r.mapsUri).toBe('string');
            expect(typeof r.whyItFits).toBe('string');
        });
    });
});
