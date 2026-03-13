begin;

-- Creator pricing (KES)
alter table public.creators
  add column if not exists subscription_price_cents integer not null default 0,
  add column if not exists subscription_currency text not null default 'KES';

-- Post metadata for rating, stories, and currency
alter table public.posts
  add column if not exists content_rating text not null default 'sfw' check (content_rating in ('sfw', 'nsfw')),
  add column if not exists post_type text not null default 'post' check (post_type in ('post', 'story')),
  add column if not exists expires_at timestamptz,
  add column if not exists currency text not null default 'KES';

-- Subscriptions select policy for members
create policy "Subscriptions: self select"
  on public.subscriptions
  for select
  using (auth.uid() = subscriber_id);

-- Refresh creator policies with age confirmation requirement
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

create policy "Creators: self upsert"
  on public.creators
  for insert
  with check (
    auth.uid() = id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.age_confirmed_at is not null
    )
  );

create policy "Creators: self update"
  on public.creators
  for update
  using (
    auth.uid() = id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.age_confirmed_at is not null
    )
  )
  with check (
    auth.uid() = id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.age_confirmed_at is not null
    )
  );

-- Refresh post policies with subscriber access
drop policy if exists "Posts: select public age-verified or owner" on public.posts;
drop policy if exists "Posts: creator insert" on public.posts;
drop policy if exists "Posts: creator update" on public.posts;

create policy "Posts: select public/subscriber age-verified or owner"
  on public.posts
  for select
  using (
    auth.uid() = creator_id
    or (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.age_confirmed_at is not null
      )
      and (
        visibility = 'public'
        or (
          visibility = 'subscribers'
          and exists (
            select 1 from public.subscriptions s
            where s.creator_id = posts.creator_id
              and s.subscriber_id = auth.uid()
              and s.status = 'active'
              and (s.current_period_end is null or s.current_period_end > now())
          )
        )
      )
    )
  );

create policy "Posts: creator insert"
  on public.posts
  for insert
  with check (
    auth.uid() = creator_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.age_confirmed_at is not null
    )
  );

create policy "Posts: creator update"
  on public.posts
  for update
  using (
    auth.uid() = creator_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.age_confirmed_at is not null
    )
  )
  with check (
    auth.uid() = creator_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.age_confirmed_at is not null
    )
  );

-- Refresh media policies with subscriber access
drop policy if exists "Media: select via post permission" on public.media_assets;
drop policy if exists "Media: creator manage" on public.media_assets;

create policy "Media: select via post permission"
  on public.media_assets
  for select
  using (
    exists (
      select 1
      from public.posts p
      left join public.subscriptions s
        on s.creator_id = p.creator_id
        and s.subscriber_id = auth.uid()
        and s.status = 'active'
        and (s.current_period_end is null or s.current_period_end > now())
      where p.id = media_assets.post_id
        and (
          auth.uid() = p.creator_id
          or (
            p.visibility = 'public'
            and exists (
              select 1 from public.profiles pr
              where pr.id = auth.uid()
                and pr.age_confirmed_at is not null
            )
          )
          or (
            p.visibility = 'subscribers'
            and s.id is not null
            and exists (
              select 1 from public.profiles pr
              where pr.id = auth.uid()
                and pr.age_confirmed_at is not null
            )
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
        and p.creator_id = auth.uid()
    )
    and exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid()
        and pr.age_confirmed_at is not null
    )
  )
  with check (
    exists (
      select 1 from public.posts p
      where p.id = media_assets.post_id
        and p.creator_id = auth.uid()
    )
    and exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid()
        and pr.age_confirmed_at is not null
    )
  );

-- Creator stats + recommendations
create or replace view public.creator_stats as
select
  c.id as creator_id,
  (
    select count(*)
    from public.subscriptions s
    where s.creator_id = c.id
      and s.status = 'active'
      and (s.current_period_end is null or s.current_period_end > now())
  ) as subscriber_count,
  (
    select count(*)
    from public.posts p
    where p.creator_id = c.id
      and p.created_at > now() - interval '30 days'
  ) as recent_post_count
from public.creators c;

create or replace function public.get_recommended_creators(
  search_term text default null,
  category text default null,
  limit_count integer default 12
)
returns table (
  id uuid,
  handle text,
  display_name text,
  avatar_url text,
  category text,
  popularity_score numeric,
  subscription_price_cents integer,
  subscription_currency text,
  score numeric
)
language sql
stable
as $$
  select
    c.id,
    c.handle,
    c.display_name,
    c.avatar_url,
    c.category,
    c.popularity_score,
    c.subscription_price_cents,
    c.subscription_currency,
    (
      coalesce(c.popularity_score, 0)
      + ln(coalesce(cs.subscriber_count, 0)::numeric + 1)
      + (coalesce(cs.recent_post_count, 0) * 0.1)
    ) as score
  from public.creators c
  left join public.creator_stats cs on cs.creator_id = c.id
  where (search_term is null or c.handle ilike '%' || search_term || '%' or c.display_name ilike '%' || search_term || '%')
    and (category is null or category = 'All' or c.category = category)
  order by score desc nulls last
  limit coalesce(limit_count, 12);
$$;

-- Storage bucket + policies
insert into storage.buckets (id, name, public)
values ('creator-media', 'creator-media', false)
on conflict (id) do nothing;

create policy "Creator media: insert own"
  on storage.objects
  for insert
  with check (
    bucket_id = 'creator-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Creator media: select via post"
  on storage.objects
  for select
  using (
    bucket_id = 'creator-media'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or exists (
        select 1
        from public.media_assets ma
        join public.posts p on p.id = ma.post_id
        left join public.subscriptions s
          on s.creator_id = p.creator_id
          and s.subscriber_id = auth.uid()
          and s.status = 'active'
          and (s.current_period_end is null or s.current_period_end > now())
        where ma.storage_path = storage.objects.name
          and (
            auth.uid() = p.creator_id
            or (
              p.visibility = 'public'
              and exists (
                select 1 from public.profiles pr
                where pr.id = auth.uid()
                  and pr.age_confirmed_at is not null
              )
            )
            or (
              p.visibility = 'subscribers'
              and s.id is not null
              and exists (
                select 1 from public.profiles pr
                where pr.id = auth.uid()
                  and pr.age_confirmed_at is not null
              )
            )
          )
      )
    )
  );

create policy "Creator media: update own"
  on storage.objects
  for update
  using (
    bucket_id = 'creator-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Creator media: delete own"
  on storage.objects
  for delete
  using (
    bucket_id = 'creator-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

commit;
