create or replace function public.get_creator_subscribers(
  p_status text default 'active'
)
returns table (
  subscriber_id uuid,
  display_name text,
  username text,
  avatar_url text,
  status text,
  current_period_end timestamptz,
  subscribed_at timestamptz,
  amount_cents integer,
  currency text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.creators c
    where c.id = current_uid
  ) then
    raise exception 'Creator account required';
  end if;

  return query
  select
    p.id as subscriber_id,
    p.display_name,
    p.username,
    p.avatar_url,
    s.status,
    s.current_period_end,
    s.created_at as subscribed_at,
    pay.amount_cents,
    pay.currency
  from public.subscriptions s
  join public.profiles p on p.id = s.subscriber_id
  left join public.payments pay on pay.id = s.payment_id
  where s.creator_id = current_uid
    and (
      p_status = 'all'
      or (p_status = 'active' and s.status = 'active' and (s.current_period_end is null or s.current_period_end > now()))
      or (p_status = 'expired' and (s.status = 'expired' or (s.current_period_end is not null and s.current_period_end <= now())))
    )
  order by
    case
      when s.status = 'active' and (s.current_period_end is null or s.current_period_end > now()) then 0
      else 1
    end,
    s.created_at desc,
    coalesce(p.display_name, p.username, p.id::text);
end;
$$;

revoke all on function public.get_creator_subscribers(text) from public;
grant execute on function public.get_creator_subscribers(text) to authenticated;
