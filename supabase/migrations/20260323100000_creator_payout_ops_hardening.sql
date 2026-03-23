begin;

alter table public.creator_payout_accounts
  drop constraint if exists creator_payout_accounts_kyc_status_check;

alter table public.creator_payout_accounts
  add constraint creator_payout_accounts_kyc_status_check
  check (kyc_status in ('pending', 'verified', 'rejected', 'inactive'));

create unique index if not exists creator_balance_ledger_reversal_payout_unique_idx
  on public.creator_balance_ledger (payout_transfer_id, entry_type)
  where payout_transfer_id is not null and entry_type = 'reversal_payout';

create or replace function public.set_creator_payout_account_verification(
  p_creator_id uuid,
  p_provider text,
  p_status text,
  p_reviewed_by uuid default null,
  p_verification_source text default 'manual_ops_review',
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
) returns public.creator_payout_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.creator_payout_accounts%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_review_metadata jsonb := jsonb_strip_nulls(
    jsonb_build_object(
      'reviewed_at', now(),
      'reviewed_by', p_reviewed_by,
      'review_status', p_status,
      'reason', v_reason
    )
  );
begin
  if p_provider not in ('mpesa', 'bank', 'paypal', 'card') then
    raise exception 'invalid payout provider';
  end if;

  if p_status not in ('pending', 'verified', 'rejected', 'inactive') then
    raise exception 'invalid verification status';
  end if;

  update public.creator_payout_accounts
  set
    kyc_status = p_status,
    recipient_active = case
      when p_status = 'verified' then true
      when p_status = 'inactive' then false
      else recipient_active
    end,
    verified_at = case when p_status = 'verified' then now() else null end,
    verified_by = case when p_status = 'verified' then p_reviewed_by else null end,
    verification_source = coalesce(nullif(btrim(coalesce(p_verification_source, '')), ''), verification_source, 'manual_ops_review'),
    verification_metadata = coalesce(verification_metadata, '{}'::jsonb)
      || coalesce(p_metadata, '{}'::jsonb)
      || v_review_metadata,
    last_error = case
      when p_status in ('rejected', 'inactive') then coalesce(v_reason, last_error)
      when p_status in ('verified', 'pending') then null
      else last_error
    end,
    kyc_last_checked_at = now(),
    updated_at = now()
  where creator_id = p_creator_id
    and provider = p_provider
  returning * into v_account;

  if not found then
    raise exception 'payout account not found';
  end if;

  return v_account;
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
  v_effective_status text := p_status;
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

  if v_transfer.status = 'reversed' then
    update public.payout_transfers
    set
      paystack_transfer_code = coalesce(p_paystack_transfer_code, paystack_transfer_code),
      paystack_transfer_id = coalesce(p_paystack_transfer_id, paystack_transfer_id),
      provider_transfer_id = coalesce(p_metadata->>'provider_transfer_id', provider_transfer_id),
      provider_batch_id = coalesce(p_metadata->>'provider_batch_id', provider_batch_id),
      failure_reason = coalesce(p_failure_reason, failure_reason),
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
      updated_at = now()
    where id = p_transfer_id;
    return;
  end if;

  if v_transfer.status = p_status then
    v_effective_status := v_transfer.status;
  elsif v_transfer.status = 'failed' and p_status = 'reversed' then
    v_effective_status := 'reversed';
  elsif v_transfer.status = 'failed' and p_status in ('submitted', 'success') then
    v_effective_status := 'failed';
  elsif v_transfer.status = 'success' and p_status = 'submitted' then
    v_effective_status := v_transfer.status;
  elsif v_transfer.status = 'success' and p_status in ('failed', 'reversed') then
    v_effective_status := p_status;
  end if;

  update public.payout_transfers
  set
    status = v_effective_status,
    paystack_transfer_code = coalesce(p_paystack_transfer_code, paystack_transfer_code),
    paystack_transfer_id = coalesce(p_paystack_transfer_id, paystack_transfer_id),
    provider_transfer_id = coalesce(p_metadata->>'provider_transfer_id', provider_transfer_id),
    provider_batch_id = coalesce(p_metadata->>'provider_batch_id', provider_batch_id),
    failure_reason = coalesce(p_failure_reason, failure_reason),
    metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
    updated_at = now()
  where id = p_transfer_id;

  if v_effective_status = 'submitted' then
    return;
  end if;

  if v_effective_status = 'success' then
    if v_transfer.status <> 'success' then
      update public.creator_balances
      set
        pending_amount_minor = greatest(pending_amount_minor - v_transfer.amount_minor, 0),
        updated_at = now()
      where creator_id = v_transfer.creator_id;
    end if;
    return;
  end if;

  if v_transfer.status not in ('failed', 'reversed') then
    update public.creator_balances
    set
      pending_amount_minor = case
        when v_transfer.status = 'success' then pending_amount_minor
        else greatest(pending_amount_minor - v_transfer.amount_minor, 0)
      end,
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
    )
    on conflict (payout_transfer_id, entry_type) where entry_type = 'reversal_payout'
    do nothing;
  end if;
end;
$$;

revoke all on function public.set_creator_payout_account_verification(uuid, text, text, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.set_creator_payout_account_verification(uuid, text, text, uuid, text, text, jsonb) to service_role;

commit;
