-- Distinguish weekly-newsletter signups from tool-notify (coming-soon waitlist) signups.
-- Existing rows are all newsletter subscribers, so the default backfills them correctly.
ALTER TABLE dispatch_subscribers
  ADD COLUMN source text NOT NULL DEFAULT 'newsletter'
  CONSTRAINT dispatch_subscribers_source_allowed CHECK (source IN ('newsletter', 'tool-notify'));

-- The two lists are separate: the same email may appear once per source.
DROP INDEX IF EXISTS dispatch_subscribers_email_idx;
CREATE UNIQUE INDEX dispatch_subscribers_email_source_idx
  ON dispatch_subscribers (lower(email), source);
