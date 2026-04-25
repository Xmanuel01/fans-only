begin;

update public.payments
set provider = 'paystack'
where provider = 'mpesa';

alter table public.payments
  drop constraint if exists payments_provider_check;

alter table public.payments
  add constraint payments_provider_check
  check (provider in ('paystack', 'wallet'));

alter table public.payout_transfers
  drop constraint if exists payout_transfers_provider_check;

update public.payout_transfers
set provider = 'paystack'
where provider = 'paypal';

alter table public.payout_transfers
  add constraint payout_transfers_provider_check
  check (provider = 'paystack');

commit;
