begin;

alter table public.creator_payout_accounts
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles (id) on delete set null,
  add column if not exists verification_source text,
  add column if not exists verification_metadata jsonb not null default '{}'::jsonb;

update public.creator_payout_accounts
set
  verification_source = coalesce(verification_source, 'legacy_state'),
  verified_at = coalesce(verified_at, kyc_last_checked_at, now())
where kyc_status = 'verified';

commit;
