-- Remove wide-open anon INSERT policies (writes now go through serverless functions with service role key)
DROP POLICY IF EXISTS "Allow anon insert" ON chat_logs;
DROP POLICY IF EXISTS "Allow anon insert" ON dispatch_subscribers;

-- Add field-level constraints to chat_logs
ALTER TABLE chat_logs
  ADD CONSTRAINT chat_logs_question_length CHECK (length(question) <= 1000),
  ADD CONSTRAINT chat_logs_response_length CHECK (length(response) <= 5000),
  ADD CONSTRAINT chat_logs_ip_length CHECK (length(ip) <= 100);

-- Add field-level constraints to dispatch_subscribers
ALTER TABLE dispatch_subscribers
  ADD CONSTRAINT dispatch_subscribers_email_length CHECK (length(email) <= 254),
  ADD CONSTRAINT dispatch_subscribers_ip_length CHECK (length(ip) <= 100);
