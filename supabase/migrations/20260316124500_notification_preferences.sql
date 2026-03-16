begin;

create or replace function public.default_notification_preferences()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'push', true,
    'email', true,
    'sms', false,
    'messages', true,
    'payments', true,
    'subscriptions', true,
    'content', true
  );
$$;

alter table public.profiles
  add column if not exists notification_preferences jsonb;

alter table public.profiles
  alter column notification_preferences set default public.default_notification_preferences();

update public.profiles
set notification_preferences = public.default_notification_preferences()
where notification_preferences is null;

alter table public.profiles
  alter column notification_preferences set not null;

create or replace function public.notification_pref_enabled(
  p_user_id uuid,
  p_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select
        case
          when coalesce((p.notification_preferences ->> 'push')::boolean, true) = false then false
          else coalesce((p.notification_preferences ->> p_key)::boolean, true)
        end
      from public.profiles p
      where p.id = p_user_id
    ),
    true
  );
$$;

create or replace function public.create_notification_if_enabled(
  p_user_id uuid,
  p_type text,
  p_payload jsonb,
  p_pref_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  if public.notification_pref_enabled(p_user_id, p_pref_key) then
    insert into public.notifications (user_id, type, payload)
    values (p_user_id, p_type, coalesce(p_payload, '{}'::jsonb));
  end if;
end;
$$;

create or replace function public.send_chat_message(
  p_body text,
  p_thread_id uuid default null,
  p_creator_id uuid default null,
  p_member_id uuid default null
)
returns table (
  thread_id uuid,
  message_id bigint,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
  normalized_body text := btrim(coalesce(p_body, ''));
  target_thread public.chat_threads%rowtype;
  inserted_message public.chat_messages%rowtype;
  recipient_id uuid;
  active_subscription_exists boolean := false;
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;

  if normalized_body = '' then
    raise exception 'Message cannot be empty';
  end if;

  if char_length(normalized_body) > 4000 then
    raise exception 'Message is too long';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = current_uid
      and p.age_confirmed_at is not null
  ) then
    raise exception 'Age confirmation required';
  end if;

  if p_thread_id is not null then
    select *
    into target_thread
    from public.chat_threads t
    where t.id = p_thread_id
      and current_uid in (t.creator_id, t.member_id)
    for update;

    if not found then
      raise exception 'Chat not found';
    end if;
  elsif p_creator_id is not null then
    if current_uid = p_creator_id then
      raise exception 'Invalid recipient';
    end if;

    if not exists (select 1 from public.creators c where c.id = p_creator_id) then
      raise exception 'Creator not found';
    end if;

    select exists (
      select 1
      from public.subscriptions s
      where s.subscriber_id = current_uid
        and s.creator_id = p_creator_id
        and s.status = 'active'
        and (s.current_period_end is null or s.current_period_end > now())
    )
    into active_subscription_exists;

    if not active_subscription_exists then
      raise exception 'You need an active subscription to message this creator';
    end if;

    insert into public.chat_threads (
      creator_id,
      member_id,
      last_read_by_member_at,
      updated_at
    )
    values (
      p_creator_id,
      current_uid,
      now(),
      now()
    )
    on conflict (creator_id, member_id) do update
      set updated_at = excluded.updated_at
    returning * into target_thread;
  elsif p_member_id is not null then
    if current_uid = p_member_id then
      raise exception 'Invalid recipient';
    end if;

    if not exists (select 1 from public.creators c where c.id = current_uid) then
      raise exception 'Only creators can start a fan conversation';
    end if;

    if not exists (select 1 from public.profiles p where p.id = p_member_id) then
      raise exception 'Member not found';
    end if;

    select exists (
      select 1
      from public.subscriptions s
      where s.subscriber_id = p_member_id
        and s.creator_id = current_uid
        and s.status = 'active'
        and (s.current_period_end is null or s.current_period_end > now())
    )
    into active_subscription_exists;

    if not active_subscription_exists then
      raise exception 'Only active subscribers can be messaged first';
    end if;

    insert into public.chat_threads (
      creator_id,
      member_id,
      last_read_by_creator_at,
      updated_at
    )
    values (
      current_uid,
      p_member_id,
      now(),
      now()
    )
    on conflict (creator_id, member_id) do update
      set updated_at = excluded.updated_at
    returning * into target_thread;
  else
    raise exception 'Chat target is required';
  end if;

  if current_uid = target_thread.member_id then
    select exists (
      select 1
      from public.subscriptions s
      where s.subscriber_id = target_thread.member_id
        and s.creator_id = target_thread.creator_id
        and s.status = 'active'
        and (s.current_period_end is null or s.current_period_end > now())
    )
    into active_subscription_exists;

    if not active_subscription_exists then
      raise exception 'Your subscription must stay active to send messages';
    end if;
  end if;

  insert into public.chat_messages (
    thread_id,
    sender_id,
    sender_role,
    body
  )
  values (
    target_thread.id,
    current_uid,
    case when current_uid = target_thread.creator_id then 'creator' else 'member' end,
    normalized_body
  )
  returning * into inserted_message;

  update public.chat_threads t
  set
    last_message_at = inserted_message.created_at,
    last_message_preview = left(normalized_body, 160),
    last_message_sender_id = current_uid,
    last_read_by_creator_at = case
      when current_uid = t.creator_id then inserted_message.created_at
      else t.last_read_by_creator_at
    end,
    last_read_by_member_at = case
      when current_uid = t.member_id then inserted_message.created_at
      else t.last_read_by_member_at
    end,
    updated_at = now()
  where t.id = target_thread.id
  returning * into target_thread;

  recipient_id := case
    when current_uid = target_thread.creator_id then target_thread.member_id
    else target_thread.creator_id
  end;

  perform public.create_notification_if_enabled(
    recipient_id,
    'chat_message',
    jsonb_build_object(
      'thread_id', target_thread.id,
      'message_id', inserted_message.id,
      'from_user_id', current_uid,
      'preview', left(normalized_body, 80)
    ),
    'messages'
  );

  return query
  select target_thread.id, inserted_message.id, inserted_message.created_at;
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

  perform public.create_notification_if_enabled(
    new.to_creator,
    'new_tip',
    jsonb_build_object(
      'tip_id', new.id,
      'from_user_id', new.from_user,
      'from_name', v_from_name,
      'from_username', v_from_username,
      'amount_cents', new.amount_cents,
      'currency', new.currency
    ),
    'payments'
  );

  perform public.create_notification_if_enabled(
    new.from_user,
    'tip_sent',
    jsonb_build_object(
      'tip_id', new.id,
      'creator_id', new.to_creator,
      'creator_name', v_creator_name,
      'creator_handle', v_creator_handle,
      'amount_cents', new.amount_cents,
      'currency', new.currency
    ),
    'payments'
  );

  return new;
end;
$$;

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

  perform public.create_notification_if_enabled(
    new.creator_id,
    v_creator_type,
    jsonb_build_object(
      'subscription_id', new.id,
      'subscriber_id', new.subscriber_id,
      'subscriber_name', v_subscriber_name,
      'subscriber_username', v_subscriber_username,
      'current_period_end', new.current_period_end,
      'payment_id', new.payment_id
    ),
    'subscriptions'
  );

  perform public.create_notification_if_enabled(
    new.subscriber_id,
    v_member_type,
    jsonb_build_object(
      'subscription_id', new.id,
      'creator_id', new.creator_id,
      'creator_name', v_creator_name,
      'creator_handle', v_creator_handle,
      'current_period_end', new.current_period_end,
      'payment_id', new.payment_id
    ),
    'subscriptions'
  );

  return new;
end;
$$;

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

  perform public.create_notification_if_enabled(
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
    ),
    'payments'
  );

  perform public.create_notification_if_enabled(
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
    ),
    'payments'
  );

  return new;
end;
$$;

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

  v_post_title := coalesce(
    nullif(new.title, ''),
    case when new.post_type = 'story' then 'New story' else 'New post' end
  );

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
    and (s.current_period_end is null or s.current_period_end > now())
    and public.notification_pref_enabled(s.subscriber_id, 'content');

  return new;
end;
$$;

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

  if v_type is not null then
    perform public.create_notification_if_enabled(
      new.creator_id,
      v_type,
      jsonb_build_object(
        'transfer_id', new.id,
        'amount_minor', new.amount_minor,
        'currency', new.currency,
        'status', new.status,
        'failure_reason', new.failure_reason,
        'provider', new.provider
      ),
      'payments'
    );
  end if;

  return new;
end;
$$;

commit;
