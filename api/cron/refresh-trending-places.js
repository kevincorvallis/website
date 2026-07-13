const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const CITIES = ['seattle', 'la', 'ny'];
const CATEGORIES = ['coffee', 'ramen', 'bars', 'brunch'];

const CITY_NAMES = { seattle: 'Seattle', la: 'Los Angeles', ny: 'New York City' };
const CATEGORY_NAMES = { coffee: 'coffee shops', ramen: 'ramen restaurants', bars: 'bars', brunch: 'brunch spots' };

const VALID_PRICE_LEVELS = [
    'PRICE_LEVEL_INEXPENSIVE',
    'PRICE_LEVEL_MODERATE',
    'PRICE_LEVEL_EXPENSIVE',
    'PRICE_LEVEL_VERY_EXPENSIVE',
];

function researchPrompt(city, category) {
    return `Search for currently trending or notable ${CATEGORY_NAMES[category]} in ${CITY_NAMES[city]}.

Report ONLY places you can point to a specific search result for. Never guess or invent a rating, price, or address you did not find explicitly stated in a source — omit that field (use null) instead.

Output a strict JSON array (no markdown, no explanation) with this shape:
[
  {
    "name": string,
    "address": string or null,
    "rating": number or null,
    "reviewCount": number or null,
    "priceLevel": "PRICE_LEVEL_INEXPENSIVE" | "PRICE_LEVEL_MODERATE" | "PRICE_LEVEL_EXPENSIVE" | "PRICE_LEVEL_VERY_EXPENSIVE" | null,
    "whyTrending": string,
    "sourceUrl": string
  }
]

Return between 3 and 8 places. If you cannot find any genuinely trending or notable places for this category and city, return an empty array [].`;
}

function extractJsonArray(text) {
    if (!text) return null;
    try {
        return JSON.parse(text.trim());
    } catch { /* fall through to substring extraction */ }
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
        try {
            return JSON.parse(match[0]);
        } catch { /* give up below */ }
    }
    return null;
}

// Allowlist/never-guess enforcement: only fields explicitly present and
// valid in the model's output pass through; everything else is null. This
// mirrors api/locus-search.js's normalizeParsedParams allowlist pattern.
function normalizeTrendingPlace(p, city, category) {
    const address = typeof p.address === 'string' && p.address.trim() ? p.address.trim().slice(0, 300) : null;
    return {
        city,
        category,
        name: p.name.trim().slice(0, 200),
        address,
        rating: typeof p.rating === 'number' && p.rating >= 1 && p.rating <= 5 ? p.rating : null,
        review_count: typeof p.reviewCount === 'number' && p.reviewCount >= 0 ? p.reviewCount : null,
        price_level: VALID_PRICE_LEVELS.includes(p.priceLevel) ? p.priceLevel : null,
        // Always constructed server-side from name+address (or name+city if
        // address is missing) — never trust a model-provided link, matching
        // the DEMO_PLACES pattern already established in api/locus-search.js.
        maps_uri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            address ? `${p.name.trim()}, ${address}` : `${p.name.trim()}, ${CITY_NAMES[city]}`
        )}`,
        why_trending: typeof p.whyTrending === 'string' ? p.whyTrending.trim().slice(0, 500) : null,
        source_url: p.sourceUrl.trim().slice(0, 500),
    };
}

async function researchTrendingPlaces(city, category) {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
            contents: [{ parts: [{ text: researchPrompt(city, category) }] }],
            tools: [{ google_search: {} }],
        }),
        signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
        const errBody = await res.text();
        const err = new Error('Gemini API error');
        err.status = res.status;
        err.body = errBody.slice(0, 300);
        throw err;
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = extractJsonArray(text);
    if (!Array.isArray(parsed)) return [];
    return parsed
        .filter((p) => p && typeof p.name === 'string' && p.name.trim() && typeof p.sourceUrl === 'string' && p.sourceUrl.trim())
        .slice(0, 8)
        .map((p) => normalizeTrendingPlace(p, city, category));
}

module.exports.researchTrendingPlaces = researchTrendingPlaces;
module.exports.extractJsonArray = extractJsonArray;
module.exports.normalizeTrendingPlace = normalizeTrendingPlace;
module.exports.CITIES = CITIES;
module.exports.CATEGORIES = CATEGORIES;
