begin;

alter table public.user_wallet_ledger
  drop constraint if exists user_wallet_ledger_entry_type_check;

alter table public.user_wallet_ledger
  add constraint user_wallet_ledger_entry_type_check
  check (entry_type in ('credit_topup', 'debit_ppv', 'debit_tip', 'debit_subscription', 'refund'));

create or replace function public.purchase_subscription(
  p_creator_id uuid
) returns table (
  subscription_id bigint,
  payment_id bigint,
  new_balance_minor bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_creator public.creators%rowtype;
  v_wallet public.user_wallets%rowtype;
  v_amount bigint;
  v_currency text;
  v_payment_id bigint := null;
  v_subscription public.subscriptions%rowtype;
  v_now timestamptz := now();
  v_period_end timestamptz := now() + interval '1 month';
  v_provider_intent_id text;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if v_user_id = p_creator_id then
    raise exception 'cannot subscribe to your own creator account';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.age_confirmed_at is not null
  ) then
    raise exception 'age confirmation required';
  end if;

  select *
    into v_creator
  from public.creators
  where id = p_creator_id;

  if not found then
    raise exception 'creator not found';
  end if;

  select *
    into v_subscription
  from public.subscriptions
  where subscriber_id = v_user_id
    and creator_id = p_creator_id
  for update;

  if found and v_subscription.status = 'active' and (v_subscription.current_period_end is null or v_subscription.current_period_end > v_now) then
    subscription_id := v_subscription.id;
    payment_id := v_subscription.payment_id;

    select available_amount_minor
      into new_balance_minor
    from public.user_wallets
    where user_id = v_user_id;

    new_balance_minor := coalesce(new_balance_minor, 0);
    return next;
    return;
  end if;

  v_amount := greatest(coalesce(v_creator.subscription_price_cents, 0), 0);
  v_currency := coalesce(v_creator.subscription_currency, 'KES');

  if v_amount > 0 then
    select *
      into v_wallet
    from public.user_wallets
    where user_id = v_user_id
    for update;

    if not found then
      insert into public.user_wallets (user_id, currency, available_amount_minor, pending_amount_minor, updated_at)
      values (v_user_id, v_currency, 0, 0, v_now)
      returning * into v_wallet;
    end if;

    if v_wallet.currency <> v_currency then
      raise exception 'wallet currency mismatch';
    end if;

    if v_wallet.available_amount_minor < v_amount then
      raise exception 'insufficient wallet balance';
    end if;

    v_provider_intent_id := concat(
      'wallet_sub_',
      replace(v_user_id::text, '-', ''),
      '_',
      replace(p_creator_id::text, '-', ''),
      '_',
      floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text
    );

    insert into public.payments (
      user_id,
      creator_id,
      amount_cents,
      currency,
      status,
      provider,
      provider_intent_id,
      type,
      metadata,
      created_at,
      updated_at
    ) values (
      v_user_id,
      p_creator_id,
      v_amount::int,
      v_currency,
      'succeeded',
      'wallet',
      v_provider_intent_id,
      'subscription',
      jsonb_build_object('source', 'wallet_subscription'),
      v_now,
      v_now
    )
    returning id into v_payment_id;

    update public.user_wallets
    set available_amount_minor = available_amount_minor - v_amount,
        updated_at = v_now
    where user_id = v_user_id;

    insert into public.user_wallet_ledger (
      user_id,
      payment_id,
      entry_type,
      amount_minor,
      currency,
      metadata
    ) values (
      v_user_id,
      v_payment_id,
      'debit_subscription',
      v_amount,
      v_currency,
      jsonb_build_object('source', 'wallet_subscription', 'creator_id', p_creator_id)
    );

    perform public.credit_creator_balance(
      p_creator_id,
      v_amount,
      v_currency,
      v_payment_id,
      jsonb_build_object('source', 'wallet_subscription')
    );
  end if;

  insert into public.subscriptions (
    subscriber_id,
    creator_id,
    status,
    current_period_end,
    payment_id,
    created_at,
    updated_at
  ) values (
    v_user_id,
    p_creator_id,
    'active',
    v_period_end,
    v_payment_id,
    v_now,
    v_now
  )
  on conflict (subscriber_id, creator_id) do update
    set status = 'active',
        current_period_end = excluded.current_period_end,
        payment_id = excluded.payment_id,
        updated_at = excluded.updated_at
  returning * into v_subscription;

  subscription_id := v_subscription.id;
  payment_id := v_payment_id;

  select available_amount_minor
    into new_balance_minor
  from public.user_wallets
  where user_id = v_user_id;

  new_balance_minor := coalesce(new_balance_minor, 0);
  return next;
end;
$$;

revoke all on function public.purchase_subscription(uuid) from public, anon;
grant execute on function public.purchase_subscription(uuid) to authenticated;

commit;
