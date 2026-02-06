-- Create the advice_submissions table
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

CREATE TABLE IF NOT EXISTS advice_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url TEXT NOT NULL,
  cloudinary_id TEXT NOT NULL,
  ai_generated_text TEXT NOT NULL,
  submitter_note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE advice_submissions ENABLE ROW LEVEL SECURITY;

-- Public can insert (submit advice)
CREATE POLICY "Anyone can submit advice"
  ON advice_submissions
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Public can read approved advice only
CREATE POLICY "Anyone can read approved advice"
  ON advice_submissions
  FOR SELECT
  TO anon
  USING (status = 'approved');

-- Authenticated users (admin) can do everything
CREATE POLICY "Admin full access"
  ON advice_submissions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
