-- Multi-provider payout accounts and transfers (M-PESA, bank, PayPal)
-- Generated 2026-02-25

begin;

-- Expand payout account providers + fields
alter table public.creator_payout_accounts
  drop constraint if exists creator_payout_accounts_provider_check;

alter table public.creator_payout_accounts
  add column if not exists paypal_email text,
  add column if not exists bank_name text,
  add column if not exists recipient_type text;

alter table public.creator_payout_accounts
  alter column bank_code drop not null,
  alter column account_number_last4 drop not null,
  alter column recipient_code drop not null;

alter table public.creator_payout_accounts
  drop constraint if exists creator_payout_accounts_recipient_code_key;

create unique index if not exists creator_payout_accounts_recipient_code_idx
  on public.creator_payout_accounts (recipient_code)
  where recipient_code is not null;

alter table public.creator_payout_accounts
  add constraint creator_payout_accounts_provider_check
  check (provider in ('mpesa', 'bank', 'paypal'));

alter table public.creator_payout_accounts
  add constraint creator_payout_accounts_provider_fields_check
  check (
    (provider = 'paypal' and paypal_email is not null)
    or (provider in ('mpesa', 'bank') and recipient_code is not null and account_number_last4 is not null and bank_code is not null)
  );

-- Track payout provider on transfers
alter table public.payout_transfers
  add column if not exists provider text not null default 'paystack'
    check (provider in ('paystack', 'paypal')),
  add column if not exists provider_transfer_id text,
  add column if not exists provider_batch_id text;

-- Update payout RPC to store provider from metadata
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

  if v_provider not in ('paystack', 'paypal') then
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

create or replace function public.mark_payout_result(
  p_transfer_id bigint,
  p_status text,
  p_paystack_transfer_code text default null,
  p_paystack_transfer_id text default null,
  p_failure_reason text default null,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer public.payout_transfers%rowtype;
begin
  if p_status not in ('submitted', 'success', 'failed', 'reversed') then
    raise exception 'invalid payout status';
  end if;

  select *
  into v_transfer
  from public.payout_transfers
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'payout transfer not found';
  end if;

  if v_transfer.status in ('success', 'failed', 'reversed') then
    return;
  end if;

  update public.payout_transfers
  set
    status = p_status,
    paystack_transfer_code = coalesce(p_paystack_transfer_code, paystack_transfer_code),
    paystack_transfer_id = coalesce(p_paystack_transfer_id, paystack_transfer_id),
    provider_transfer_id = coalesce(p_metadata->>'provider_transfer_id', provider_transfer_id),
    provider_batch_id = coalesce(p_metadata->>'provider_batch_id', provider_batch_id),
    failure_reason = p_failure_reason,
    metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
    updated_at = now()
  where id = p_transfer_id;

  if p_status = 'submitted' then
    return;
  end if;

  if p_status = 'success' then
    update public.creator_balances
    set
      pending_amount_minor = greatest(pending_amount_minor - v_transfer.amount_minor, 0),
      updated_at = now()
    where creator_id = v_transfer.creator_id;
    return;
  end if;

  update public.creator_balances
  set
    pending_amount_minor = greatest(pending_amount_minor - v_transfer.amount_minor, 0),
    available_amount_minor = available_amount_minor + v_transfer.amount_minor,
    updated_at = now()
  where creator_id = v_transfer.creator_id;

  insert into public.creator_balance_ledger (
    creator_id,
    payout_transfer_id,
    entry_type,
    amount_minor,
    currency,
    metadata
  ) values (
    v_transfer.creator_id,
    v_transfer.id,
    'reversal_payout',
    v_transfer.amount_minor,
    v_transfer.currency,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

commit;
