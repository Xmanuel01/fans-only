-- M-PESA payout infrastructure: payout accounts, balances, transfer ledger, and RPC helpers.
-- Generated 2026-02-17

begin;

create table if not exists public.creator_payout_accounts (
  creator_id uuid primary key references public.creators (id) on delete cascade,
  provider text not null default 'mpesa' check (provider in ('mpesa')),
  currency text not null default 'KES',
  account_name text not null,
  account_number_last4 text not null,
  bank_code text not null,
  recipient_code text not null unique,
  recipient_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_balances (
  creator_id uuid primary key references public.creators (id) on delete cascade,
  currency text not null default 'KES',
  available_amount_minor bigint not null default 0 check (available_amount_minor >= 0),
  pending_amount_minor bigint not null default 0 check (pending_amount_minor >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.payout_transfers (
  id bigserial primary key,
  creator_id uuid not null references public.creators (id) on delete cascade,
  requested_by uuid references public.profiles (id) on delete set null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'KES',
  recipient_code text not null,
  reference text not null unique,
  idempotency_key text not null unique,
  status text not null default 'queued' check (status in ('queued', 'submitted', 'success', 'failed', 'reversed')),
  paystack_transfer_code text,
  paystack_transfer_id text,
  reason text,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_balance_ledger (
  id bigserial primary key,
  creator_id uuid not null references public.creators (id) on delete cascade,
  payment_id bigint references public.payments (id) on delete set null,
  payout_transfer_id bigint references public.payout_transfers (id) on delete set null,
  entry_type text not null check (entry_type in ('credit_payment', 'debit_payout', 'reversal_payout')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.provider_webhook_events (
  id bigserial primary key,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists payout_transfers_creator_created_idx
  on public.payout_transfers (creator_id, created_at desc);
create index if not exists payout_transfers_status_created_idx
  on public.payout_transfers (status, created_at desc);
create index if not exists creator_balance_ledger_creator_created_idx
  on public.creator_balance_ledger (creator_id, created_at desc);
create index if not exists provider_webhook_events_provider_type_idx
  on public.provider_webhook_events (provider, event_type, received_at desc);

create unique index if not exists tips_payment_unique_idx
  on public.tips (payment_id)
  where payment_id is not null;

alter table public.creator_payout_accounts enable row level security;
alter table public.creator_balances enable row level security;
alter table public.payout_transfers enable row level security;
alter table public.creator_balance_ledger enable row level security;
alter table public.provider_webhook_events enable row level security;

create policy "Payout account: creator select"
  on public.creator_payout_accounts
  for select
  using (auth.uid() = creator_id);

create policy "Creator balances: self select"
  on public.creator_balances
  for select
  using (auth.uid() = creator_id);

create policy "Payout transfers: self select"
  on public.payout_transfers
  for select
  using (auth.uid() = creator_id);

create policy "Balance ledger: self select"
  on public.creator_balance_ledger
  for select
  using (auth.uid() = creator_id);

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
begin
  if p_amount_minor <= 0 then
    raise exception 'credit amount must be > 0';
  end if;

  insert into public.creator_balances (creator_id, currency, available_amount_minor, pending_amount_minor, updated_at)
  values (p_creator_id, p_currency, p_amount_minor, 0, now())
  on conflict (creator_id)
  do update set
    available_amount_minor = public.creator_balances.available_amount_minor + excluded.available_amount_minor,
    currency = excluded.currency,
    updated_at = now()
  where public.creator_balances.currency = excluded.currency;

  if not found then
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
  );
end;
$$;

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
begin
  if p_amount_minor <= 0 then
    raise exception 'payout amount must be > 0';
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

revoke all on function public.credit_creator_balance(uuid, bigint, text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.request_creator_payout(uuid, bigint, text, text, text, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.mark_payout_result(bigint, text, text, text, text, jsonb) from public, anon, authenticated;

grant execute on function public.credit_creator_balance(uuid, bigint, text, bigint, jsonb) to service_role;
grant execute on function public.request_creator_payout(uuid, bigint, text, text, text, uuid, text, text, jsonb) to service_role;
grant execute on function public.mark_payout_result(bigint, text, text, text, text, jsonb) to service_role;

commit;
