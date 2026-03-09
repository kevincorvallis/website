CREATE TABLE dispatch_comments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  issue text NOT NULL,
  name text NOT NULL,
  comment text NOT NULL,
  ip text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX dispatch_comments_issue_idx ON dispatch_comments (issue, created_at DESC);

ALTER TABLE dispatch_comments ENABLE ROW LEVEL SECURITY;

ALTER TABLE dispatch_comments
  ADD CONSTRAINT dispatch_comments_issue_length CHECK (length(issue) <= 20),
  ADD CONSTRAINT dispatch_comments_name_length CHECK (length(name) <= 100),
  ADD CONSTRAINT dispatch_comments_comment_length CHECK (length(comment) <= 2000),
  ADD CONSTRAINT dispatch_comments_ip_length CHECK (length(ip) <= 100);
