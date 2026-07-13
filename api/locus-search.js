const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

const ALLOWED_ORIGINS = ['https://klee.page', 'https://www.klee.page'];

// Rate limiter: 10 requests per minute per IP (same pattern as api/chat.js).
const rateMap = new Map();
const RATE_LIMIT = 10;
const RATE_WINDOW = 60 * 1000;

function isRateLimited(ip) {
    const now = Date.now();
    const entry = rateMap.get(ip);
    if (!entry || now - entry.start > RATE_WINDOW) {
        rateMap.set(ip, { start: now, count: 1 });
        return false;
    }
    entry.count++;
    return entry.count > RATE_LIMIT;
}

function sanitizeInput(text) {
    let clean = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    clean = clean.replace(/\s{10,}/g, ' ');
    return clean.trim();
}

// Duplicated from api/chat.js rather than extracted into a shared module —
// api/chat.js is an already-shipped, working endpoint; this plan does not touch
// it, to keep this feature's blast radius contained to new files only.
function getProviderChain() {
    const chain = [];
    if (process.env.CLIPROXY_URL && process.env.CLIPROXY_SECRET) {
        chain.push({
            url: process.env.CLIPROXY_URL,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.CLIPROXY_SECRET}`,
            },
            model: 'claude-sonnet-4',
            name: 'cliproxy',
            timeoutMs: 8000,
        });
    }
    if (process.env.OPENAI_API_KEY) {
        chain.push({
            url: 'https://api.openai.com/v1/chat/completions',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            model: 'gpt-4o-mini',
            name: 'openai',
            timeoutMs: 15000,
        });
    }
    return chain;
}

async function callLLM(systemPrompt, userContent) {
    const providers = getProviderChain();
    if (providers.length === 0) return null;
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
    ];
    for (const provider of providers) {
        try {
            const res = await fetch(provider.url, {
                method: 'POST',
                headers: provider.headers,
                body: JSON.stringify({
                    model: provider.model,
                    messages,
                    max_tokens: 600,
                    temperature: 0.3,
                }),
                signal: AbortSignal.timeout(provider.timeoutMs),
            });
            if (!res.ok) {
                console.error(`LOCUS_LLM_${provider.name}_ERROR`, (await res.text()).slice(0, 300));
                continue;
            }
            const data = await res.json();
            const text = data.choices?.[0]?.message?.content;
            if (text) return text;
        } catch (err) {
            console.error(`LOCUS_LLM_${provider.name}_UNREACHABLE`, err.message);
        }
    }
    return null;
}

function extractJson(text) {
    if (!text) return null;
    try {
        return JSON.parse(text.trim());
    } catch { /* fall through to substring extraction */ }
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
        try {
            return JSON.parse(match[0]);
        } catch { /* give up below */ }
    }
    return null;
}

const VALID_PRICE_LEVELS = [
    'PRICE_LEVEL_INEXPENSIVE',
    'PRICE_LEVEL_MODERATE',
    'PRICE_LEVEL_EXPENSIVE',
    'PRICE_LEVEL_VERY_EXPENSIVE',
];

// Allowlist filter: only these three fields ever leave this function, regardless
// of what other keys the LLM's JSON output contains — this is the
// prompt-injection defense described in the design spec (the model's output
// becomes API parameters, never raw instructions).
function normalizeParsedParams(parsed, fallbackQuery) {
    if (!parsed || typeof parsed.searchText !== 'string' || !parsed.searchText.trim()) {
        return { searchText: fallbackQuery };
    }
    const result = { searchText: parsed.searchText.trim().slice(0, 200) };
    if (typeof parsed.minRating === 'number' && parsed.minRating >= 1 && parsed.minRating <= 5) {
        result.minRating = parsed.minRating;
    }
    if (VALID_PRICE_LEVELS.includes(parsed.priceLevel)) {
        result.priceLevel = parsed.priceLevel;
    }
    return result;
}

// Basic-tier fields only — deliberately excludes currentOpeningHours to avoid the
// pricier "Places Details (Advanced)" SKU. openNow filtering is out of scope for v1.
const PLACES_FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.primaryType,places.googleMapsUri';

async function searchPlaces(searchText) {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
            'X-Goog-FieldMask': PLACES_FIELD_MASK,
        },
        body: JSON.stringify({ textQuery: searchText, pageSize: 10 }),
        signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
        const errBody = await res.text();
        const err = new Error('Places API error');
        err.status = res.status;
        err.body = errBody.slice(0, 300);
        throw err;
    }
    const data = await res.json();
    // Google returns `{}` (not `{places: []}`) on a zero-match search.
    return data.places || [];
}

function placeToResult(place, whyItFits) {
    return {
        name: place.displayName?.text || 'Unknown',
        address: place.formattedAddress || '',
        rating: place.rating ?? null,
        userRatingCount: place.userRatingCount ?? null,
        priceLevel: place.priceLevel || null,
        mapsUri: place.googleMapsUri || null,
        whyItFits: whyItFits || null,
    };
}

const CITIES = ['seattle', 'la', 'ny'];
const CATEGORIES = ['coffee', 'ramen', 'bars', 'brunch'];

async function queryTrendingPlaces(city, category) {
    const url = `${SUPABASE_URL}/rest/v1/trending_places?city=eq.${encodeURIComponent(city)}&category=eq.${encodeURIComponent(category)}&order=last_confirmed_at.desc&limit=10`;
    const res = await fetch(url, {
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
        const body = await res.text();
        const err = new Error('Trending places query failed');
        err.status = res.status;
        err.body = body.slice(0, 300);
        throw err;
    }
    return res.json();
}

function trendingRowToResult(row, whyItFits) {
    return {
        name: row.name,
        address: row.address || '',
        rating: row.rating ?? null,
        userRatingCount: row.review_count ?? null,
        priceLevel: row.price_level || null,
        mapsUri: row.maps_uri || null,
        whyItFits: whyItFits || null,
        lastConfirmedAt: row.last_confirmed_at,
    };
}

// Real places, independently web-searched and sourced 2026-07-11 (see
// docs/superpowers/specs/2026-07-11-locus-demo-mode-design.md §4). A frozen
// snapshot, not a live feed — never fabricated, never auto-refreshed.
const DEMO_PLACES = [
    {
        query: 'quiet coffee shop to work from near capitol hill',
        name: 'Espresso Vivace Roasteria',
        address: '532 Broadway E, Seattle, WA 98102',
        rating: 4.5,
        userRatingCount: 1515,
        priceLevel: 'PRICE_LEVEL_INEXPENSIVE',
        mapsUri: 'https://www.google.com/maps/search/?api=1&query=Espresso%20Vivace%20Roasteria%2C%20532%20Broadway%20E%2C%20Seattle%2C%20WA%2098102',
        whyItFits: 'A 38-year-old Capitol Hill fixture with a dedicated quiet room, rated 4.5 from over 1,500 reviews at coffee-shop prices.',
    },
    {
        query: 'date night ramen spot in fremont',
        name: 'Ooink',
        address: '3630 Stone Way N, Seattle, WA 98103',
        rating: 4.3,
        userRatingCount: 285,
        priceLevel: 'PRICE_LEVEL_MODERATE',
        mapsUri: 'https://www.google.com/maps/search/?api=1&query=Ooink%2C%203630%20Stone%20Way%20N%2C%20Seattle%2C%20WA%2098103',
        whyItFits: 'A 4.3-rated, mid-priced ramen counter in the heart of Fremont\'s ramen row, small enough that the room stays intimate.',
    },
    {
        query: 'a bar where you can actually hear people talk, in ballard',
        name: 'The Ballard Smoke Shop',
        address: '5439 Ballard Ave NW, Seattle, WA 98107',
        rating: 4.4,
        userRatingCount: 452,
        priceLevel: 'PRICE_LEVEL_INEXPENSIVE',
        mapsUri: 'https://www.google.com/maps/search/?api=1&query=The%20Ballard%20Smoke%20Shop%2C%205439%20Ballard%20Ave%20NW%2C%20Seattle%2C%20WA%2098107',
        whyItFits: 'A family-run dive bar since 1971, rated 4.4 on Google, with a lounge-and-arcade layout that skews toward conversation over club noise.',
    },
    {
        query: 'best view brunch spot in downtown seattle',
        name: 'Goldfinch Tavern',
        address: '99 Union St, Seattle, WA 98101',
        rating: 4.3,
        userRatingCount: 1011,
        priceLevel: 'PRICE_LEVEL_EXPENSIVE',
        mapsUri: 'https://www.google.com/maps/search/?api=1&query=Goldfinch%20Tavern%2C%2099%20Union%20St%2C%20Seattle%2C%20WA%2098101',
        whyItFits: 'An Elliott Bay-facing dining room with over 1,000 Google reviews at a 4.3 average, priced at the upper end for a Sunday brunch buffet.',
    },
];

function demoResultShape(place) {
    return {
        name: place.name,
        address: place.address,
        rating: place.rating,
        userRatingCount: place.userRatingCount,
        priceLevel: place.priceLevel,
        mapsUri: place.mapsUri,
        whyItFits: place.whyItFits,
    };
}

const DEMO_RESULTS = DEMO_PLACES.map(demoResultShape);

function findDemoMatch(cleanQuery) {
    if (!cleanQuery) return null;
    const normalized = cleanQuery.trim().toLowerCase();
    const match = DEMO_PLACES.find((p) => p.query === normalized);
    return match ? demoResultShape(match) : null;
}

const PARSE_SYSTEM_PROMPT = `You are a precise search translation engine. Parse the user's natural language query into structured parameters for the Google Places API (New).

You must output a strict JSON object with this schema:
{
  "searchText": string, // A clean, optimized search string combining the core intent and location
  "minRating": number,  // Optional. Minimum rating (1.0 to 5.0) if implied (e.g., "highly rated").
  "priceLevel": string  // Optional. One of: "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"
}

Rules:
1. If no location is provided or implied, append "Seattle" to the searchText as a default (the site owner is Seattle-based).
2. If the query is ambiguous, focus the searchText on the primary nouns and location.
3. Do not include markdown formatting or explanation. Return ONLY the raw JSON.`;

async function parseQuery(query) {
    const text = await callLLM(PARSE_SYSTEM_PROMPT, query);
    const parsed = extractJson(text);
    return normalizeParsedParams(parsed, query);
}

const RANK_SYSTEM_PROMPT = `You are an objective local guide. Your task is to select and rank up to 10 raw place candidates based on how well they match the user's original query, choosing the top 5.

Output strict JSON:
{
  "results": [
    { "id": "string", "whyItFits": "string" }
  ],
  "noGoodMatches": boolean
}

Rules:
1. Be critical — if the user asked for "quiet" and a candidate is a notoriously loud chain, say so or exclude it.
2. If nothing is a reasonable fit, set noGoodMatches true and return an empty results array.
3. Never invent facts — base whyItFits strictly on the place's name, type, rating, and metadata provided.
4. Return ONLY raw JSON, no markdown.`;

async function rankPlaces(originalQuery, candidates) {
    const candidateSummary = candidates.map((p) => ({
        id: p.id,
        name: p.displayName?.text || 'Unknown',
        address: p.formattedAddress || '',
        rating: p.rating,
        userRatingCount: p.userRatingCount,
        priceLevel: p.priceLevel,
        primaryType: p.primaryType,
    }));
    const userContent = JSON.stringify({ userQuery: originalQuery, candidates: candidateSummary });
    const text = await callLLM(RANK_SYSTEM_PROMPT, userContent);
    const parsed = extractJson(text);
    if (!parsed || !Array.isArray(parsed.results)) return null;
    return parsed.results.slice(0, 5);
}

function logSearch(query, results, placeIds, req, source) {
    if (!SUPABASE_URL || !SUPABASE_KEY) return;
    const row = {
        query,
        response: results.map((r, i) => ({ place_id: placeIds[i] ?? null, name: r.name, rank: i + 1, source })),
        ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || null,
        country: req.headers['x-vercel-ip-country'] || null,
        city: req.headers['x-vercel-ip-city'] || null,
        region: req.headers['x-vercel-ip-country-region'] || null,
        user_agent: req.headers['user-agent'] || null,
        referer: req.headers['referer'] || null,
        language: req.headers['accept-language'] || null,
    };
    fetch(`${SUPABASE_URL}/rest/v1/locus_searches`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify(row),
    }).catch((err) => console.error('LOCUS_LOG_ERROR', err.message));
}

async function handler(req, res) {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    if (isRateLimited(ip)) {
        return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
    }

    const { query } = req.body || {};
    if (!query || typeof query !== 'string' || !query.trim()) {
        return res.status(400).json({ error: 'Query is required' });
    }
    if (query.length > 300) {
        return res.status(400).json({ error: 'Query too long (max 300 characters)' });
    }
    const cleanQuery = sanitizeInput(query);
    if (!cleanQuery) {
        return res.status(400).json({ error: 'Query is required' });
    }

    if (!GOOGLE_PLACES_API_KEY) {
        const matched = findDemoMatch(cleanQuery);
        if (matched) {
            logSearch(cleanQuery, [matched], [null], req, 'demo');
            return res.status(200).json({ source: 'demo', reason: 'key_missing', results: [matched] });
        }
        logSearch(cleanQuery, DEMO_RESULTS, DEMO_RESULTS.map(() => null), req, 'demo');
        return res.status(200).json({
            source: 'demo',
            reason: 'key_missing',
            note: "Live search isn't configured yet — here are four real examples.",
            results: DEMO_RESULTS,
        });
    }

    let places;
    try {
        const parsed = await parseQuery(cleanQuery);
        places = await searchPlaces(parsed.searchText);
    } catch (err) {
        console.error('LOCUS_PLACES_ERROR', err.status || 'exception', err.message);
        let reason = 'upstream_error';
        if (err.status === 401 || err.status === 403) {
            reason = 'key_invalid';
        } else if (err.status === 429) {
            reason = 'places_rate_limited';
        } else if (err.name === 'TimeoutError' || err.name === 'AbortError') {
            reason = 'timeout';
        }
        logSearch(cleanQuery, DEMO_RESULTS, DEMO_RESULTS.map(() => null), req, 'degraded');
        return res.status(200).json({ source: 'degraded', reason, results: DEMO_RESULTS });
    }

    if (places.length === 0) {
        logSearch(cleanQuery, [], [], req, 'live');
        return res.status(200).json({ source: 'live', reason: null, results: [] });
    }

    let ranked = null;
    try {
        ranked = await rankPlaces(cleanQuery, places);
    } catch (err) {
        console.error('LOCUS_RANK_ERROR', err.message);
    }

    let finalResults;
    let finalPlaceIds;
    if (ranked) {
        const byId = new Map(places.map((p) => [p.id, p]));
        finalResults = ranked
            .map((r) => {
                const p = byId.get(r.id);
                return p ? placeToResult(p, r.whyItFits) : null;
            })
            .filter(Boolean);
        finalPlaceIds = ranked
            .filter((r) => byId.has(r.id))
            .map((r) => r.id);
    } else {
        // LLM #2 failed — fall back to Google's own order, no explanations, but
        // never discard the paid Places results.
        const top = places.slice(0, 5);
        finalResults = top.map((p) => placeToResult(p, null));
        finalPlaceIds = top.map((p) => p.id);
    }

    logSearch(cleanQuery, finalResults, finalPlaceIds, req, 'live');
    return res.status(200).json({ source: 'live', reason: null, results: finalResults });
}

module.exports = handler;
module.exports.callLLM = callLLM;
module.exports.extractJson = extractJson;
module.exports.normalizeParsedParams = normalizeParsedParams;
module.exports.parseQuery = parseQuery;
module.exports.sanitizeInput = sanitizeInput;
module.exports.isRateLimited = isRateLimited;
module.exports.searchPlaces = searchPlaces;
module.exports.placeToResult = placeToResult;
module.exports.rankPlaces = rankPlaces;
module.exports.findDemoMatch = findDemoMatch;
module.exports.DEMO_RESULTS = DEMO_RESULTS;
module.exports.queryTrendingPlaces = queryTrendingPlaces;
module.exports.trendingRowToResult = trendingRowToResult;
