CREATE TABLE trending_places (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  city text NOT NULL,              -- 'seattle' | 'la' | 'ny'
  category text NOT NULL,          -- 'coffee' | 'ramen' | 'bars' | 'brunch'
  name text NOT NULL,
  address text,                    -- nullable: omitted if the weekly research
                                    -- couldn't confirm it from a real source
  rating numeric,                  -- nullable, same reason
  review_count integer,            -- nullable, same reason
  price_level text,                -- nullable, same reason; matches the
                                    -- PRICE_LEVEL_* enum used elsewhere in
                                    -- api/locus-search.js
  maps_uri text NOT NULL,          -- always constructed server-side, never
                                    -- trusted from the model's own output
  why_trending text,
  source_url text NOT NULL,        -- the specific search result being cited
  last_confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city, name)
);

ALTER TABLE trending_places ENABLE ROW LEVEL SECURITY;

CREATE TABLE trending_places_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_at timestamptz NOT NULL DEFAULT now(),
  places_found integer,
  places_updated integer,
  errors jsonb,
  duration_ms integer
);

ALTER TABLE trending_places_runs ENABLE ROW LEVEL SECURITY;
