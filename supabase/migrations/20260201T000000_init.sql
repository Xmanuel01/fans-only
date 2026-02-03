-- Initial schema: profiles and age_gate_events with RLS

create extension if not exists "uuid-ossp";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  bio text,
  age_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists profiles_username_idx on public.profiles (lower(username));
create index if not exists profiles_age_confirmed_idx on public.profiles (age_confirmed_at);

alter table public.profiles enable row level security;

create policy "Profiles: self read"
  on public.profiles
  for select
  using (auth.uid() = id);

create policy "Profiles: self update"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Profiles: self insert"
  on public.profiles
  for insert
  with check (auth.uid() = id);

-- Age gate events
create table if not exists public.age_gate_events (
  id bigserial primary key,
  user_id uuid references auth.users (id) on delete set null,
  action text check (action in ('enter','exit')),
  user_agent text,
  ip inet,
  created_at timestamptz not null default now()
);

create index if not exists age_gate_events_user_idx on public.age_gate_events (user_id, created_at desc);

alter table public.age_gate_events enable row level security;

-- Allow authenticated users to read their own events
create policy "Age events: self read"
  on public.age_gate_events
  for select
  using (auth.uid() = user_id);

-- Allow anonymous or authenticated inserts; user_id must match auth uid when provided
create policy "Age events: insert"
  on public.age_gate_events
  for insert
  with check (
    (auth.uid() is null and user_id is null)
    or auth.uid() = user_id
  );

-- Service role can do anything (implicit via bypass RLS)

-- Feature requests
create table if not exists public.feature_requests (
  id bigserial primary key,
  user_id uuid references auth.users (id) on delete set null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists feature_requests_user_idx on public.feature_requests (user_id, created_at desc);

alter table public.feature_requests enable row level security;

create policy "Feature requests: owner select"
  on public.feature_requests
  for select
  using (auth.uid() = user_id);

create policy "Feature requests: insert self or anonymous"
  on public.feature_requests
  for insert
  with check (auth.uid() is null or auth.uid() = user_id);

-- Creators (for popular feed)
create table if not exists public.creators (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text unique not null,
  display_name text not null,
  avatar_url text,
  category text,
  popularity_score numeric default 0,
  created_at timestamptz not null default now()
);

create index if not exists creators_popularity_idx on public.creators (popularity_score desc);
create index if not exists creators_handle_idx on public.creators (lower(handle));

alter table public.creators enable row level security;

create policy "Creators: public select" on public.creators for select using (true);

create policy "Creators: self upsert" on public.creators
  for insert
  with check (auth.uid() = id);

create policy "Creators: self update" on public.creators
  for update using (auth.uid() = id) with check (auth.uid() = id);
