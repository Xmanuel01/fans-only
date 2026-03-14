begin;

alter table public.creators
  add column if not exists categories text[];

update public.creators
set categories = array[category]
where category is not null
  and coalesce(cardinality(categories), 0) = 0;

create index if not exists creators_categories_gin_idx on public.creators using gin (categories);

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
      + ln(coalesce(cs.recent_revenue_minor, 0)::numeric / 100 + 1)
    ) as score
  from public.creators c
  left join public.creator_stats cs on cs.creator_id = c.id
  where (
      search_term is null
      or c.handle ilike '%' || search_term || '%'
      or c.display_name ilike '%' || search_term || '%'
    )
    and (
      category is null
      or category = 'All'
      or c.category = category
      or category = any(coalesce(c.categories, '{}'::text[]))
    )
  order by score desc nulls last
  limit coalesce(limit_count, 12);
$$;

commit;
