-- Dispatch web platform: invitations table.
-- The existing Pookie Dispatch schema already owns profiles, articles, article_media-via-content_blocks,
-- recipients, etc. The web platform reuses all of those. The one piece that doesn't exist yet is the
-- invitation gate for the web sign-up flow (the iOS app has its own onboarding path).

create table if not exists "public"."invitations" (
  id         uuid primary key default gen_random_uuid(),
  email      text,
  code       text unique not null,
  used_by    uuid references auth.users(id) on delete set null,
  used_at    timestamptz,
  expires_at timestamptz,
  note       text,
  created_at timestamptz not null default now(),

  constraint invitations_code_length  check (length(code)  between 4 and 64),
  constraint invitations_email_length check (email is null or length(email) <= 254),
  constraint invitations_note_length  check (note  is null or length(note)  <= 200)
);

create unique index if not exists invitations_email_lower_idx
  on "public"."invitations" (lower(email))
  where email is not null;

alter table "public"."invitations" enable row level security;
-- No public policies. All access goes through Vercel Functions with the service role key.
