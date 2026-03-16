begin;

create index if not exists notifications_user_read_created_idx
  on public.notifications (user_id, read_at, created_at desc);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.notifications;
    exception
      when duplicate_object then null;
    end;
  end if;
end;
$$;

create or replace function public.notify_tip_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_name text := 'A fan';
  v_from_username text := null;
  v_creator_name text := 'Creator';
  v_creator_handle text := null;
begin
  if new.from_user is not null then
    select
      coalesce(nullif(display_name, ''), nullif(username, ''), 'A fan'),
      username
    into
      v_from_name,
      v_from_username
    from public.profiles
    where id = new.from_user;
  end if;

  select
    coalesce(nullif(display_name, ''), nullif(handle, ''), 'Creator'),
    handle
  into
    v_creator_name,
    v_creator_handle
  from public.creators
  where id = new.to_creator;

  if new.to_creator is not null then
    insert into public.notifications (user_id, type, payload)
    values (
      new.to_creator,
      'new_tip',
      jsonb_build_object(
        'tip_id', new.id,
        'from_user_id', new.from_user,
        'from_name', v_from_name,
        'from_username', v_from_username,
        'amount_cents', new.amount_cents,
        'currency', new.currency
      )
    );
  end if;

  if new.from_user is not null then
    insert into public.notifications (user_id, type, payload)
    values (
      new.from_user,
      'tip_sent',
      jsonb_build_object(
        'tip_id', new.id,
        'creator_id', new.to_creator,
        'creator_name', v_creator_name,
        'creator_handle', v_creator_handle,
        'amount_cents', new.amount_cents,
        'currency', new.currency
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_tip_created on public.tips;
create trigger trg_notify_tip_created
after insert on public.tips
for each row
execute function public.notify_tip_created();

create or replace function public.notify_subscription_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_name text := 'Creator';
  v_creator_handle text := null;
  v_subscriber_name text := 'Subscriber';
  v_subscriber_username text := null;
  v_creator_type text;
  v_member_type text;
begin
  if new.status <> 'active' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.payment_id is not distinct from old.payment_id
    and new.status is not distinct from old.status then
    return new;
  end if;

  select
    coalesce(nullif(display_name, ''), nullif(handle, ''), 'Creator'),
    handle
  into
    v_creator_name,
    v_creator_handle
  from public.creators
  where id = new.creator_id;

  select
    coalesce(nullif(display_name, ''), nullif(username, ''), 'Subscriber'),
    username
  into
    v_subscriber_name,
    v_subscriber_username
  from public.profiles
  where id = new.subscriber_id;

  if tg_op = 'INSERT' or old.status <> 'active' then
    v_creator_type := 'new_subscription';
    v_member_type := 'subscription_active';
  else
    v_creator_type := 'subscription_renewed';
    v_member_type := 'subscription_renewed';
  end if;

  insert into public.notifications (user_id, type, payload)
  values (
    new.creator_id,
    v_creator_type,
    jsonb_build_object(
      'subscription_id', new.id,
      'subscriber_id', new.subscriber_id,
      'subscriber_name', v_subscriber_name,
      'subscriber_username', v_subscriber_username,
      'current_period_end', new.current_period_end,
      'payment_id', new.payment_id
    )
  );

  insert into public.notifications (user_id, type, payload)
  values (
    new.subscriber_id,
    v_member_type,
    jsonb_build_object(
      'subscription_id', new.id,
      'creator_id', new.creator_id,
      'creator_name', v_creator_name,
      'creator_handle', v_creator_handle,
      'current_period_end', new.current_period_end,
      'payment_id', new.payment_id
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_subscription_change on public.subscriptions;
create trigger trg_notify_subscription_change
after insert or update on public.subscriptions
for each row
execute function public.notify_subscription_change();

create or replace function public.notify_ppv_purchase_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_name text := 'Creator';
  v_creator_handle text := null;
  v_buyer_name text := 'Fan';
  v_buyer_username text := null;
  v_post_title text := 'Locked post';
begin
  select
    coalesce(nullif(display_name, ''), nullif(handle, ''), 'Creator'),
    handle
  into
    v_creator_name,
    v_creator_handle
  from public.creators
  where id = new.creator_id;

  select
    coalesce(nullif(display_name, ''), nullif(username, ''), 'Fan'),
    username
  into
    v_buyer_name,
    v_buyer_username
  from public.profiles
  where id = new.user_id;

  select coalesce(nullif(title, ''), 'Locked post')
  into v_post_title
  from public.posts
  where id = new.post_id;

  insert into public.notifications (user_id, type, payload)
  values (
    new.creator_id,
    'ppv_purchase',
    jsonb_build_object(
      'purchase_id', new.id,
      'post_id', new.post_id,
      'post_title', v_post_title,
      'buyer_id', new.user_id,
      'buyer_name', v_buyer_name,
      'buyer_username', v_buyer_username,
      'amount_cents', new.amount_cents,
      'currency', new.currency
    )
  );

  insert into public.notifications (user_id, type, payload)
  values (
    new.user_id,
    'ppv_unlocked',
    jsonb_build_object(
      'purchase_id', new.id,
      'post_id', new.post_id,
      'post_title', v_post_title,
      'creator_id', new.creator_id,
      'creator_name', v_creator_name,
      'creator_handle', v_creator_handle,
      'amount_cents', new.amount_cents,
      'currency', new.currency
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_ppv_purchase_created on public.ppv_purchases;
create trigger trg_notify_ppv_purchase_created
after insert on public.ppv_purchases
for each row
execute function public.notify_ppv_purchase_created();

create or replace function public.notify_post_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_name text := 'Creator';
  v_creator_handle text := null;
  v_post_title text := 'New post';
begin
  select
    coalesce(nullif(display_name, ''), nullif(handle, ''), 'Creator'),
    handle
  into
    v_creator_name,
    v_creator_handle
  from public.creators
  where id = new.creator_id;

  v_post_title := coalesce(nullif(new.title, ''), case when new.post_type = 'story' then 'New story' else 'New post' end);

  insert into public.notifications (user_id, type, payload)
  select
    s.subscriber_id,
    'creator_post_published',
    jsonb_build_object(
      'post_id', new.id,
      'post_title', v_post_title,
      'post_type', new.post_type,
      'visibility', new.visibility,
      'creator_id', new.creator_id,
      'creator_name', v_creator_name,
      'creator_handle', v_creator_handle
    )
  from public.subscriptions s
  where s.creator_id = new.creator_id
    and s.status = 'active'
    and (s.current_period_end is null or s.current_period_end > now());

  return new;
end;
$$;

drop trigger if exists trg_notify_post_published on public.posts;
create trigger trg_notify_post_published
after insert on public.posts
for each row
execute function public.notify_post_published();

create or replace function public.notify_payout_transfer_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := null;
begin
  if tg_op = 'INSERT' then
    v_type := 'payout_requested';
  elsif new.status is distinct from old.status then
    if new.status = 'submitted' then
      v_type := 'payout_submitted';
    elsif new.status = 'success' then
      v_type := 'payout_success';
    elsif new.status = 'failed' then
      v_type := 'payout_failed';
    elsif new.status = 'reversed' then
      v_type := 'payout_reversed';
    end if;
  end if;

  if v_type is null then
    return new;
  end if;

  insert into public.notifications (user_id, type, payload)
  values (
    new.creator_id,
    v_type,
    jsonb_build_object(
      'transfer_id', new.id,
      'reference', new.reference,
      'amount_minor', new.amount_minor,
      'currency', new.currency,
      'provider', new.provider,
      'status', new.status,
      'failure_reason', new.failure_reason
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_payout_transfer_change on public.payout_transfers;
create trigger trg_notify_payout_transfer_change
after insert or update on public.payout_transfers
for each row
execute function public.notify_payout_transfer_change();

commit;
