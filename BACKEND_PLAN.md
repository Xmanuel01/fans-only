# Backend Architecture & Data Model (Plan)

Scope: outline minimal backend to support non-public mutations (tips/payments, audit logging) while keeping the UI static-first. Uses Supabase (PostgreSQL + Auth) plus optional edge functions.

## Stack choices
- **Supabase**: Postgres, Auth, Storage, Edge Functions (Deno). RLS for all tables.
- **Edge Functions**: handle payment intents, webhooks, and any privileged writes using the `service_role` key (never exposed to the client).
- **Client**: calls public selects via anon key; all writes that need trust go through Edge Functions.

## Migration workflow
- Install Supabase CLI (`npm i -g supabase` or brew).
- Auth to your project: `supabase login` and set `SUPABASE_PROJECT_ID`.
- Create migration: `supabase db diff --project-ref $SUPABASE_PROJECT_ID --schema public --file supabase/migrations/$(date +%s)_name.sql`.
- Apply locally: `supabase db push` (uses local dev DB) or `supabase db reset` to rebuild.
- CI step: run `supabase db lint` (once rules are added) and `supabase db push --dry-run` to ensure migrations apply.
- Store all migration SQL in `supabase/migrations/` committed to git.

## Data model (initial)

### auth & profiles
- `profiles` (id uuid PK references auth.users, username text unique, display_name text, avatar_url text, bio text, age_confirmed_at timestamptz, created_at timestamptz default now()).
- RLS: users can select/update their own row; public cannot select without auth; admins role can manage all.
- Index: unique (username lower). Index on (age_confirmed_at).

### content
- `creators` (id uuid PK references profiles, handle text unique, payout_status text, created_at timestamptz).
- `posts` (id bigserial PK, creator_id uuid FK -> creators, title text, body text, media jsonb[], visibility text check in ('public','subscribers','ppv'), price_cents int default 0, created_at timestamptz default now()).
- `media_assets` (id bigserial PK, post_id bigint FK -> posts, storage_path text, mime_type text, width int, height int, size_bytes int, created_at timestamptz default now()).
- `subscriptions` (id bigserial PK, subscriber_id uuid FK -> profiles, creator_id uuid FK -> creators, status text check in ('active','canceled','expired'), current_period_end timestamptz, created_at timestamptz).
- `notifications` (id bigserial PK, user_id uuid FK -> profiles, type text, payload jsonb, read_at timestamptz, created_at timestamptz default now()).
- Indexes: posts (creator_id, created_at desc), subscriptions (subscriber_id, creator_id unique), notifications (user_id, read_at nulls first, created_at desc), media_assets (post_id).

### payments & tips
- `payments` (id bigserial PK, user_id uuid FK -> profiles, creator_id uuid FK -> creators, amount_cents int, currency text(3), status text check in ('requires_payment_method','requires_action','succeeded','canceled','refunded'), provider text default 'stripe', provider_intent_id text unique, created_at timestamptz).
- `tips` (id bigserial PK, from_user uuid FK -> profiles, to_creator uuid FK -> creators, amount_cents int, currency text(3), message text, payment_id bigint FK -> payments, created_at timestamptz).
- Indexes: payments (user_id, created_at desc), payments (provider_intent_id unique), tips (to_creator, created_at desc).

### audit & age gate
- `age_gate_events` (id bigserial PK, user_id uuid FK -> profiles null, action text check in ('enter','exit'), user_agent text, ip inet, created_at timestamptz default now()).
- `audit_log` (id bigserial PK, actor uuid FK -> profiles, action text, subject text, metadata jsonb, created_at timestamptz default now()).
- Indexes: age_gate_events (user_id, created_at desc); audit_log (actor, created_at desc).

## RLS policy sketch
- `profiles`: enable RLS; policy "self read/write" using `auth.uid() = id`; admins via custom role claim.
- `creators`: insert/update only by owner (matching auth.uid); select public where creator is published (add `is_live boolean`). 
- `posts`: select policy: public only if visibility='public'; subscribers policy checks subscription active; creator can manage own posts.
- `media_assets`: same visibility as parent post via FK join using `with check (exists ...)`.
- `subscriptions`: user can see own subscriptions; creator can see subscribers (on limited fields); inserts only via edge function after payment succeeds.
- `payments`/`tips`: insert/select only via edge function using service role; clients never directly insert.
- `notifications`: user can select/update their own rows.
- `age_gate_events`: insert via anonymous (allow), but write policy captures `auth.uid()` when present.
- `audit_log`: insert only via service role; no select for clients.

## Edge Functions / serverless endpoints
- `create-payment-intent`: input (creator_id, amount, type=tips|subscription); calls Stripe, stores pending row in `payments`, returns client secret.
- `stripe-webhook`: verifies signature, updates `payments` status, creates `subscriptions` or `tips` records, enqueues notifications.
- `mark-age-confirmed`: server-side update of `profiles.age_confirmed_at` for consistency with audit logging.
- `notify`: queues notifications; can be reused for system events.

## CI hooks (add later)
- Step before build: `supabase db lint` (once rules exist).
- After migrations change: run `supabase db push --dry-run` to validate.
- Optionally run RLS policy tests with `pg_prove` or Supabase test harness.

## Next concrete tasks
1) Initialize `supabase/` folder via `supabase init`; commit config.
2) Create first migration adding `profiles`, `age_gate_events` with RLS policies.
3) Add GitHub Action step to install Supabase CLI and run lint/push --dry-run on PRs.
4) Implement edge functions for payments and age confirmation; deploy via `supabase functions deploy`.
