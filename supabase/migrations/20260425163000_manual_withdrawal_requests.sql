begin;

create table if not exists public.creator_withdrawal_methods (
  creator_id uuid not null references public.creators (id) on delete cascade,
  method text not null check (method in ('mobile_money', 'bank')),
  currency text not null default 'KES',
  account_name text not null,
  bank_name text,
  bank_code text,
  account_number text,
  phone_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (creator_id, method),
  constraint creator_withdrawal_methods_shape_check
    check (
      (method = 'mobile_money' and phone_number is not null and bank_code is not null and account_number is null)
      or
      (method = 'bank' and account_number is not null and bank_code is not null and phone_number is null)
    )
);

create index if not exists creator_withdrawal_methods_creator_updated_idx
  on public.creator_withdrawal_methods (creator_id, updated_at desc);

alter table public.creator_withdrawal_methods enable row level security;

drop policy if exists "Withdrawal methods: self select" on public.creator_withdrawal_methods;
create policy "Withdrawal methods: self select"
  on public.creator_withdrawal_methods
  for select
  using (auth.uid() = creator_id);

create or replace function public.request_creator_payout(
  p_creator_id uuid,
  p_amount_minor bigint,
  p_currency text,
  p_recipient_code text,
  p_reason text,
  p_requested_by uuid,
  p_idempotency_key text,
  p_reference text,
  p_metadata jsonb default '{}'::jsonb
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance public.creator_balances%rowtype;
  v_transfer_id bigint;
  v_provider text := coalesce(p_metadata->>'provider', 'paystack');
begin
  if p_amount_minor <= 0 then
    raise exception 'payout amount must be > 0';
  end if;

  if p_amount_minor < 100000 then
    raise exception 'minimum payout amount is 1000 KES';
  end if;

  if v_provider not in ('paystack') then
    raise exception 'invalid payout provider';
  end if;

  select *
  into v_balance
  from public.creator_balances
  where creator_id = p_creator_id
  for update;

  if not found then
    raise exception 'creator balance not found';
  end if;

  if v_balance.currency <> p_currency then
    raise exception 'currency mismatch for creator payout';
  end if;

  if v_balance.available_amount_minor < p_amount_minor then
    raise exception 'insufficient available balance';
  end if;

  update public.creator_balances
  set
    available_amount_minor = available_amount_minor - p_amount_minor,
    pending_amount_minor = pending_amount_minor + p_amount_minor,
    updated_at = now()
  where creator_id = p_creator_id;

  insert into public.payout_transfers (
    creator_id,
    requested_by,
    amount_minor,
    currency,
    recipient_code,
    reference,
    idempotency_key,
    status,
    reason,
    provider,
    metadata,
    updated_at
  ) values (
    p_creator_id,
    p_requested_by,
    p_amount_minor,
    p_currency,
    p_recipient_code,
    p_reference,
    p_idempotency_key,
    'queued',
    p_reason,
    v_provider,
    coalesce(p_metadata, '{}'::jsonb),
    now()
  )
  returning id into v_transfer_id;

  insert into public.creator_balance_ledger (
    creator_id,
    payout_transfer_id,
    entry_type,
    amount_minor,
    currency,
    metadata
  ) values (
    p_creator_id,
    v_transfer_id,
    'debit_payout',
    p_amount_minor,
    p_currency,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return v_transfer_id;
end;
$$;

create or replace function public.claim_due_payout_transfers(p_limit integer default 20)
returns setof public.payout_transfers
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id
    from public.payout_transfers
    where status = 'queued'
      and attempt_count < max_attempts
      and coalesce(next_retry_at, now()) <= now()
      and (locked_at is null or locked_at < now() - interval '10 minutes')
      and coalesce(metadata->>'workflow', '') <> 'manual_review'
    order by created_at asc
    for update skip locked
    limit greatest(1, p_limit)
  )
  update public.payout_transfers pt
  set
    locked_at = now(),
    updated_at = now()
  from candidates
  where pt.id = candidates.id
  returning pt.*;
end;
$$;

revoke all on function public.claim_due_payout_transfers(integer) from public, anon, authenticated;
grant execute on function public.claim_due_payout_transfers(integer) to service_role;

commit;
