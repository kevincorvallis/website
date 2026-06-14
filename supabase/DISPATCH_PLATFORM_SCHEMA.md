# Dispatch platform — database schema dependency

> Captured 2026-06-14 by introspecting the live PostgREST OpenAPI spec
> (`GET /rest/v1/`) of Supabase project `nmkavdrvgjkolreoexfe`.

## Important: this is a SHARED database

This Supabase project also backs the **Pookie Dispatch iOS app** — it has ~50 tables
(`events`, `check_ins`, `mountain_status`, `connections`, `push_tokens`, `notifications`,
`bookmarks`, …). The web platform (this repo) **reuses** two of the iOS app's tables —
`profiles` and `articles` — and owns one of its own, `invitations`.

**Do NOT write `CREATE TABLE profiles/articles` migrations in this repo.** They already
exist and are owned by the iOS app's schema; recreating them would conflict and would be
lower-fidelity than the source. This file documents the contract the web code depends on.
For an authoritative, complete dump, run `supabase db dump --schema public` against the
project (needs the DB password, not just the service-role key).

## `profiles` (shared with iOS app)

Web code reads only `id`, `handle`, `display_name` (api/articles.js, api/auth/claim-username.js).
Full live columns:

| column | type | not null | notes |
|---|---|---|---|
| id | uuid | yes | PK (→ auth.users.id) |
| handle | text | **no** | the @handle; nullable — see trigger note |
| handle_set_at | timestamptz | no | |
| display_name | text | no | |
| email | text | no | |
| avatar_url | text | no | |
| bio | text | no | |
| writing_vibe | enum `public.writing_vibe` | no | iOS-app field; values not captured |
| preferred_language | text | no | |
| phone_hash | text | no | iOS-app field |
| onboarding_completed_at | timestamptz | no | iOS-app field |
| created_at | timestamptz | yes | |

**Trigger gotcha:** a DB trigger auto-creates a `profiles` row (with `handle = NULL`) when
an `auth.users` row is created. So a freshly signed-up user already has a handle-less profile;
the claim-username flow (and the e2e provisioner) must UPDATE the handle, not assume an insert.

## `articles` (shared with iOS app)

Web code maps `title` → `title_en`, `body_json` → `content_blocks` (api/articles.js).
Full live columns:

| column | type | not null | notes |
|---|---|---|---|
| id | bigint | yes | PK (identity) |
| author_id | uuid | yes | FK → `profiles.id` |
| slug | text | yes | unique per author (server-generated from title on create) |
| title_en | text | no | |
| title_ko | text | no | |
| description_en | text | no | |
| description_ko | text | no | |
| cover_image_url | text | no | |
| content_blocks | jsonb | yes | the block array (cover/chapter/prose/photo/video/audio/quote/field-card/photo-grid) |
| status | enum `public.article_status` | yes | values: `draft` \| `published` \| `sent` |
| published_at | timestamptz | no | set on publish |
| deliver_at | timestamptz | no | iOS-app scheduling field |
| notified_at | timestamptz | no | iOS-app notification field |
| created_at | timestamptz | yes | |

Reader (`/@handle/slug` via api/render.js) and the editor both speak `content_blocks`.
`article_media` (proposed in the platform plan) was **never created** — media URLs live
inline in `content_blocks` photo/video blocks.

## `invitations` (web-owned)

Tracked migration: `supabase/migrations/20260526000000_create_invitations.sql`.
**Drift:** the live table has an extra `note text` column not in that migration. If you
rebuild from migrations, add it (`alter table invitations add column if not exists note text;`).

| column | type | not null |
|---|---|---|
| id | uuid | yes (PK) |
| email | text | no |
| code | text | yes |
| used_by | uuid | no |
| used_at | timestamptz | no |
| expires_at | timestamptz | no |
| note | text | no |
| created_at | timestamptz | yes |

## How to re-capture

```bash
bash tests/e2e/dump-schema.sh          # prints columns/types/PK/FK/NOT-NULL for the tables
# or, for a full authoritative DDL dump (needs DB password):
supabase db dump --schema public
```
