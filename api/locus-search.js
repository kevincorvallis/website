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

module.exports = {
    // Attached now for Task 2's unit tests; Task 4 adds the default request
    // handler (module.exports.handler) and wires these together.
    callLLM,
    extractJson,
    normalizeParsedParams,
    parseQuery,
    sanitizeInput,
    isRateLimited,
    searchPlaces,
    placeToResult,
};
