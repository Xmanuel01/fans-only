begin;

-- Extend payments type support
alter table public.payments
  drop constraint if exists payments_type_check;

alter table public.payments
  add constraint payments_type_check
  check (type in ('tip', 'subscription', 'ppv', 'wallet_topup'));

-- User wallet balances + ledger
create table if not exists public.user_wallets (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  currency text not null default 'KES',
  available_amount_minor bigint not null default 0,
  pending_amount_minor bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_wallet_ledger (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  payment_id bigint references public.payments (id) on delete set null,
  post_id bigint references public.posts (id) on delete set null,
  entry_type text not null check (entry_type in ('credit_topup', 'debit_ppv', 'debit_tip', 'refund')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_wallet_ledger_user_created_idx
  on public.user_wallet_ledger (user_id, created_at desc);

alter table public.user_wallets enable row level security;
alter table public.user_wallet_ledger enable row level security;

create policy "User wallets: self select"
  on public.user_wallets
  for select
  using (auth.uid() = user_id);

create policy "User wallet ledger: self select"
  on public.user_wallet_ledger
  for select
  using (auth.uid() = user_id);

-- PPV purchases
create table if not exists public.ppv_purchases (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id bigint not null references public.posts (id) on delete cascade,
  creator_id uuid not null references public.creators (id) on delete cascade,
  amount_cents integer not null,
  currency text not null default 'KES',
  payment_id bigint references public.payments (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, post_id)
);

create index if not exists ppv_purchases_user_idx
  on public.ppv_purchases (user_id, created_at desc);
create index if not exists ppv_purchases_creator_idx
  on public.ppv_purchases (creator_id, created_at desc);

alter table public.ppv_purchases enable row level security;

create policy "PPV purchases: self select"
  on public.ppv_purchases
  for select
  using (auth.uid() = user_id);

-- Update post select policy to include PPV (metadata)
drop policy if exists "Posts: select public/subscriber age-verified or owner" on public.posts;
drop policy if exists "Posts: select public/subscriber/ppv age-verified or owner" on public.posts;

create policy "Posts: select public/subscriber/ppv age-verified or owner"
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
        or visibility = 'ppv'
      )
    )
  );

-- Update media policy to include PPV purchases
drop policy if exists "Media: select via post permission" on public.media_assets;

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
      left join public.ppv_purchases ppv
        on ppv.post_id = p.id
        and ppv.user_id = auth.uid()
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
          or (
            p.visibility = 'ppv'
            and ppv.id is not null
            and exists (
              select 1 from public.profiles pr
              where pr.id = auth.uid()
                and pr.age_confirmed_at is not null
            )
          )
        )
    )
  );

-- Update storage policy to include PPV purchases
drop policy if exists "Creator media: select via post" on storage.objects;

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
        left join public.ppv_purchases ppv
          on ppv.post_id = p.id
          and ppv.user_id = auth.uid()
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
            or (
              p.visibility = 'ppv'
              and ppv.id is not null
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

-- Wallet credit (service role)
create or replace function public.credit_user_wallet(
  p_user_id uuid,
  p_amount_minor bigint,
  p_currency text,
  p_payment_id bigint,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount_minor <= 0 then
    raise exception 'credit amount must be > 0';
  end if;

  insert into public.user_wallets (user_id, currency, available_amount_minor, pending_amount_minor, updated_at)
  values (p_user_id, p_currency, p_amount_minor, 0, now())
  on conflict (user_id)
  do update set
    available_amount_minor = public.user_wallets.available_amount_minor + excluded.available_amount_minor,
    currency = excluded.currency,
    updated_at = now()
  where public.user_wallets.currency = excluded.currency;

  if not found then
    raise exception 'currency mismatch for user wallet';
  end if;

  insert into public.user_wallet_ledger (
    user_id,
    payment_id,
    entry_type,
    amount_minor,
    currency,
    metadata
  ) values (
    p_user_id,
    p_payment_id,
    'credit_topup',
    p_amount_minor,
    p_currency,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.credit_user_wallet(uuid, bigint, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.credit_user_wallet(uuid, bigint, text, bigint, jsonb) to service_role;

-- PPV purchase via wallet
create or replace function public.purchase_ppv(
  p_post_id bigint
) returns table (
  purchase_id bigint,
  new_balance_minor bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_post record;
  v_wallet public.user_wallets%rowtype;
  v_amount bigint;
  v_currency text;
  v_payment_id bigint;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.age_confirmed_at is not null
  ) then
    raise exception 'age confirmation required';
  end if;

  select p.id, p.creator_id, p.price_cents, p.currency, p.visibility
    into v_post
  from public.posts p
  where p.id = p_post_id;

  if not found then
    raise exception 'post not found';
  end if;

  if v_post.visibility <> 'ppv' then
    raise exception 'post is not ppv';
  end if;

  v_amount := coalesce(v_post.price_cents, 0);
  if v_amount <= 0 then
    raise exception 'ppv price missing';
  end if;
  v_currency := coalesce(v_post.currency, 'KES');

  if exists (
    select 1 from public.ppv_purchases ppv
    where ppv.user_id = v_user_id and ppv.post_id = p_post_id
  ) then
    return query
      select ppv.id, uw.available_amount_minor
      from public.ppv_purchases ppv
      join public.user_wallets uw on uw.user_id = v_user_id
      where ppv.user_id = v_user_id and ppv.post_id = p_post_id;
    return;
  end if;

  select * into v_wallet
  from public.user_wallets
  where user_id = v_user_id
  for update;

  if not found then
    insert into public.user_wallets (user_id, currency, available_amount_minor, pending_amount_minor, updated_at)
    values (v_user_id, v_currency, 0, 0, now())
    returning * into v_wallet;
  end if;

  if v_wallet.currency <> v_currency then
    raise exception 'wallet currency mismatch';
  end if;

  if v_wallet.available_amount_minor < v_amount then
    raise exception 'insufficient wallet balance';
  end if;

  insert into public.payments (
    user_id,
    creator_id,
    amount_cents,
    currency,
    status,
    provider,
    type,
    metadata
  ) values (
    v_user_id,
    v_post.creator_id,
    v_amount::int,
    v_currency,
    'succeeded',
    'wallet',
    'ppv',
    jsonb_build_object('post_id', p_post_id)
  )
  returning id into v_payment_id;

  update public.user_wallets
  set available_amount_minor = available_amount_minor - v_amount,
      updated_at = now()
  where user_id = v_user_id;

  insert into public.user_wallet_ledger (
    user_id,
    payment_id,
    post_id,
    entry_type,
    amount_minor,
    currency,
    metadata
  ) values (
    v_user_id,
    v_payment_id,
    p_post_id,
    'debit_ppv',
    v_amount,
    v_currency,
    jsonb_build_object('source', 'wallet_ppv')
  );

  insert into public.ppv_purchases (
    user_id,
    post_id,
    creator_id,
    amount_cents,
    currency,
    payment_id
  ) values (
    v_user_id,
    p_post_id,
    v_post.creator_id,
    v_amount::int,
    v_currency,
    v_payment_id
  )
  returning id into purchase_id;

  perform public.credit_creator_balance(
    v_post.creator_id,
    v_amount,
    v_currency,
    v_payment_id,
    jsonb_build_object('source', 'ppv_wallet', 'post_id', p_post_id)
  );

  select available_amount_minor
    into new_balance_minor
  from public.user_wallets
  where user_id = v_user_id;

  return next;
end;
$$;

revoke all on function public.purchase_ppv(bigint) from public, anon;
grant execute on function public.purchase_ppv(bigint) to authenticated;

commit;
