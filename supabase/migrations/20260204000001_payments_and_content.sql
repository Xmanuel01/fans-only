-- Payments, subscriptions, content, and stricter age-gate policies
-- Generated 2026-02-04

begin;

-- Content tables
-- creators already exists; ensure columns
alter table public.creators
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.posts (
  id bigserial primary key,
  creator_id uuid not null references public.creators (id) on delete cascade,
  title text not null,
  body text,
  media jsonb default '[]'::jsonb,
  visibility text not null check (visibility in ('public','subscribers','ppv')),
  price_cents integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id bigserial primary key,
  post_id bigint not null references public.posts (id) on delete cascade,
  storage_path text not null,
  mime_type text,
  width integer,
  height integer,
  size_bytes integer,
  created_at timestamptz not null default now()
);

-- Payments & monetization
create table if not exists public.payments (
  id bigserial primary key,
  user_id uuid references public.profiles (id) on delete set null,
  creator_id uuid references public.creators (id) on delete set null,
  amount_cents integer not null,
  currency text not null default 'NGN',
  status text not null check (status in ('requires_action','requires_payment_method','succeeded','canceled','refunded')),
  provider text not null default 'paystack',
  provider_intent_id text unique not null,
  provider_event_id text,
  type text check (type in ('tip','subscription')),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tips (
  id bigserial primary key,
  from_user uuid references public.profiles (id) on delete set null,
  to_creator uuid references public.creators (id) on delete cascade,
  amount_cents integer not null,
  currency text not null default 'NGN',
  message text,
  payment_id bigint references public.payments (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id bigserial primary key,
  subscriber_id uuid references public.profiles (id) on delete cascade,
  creator_id uuid references public.creators (id) on delete cascade,
  status text not null check (status in ('active','canceled','expired')),
  current_period_end timestamptz,
  payment_id bigint references public.payments (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscriber_id, creator_id)
);

create table if not exists public.notifications (
  id bigserial primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  type text not null,
  payload jsonb not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigserial primary key,
  actor uuid references public.profiles (id) on delete set null,
  action text not null,
  subject text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists creators_handle_idx on public.creators (lower(handle));
create index if not exists creators_popularity_idx on public.creators (popularity_score desc);
create index if not exists posts_creator_idx on public.posts (creator_id, created_at desc);
create index if not exists payments_user_idx on public.payments (user_id, created_at desc);
create index if not exists payments_intent_idx on public.payments (provider_intent_id);
create index if not exists subscriptions_user_creator_idx on public.subscriptions (subscriber_id, creator_id);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- RLS
alter table public.creators enable row level security;
alter table public.posts enable row level security;
alter table public.media_assets enable row level security;
alter table public.payments enable row level security;
alter table public.tips enable row level security;
alter table public.subscriptions enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

-- Drop permissive public select and replace with age-verified access
drop policy if exists "Creators: public select" on public.creators;
drop policy if exists "Creators: age-verified select" on public.creators;
drop policy if exists "Creators: self upsert" on public.creators;
drop policy if exists "Creators: self update" on public.creators;

create policy "Creators: age-verified select"
  on public.creators
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.age_confirmed_at is not null
    )
    or auth.uid() = id
  );

create policy "Creators: self upsert" on public.creators
  for insert with check (auth.uid() = id);

create policy "Creators: self update" on public.creators
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Posts
drop policy if exists "Posts: select public age-verified or owner" on public.posts;
drop policy if exists "Posts: creator insert" on public.posts;
drop policy if exists "Posts: creator update" on public.posts;

create policy "Posts: select public age-verified or owner"
  on public.posts
  for select
  using (
    auth.uid() = creator_id
    or (
      visibility = 'public'
      and exists (select 1 from public.profiles p where p.id = auth.uid() and p.age_confirmed_at is not null)
    )
  );

create policy "Posts: creator insert"
  on public.posts
  for insert
  with check (auth.uid() = creator_id);

create policy "Posts: creator update"
  on public.posts
  for update
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

-- Media assets (inherit post visibility)
drop policy if exists "Media: select via post permission" on public.media_assets;
drop policy if exists "Media: creator manage" on public.media_assets;

create policy "Media: select via post permission"
  on public.media_assets
  for select
  using (
    exists (
      select 1 from public.posts p
      where p.id = media_assets.post_id
        and (
          auth.uid() = p.creator_id
          or (
            p.visibility = 'public'
            and exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.age_confirmed_at is not null)
          )
        )
    )
  );

create policy "Media: creator manage"
  on public.media_assets
  for all
  using (
    exists (
      select 1 from public.posts p
      where p.id = media_assets.post_id
        and auth.uid() = p.creator_id
    )
  )
  with check (
    exists (
      select 1 from public.posts p
      where p.id = media_assets.post_id
        and auth.uid() = p.creator_id
    )
  );

-- Payments: only service role (no policies) or specific views later
-- Subscriptions/Tips: same; managed through edge functions with service role

-- Notifications: user can read/update own
drop policy if exists "Notifications: self select" on public.notifications;
drop policy if exists "Notifications: self update" on public.notifications;

create policy "Notifications: self select"
  on public.notifications
  for select
  using (auth.uid() = user_id);

create policy "Notifications: self update"
  on public.notifications
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

commit;
