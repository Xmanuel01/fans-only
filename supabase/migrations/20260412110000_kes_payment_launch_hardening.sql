begin;

alter table public.payments
  alter column currency set default 'KES';

alter table public.tips
  alter column currency set default 'KES';

alter table public.payments
  drop constraint if exists payments_provider_check;

alter table public.payments
  add constraint payments_provider_check
  check (provider in ('paystack', 'mpesa', 'wallet'));

create unique index if not exists subscriptions_payment_unique_idx
  on public.subscriptions (payment_id)
  where payment_id is not null;

create unique index if not exists ppv_purchases_payment_unique_idx
  on public.ppv_purchases (payment_id)
  where payment_id is not null;

commit;
