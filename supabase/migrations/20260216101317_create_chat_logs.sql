CREATE TABLE chat_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question text NOT NULL,
  response text,
  ip text,
  country text,
  city text,
  region text,
  user_agent text,
  referer text,
  language text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE chat_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon insert" ON chat_logs
  FOR INSERT TO anon
  WITH CHECK (true);
