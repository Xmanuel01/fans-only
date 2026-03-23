begin;

create unique index if not exists user_wallet_ledger_credit_topup_payment_unique_idx
  on public.user_wallet_ledger (payment_id, entry_type)
  where payment_id is not null and entry_type = 'credit_topup';

create unique index if not exists creator_balance_ledger_credit_payment_unique_idx
  on public.creator_balance_ledger (payment_id, entry_type)
  where payment_id is not null and entry_type = 'credit_payment';

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
declare
  v_wallet public.user_wallets%rowtype;
begin
  if p_amount_minor <= 0 then
    raise exception 'credit amount must be > 0';
  end if;

  insert into public.user_wallets (user_id, currency, available_amount_minor, pending_amount_minor, updated_at)
  values (p_user_id, p_currency, 0, 0, now())
  on conflict (user_id) do nothing;

  select *
    into v_wallet
  from public.user_wallets
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'user wallet not found';
  end if;

  if v_wallet.currency <> p_currency then
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
  )
  on conflict do nothing;

  if not found then
    return;
  end if;

  update public.user_wallets
  set available_amount_minor = available_amount_minor + p_amount_minor,
      updated_at = now()
  where user_id = p_user_id;
end;
$$;

revoke all on function public.credit_user_wallet(uuid, bigint, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.credit_user_wallet(uuid, bigint, text, bigint, jsonb) to service_role;

create or replace function public.credit_creator_balance(
  p_creator_id uuid,
  p_amount_minor bigint,
  p_currency text,
  p_payment_id bigint,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance public.creator_balances%rowtype;
begin
  if p_amount_minor <= 0 then
    raise exception 'credit amount must be > 0';
  end if;

  insert into public.creator_balances (creator_id, currency, available_amount_minor, pending_amount_minor, updated_at)
  values (p_creator_id, p_currency, 0, 0, now())
  on conflict (creator_id) do nothing;

  select *
    into v_balance
  from public.creator_balances
  where creator_id = p_creator_id
  for update;

  if not found then
    raise exception 'creator balance not found';
  end if;

  if v_balance.currency <> p_currency then
    raise exception 'currency mismatch for creator balance';
  end if;

  insert into public.creator_balance_ledger (
    creator_id,
    payment_id,
    entry_type,
    amount_minor,
    currency,
    metadata
  ) values (
    p_creator_id,
    p_payment_id,
    'credit_payment',
    p_amount_minor,
    p_currency,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict do nothing;

  if not found then
    return;
  end if;

  update public.creator_balances
  set available_amount_minor = available_amount_minor + p_amount_minor,
      updated_at = now()
  where creator_id = p_creator_id;
end;
$$;

revoke all on function public.credit_creator_balance(uuid, bigint, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.credit_creator_balance(uuid, bigint, text, bigint, jsonb) to service_role;

commit;
