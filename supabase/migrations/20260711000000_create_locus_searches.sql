CREATE TABLE locus_searches (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  query text NOT NULL,
  response jsonb,
  ip text,
  country text,
  city text,
  region text,
  user_agent text,
  referer text,
  language text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE locus_searches ENABLE ROW LEVEL SECURITY;

ALTER TABLE locus_searches
  ADD CONSTRAINT locus_searches_query_length CHECK (length(query) <= 300),
  ADD CONSTRAINT locus_searches_ip_length CHECK (length(ip) <= 100);
