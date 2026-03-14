-- Payout hardening: explicit KYC fields and retry/scheduler support for payout jobs.
-- Generated 2026-02-17

begin;

alter table public.creator_payout_accounts
  add column if not exists kyc_status text not null default 'pending'
    check (kyc_status in ('pending', 'verified', 'rejected')),
  add column if not exists kyc_last_checked_at timestamptz,
  add column if not exists msisdn_e164 text,
  add column if not exists provider_account_id text;

alter table public.payout_transfers
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 5,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_retry_at timestamptz not null default now(),
  add column if not exists locked_at timestamptz,
  add column if not exists processing_error_code text;

create index if not exists payout_transfers_retry_idx
  on public.payout_transfers (status, next_retry_at, attempt_count, max_attempts);

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

