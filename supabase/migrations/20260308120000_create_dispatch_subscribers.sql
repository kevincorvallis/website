CREATE TABLE dispatch_subscribers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL,
  ip text,
  country text,
  city text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Prevent duplicate emails
CREATE UNIQUE INDEX dispatch_subscribers_email_idx ON dispatch_subscribers (lower(email));

ALTER TABLE dispatch_subscribers ENABLE ROW LEVEL SECURITY;

-- Anon can only insert
CREATE POLICY "Allow anon insert" ON dispatch_subscribers
  FOR INSERT TO anon
  WITH CHECK (true);
