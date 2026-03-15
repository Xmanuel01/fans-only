begin;

alter table public.creator_payout_accounts
  drop constraint if exists creator_payout_accounts_provider_check;

alter table public.creator_payout_accounts
  drop constraint if exists creator_payout_accounts_provider_fields_check;

alter table public.creator_payout_accounts
  add column if not exists card_brand text,
  add column if not exists card_exp_month integer,
  add column if not exists card_exp_year integer,
  add column if not exists paystack_authorization_code text,
  add column if not exists paystack_authorization_signature text,
  add column if not exists paystack_customer_code text;

alter table public.creator_payout_accounts
  add constraint creator_payout_accounts_provider_check
  check (provider in ('mpesa', 'bank', 'paypal', 'card'));

alter table public.creator_payout_accounts
  add constraint creator_payout_accounts_provider_fields_check
  check (
    (provider = 'paypal' and paypal_email is not null)
    or (
      provider in ('mpesa', 'bank')
      and recipient_code is not null
      and account_number_last4 is not null
      and bank_code is not null
    )
    or (
      provider = 'card'
      and recipient_code is not null
      and account_number_last4 is not null
      and paystack_authorization_code is not null
    )
  );

commit;
