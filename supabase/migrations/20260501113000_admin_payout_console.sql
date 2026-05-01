begin;

alter table public.payout_transfers
  add column if not exists manual_hold boolean not null default false,
  add column if not exists hold_reason text,
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists last_reviewed_by uuid references public.profiles (id) on delete set null,
  add column if not exists settled_at timestamptz,
  add column if not exists external_reference text,
  add column if not exists proof_path text;

create table if not exists public.creator_payout_controls (
  creator_id uuid primary key references public.creators (id) on delete cascade,
  payout_changes_locked boolean not null default false,
  payout_changes_lock_reason text,
  payout_changes_locked_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.payout_admin_notes (
  id bigserial primary key,
  payout_transfer_id bigint not null references public.payout_transfers (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  author_email text not null,
  author_role text not null check (author_role in ('viewer', 'operator', 'super_admin', 'service')),
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.payout_admin_audit_log (
  id bigserial primary key,
  payout_transfer_id bigint not null references public.payout_transfers (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_email text not null,
  actor_role text not null check (actor_role in ('viewer', 'operator', 'super_admin', 'service')),
  action text not null,
  from_status text,
  to_status text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.payout_notification_events (
  id bigserial primary key,
  payout_transfer_id bigint references public.payout_transfers (id) on delete cascade,
  event_kind text not null check (event_kind in ('creator_requested', 'admin_requested', 'creator_status', 'admin_resend')),
  recipient_email text not null,
  channel text not null default 'email' check (channel in ('email')),
  provider text not null default 'resend',
  status text not null check (status in ('sent', 'failed', 'skipped')),
  provider_message_id text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payout_admin_notes_transfer_created_idx
  on public.payout_admin_notes (payout_transfer_id, created_at desc);

create index if not exists payout_admin_audit_transfer_created_idx
  on public.payout_admin_audit_log (payout_transfer_id, created_at desc);

create index if not exists payout_notification_events_transfer_created_idx
  on public.payout_notification_events (payout_transfer_id, created_at desc);

create index if not exists payout_transfers_manual_hold_created_idx
  on public.payout_transfers (manual_hold, created_at desc);

alter table public.creator_payout_controls enable row level security;
alter table public.payout_admin_notes enable row level security;
alter table public.payout_admin_audit_log enable row level security;
alter table public.payout_notification_events enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'admin-payout-proofs',
  'admin-payout-proofs',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'application/pdf']
)
on conflict (id) do nothing;

commit;
