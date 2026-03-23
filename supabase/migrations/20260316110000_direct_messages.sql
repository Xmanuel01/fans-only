begin;

create extension if not exists "uuid-ossp";

create table if not exists public.chat_threads (
  id uuid primary key default extensions.uuid_generate_v4(),
  creator_id uuid not null references public.creators (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  last_message_sender_id uuid references public.profiles (id) on delete set null,
  last_read_by_creator_at timestamptz,
  last_read_by_member_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_id, member_id),
  check (creator_id <> member_id)
);

create table if not exists public.chat_messages (
  id bigserial primary key,
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  sender_role text not null check (sender_role in ('creator', 'member')),
  body text not null,
  created_at timestamptz not null default now(),
  constraint chat_messages_body_length check (char_length(trim(body)) between 1 and 4000)
);

create index if not exists chat_threads_creator_last_message_idx
  on public.chat_threads (creator_id, last_message_at desc, created_at desc);

create index if not exists chat_threads_member_last_message_idx
  on public.chat_threads (member_id, last_message_at desc, created_at desc);

create index if not exists chat_messages_thread_created_idx
  on public.chat_messages (thread_id, created_at desc);

alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "Chat threads: participant select" on public.chat_threads;
drop policy if exists "Chat threads: participant update" on public.chat_threads;
drop policy if exists "Chat messages: participant select" on public.chat_messages;

create policy "Chat threads: participant select"
  on public.chat_threads
  for select
  using (auth.uid() = creator_id or auth.uid() = member_id);

create policy "Chat threads: participant update"
  on public.chat_threads
  for update
  using (auth.uid() = creator_id or auth.uid() = member_id)
  with check (auth.uid() = creator_id or auth.uid() = member_id);

create policy "Chat messages: participant select"
  on public.chat_messages
  for select
  using (
    exists (
      select 1
      from public.chat_threads t
      where t.id = chat_messages.thread_id
        and auth.uid() in (t.creator_id, t.member_id)
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_threads'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_threads';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_messages';
  end if;
end $$;

create or replace function public.get_chat_threads()
returns table (
  thread_id uuid,
  creator_id uuid,
  member_id uuid,
  peer_id uuid,
  peer_role text,
  peer_name text,
  peer_handle text,
  peer_avatar_url text,
  last_message_preview text,
  last_message_at timestamptz,
  last_message_sender_id uuid,
  unread_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    t.id as thread_id,
    t.creator_id,
    t.member_id,
    case when current_uid = t.creator_id then t.member_id else t.creator_id end as peer_id,
    case when current_uid = t.creator_id then 'member' else 'creator' end as peer_role,
    case
      when current_uid = t.creator_id then coalesce(p.display_name, p.username, 'Member')
      else coalesce(c.display_name, c.handle, 'Creator')
    end as peer_name,
    case
      when current_uid = t.creator_id then coalesce(p.username, '')
      else coalesce(c.handle, '')
    end as peer_handle,
    case
      when current_uid = t.creator_id then p.avatar_url
      else c.avatar_url
    end as peer_avatar_url,
    t.last_message_preview,
    t.last_message_at,
    t.last_message_sender_id,
    coalesce(
      (
        select count(*)
        from public.chat_messages m
        where m.thread_id = t.id
          and m.sender_id <> current_uid
          and m.created_at >
            coalesce(
              case
                when current_uid = t.creator_id then t.last_read_by_creator_at
                else t.last_read_by_member_at
              end,
              'epoch'::timestamptz
            )
      ),
      0
    )::integer as unread_count,
    t.created_at
  from public.chat_threads t
  left join public.creators c on c.id = t.creator_id
  left join public.profiles p on p.id = t.member_id
  where current_uid in (t.creator_id, t.member_id)
  order by coalesce(t.last_message_at, t.created_at) desc, t.created_at desc;
end;
$$;

create or replace function public.get_chat_messages(
  p_thread_id uuid,
  p_limit integer default 100
)
returns table (
  message_id bigint,
  thread_id uuid,
  sender_id uuid,
  sender_role text,
  sender_name text,
  sender_handle text,
  sender_avatar_url text,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.chat_threads t
    where t.id = p_thread_id
      and current_uid in (t.creator_id, t.member_id)
  ) then
    raise exception 'Chat not found';
  end if;

  return query
  with recent_messages as (
    select m.*
    from public.chat_messages m
    where m.thread_id = p_thread_id
    order by m.created_at desc
    limit greatest(coalesce(p_limit, 100), 1)
  )
  select
    m.id as message_id,
    m.thread_id,
    m.sender_id,
    m.sender_role,
    case
      when m.sender_role = 'creator' then coalesce(c.display_name, c.handle, 'Creator')
      else coalesce(p.display_name, p.username, 'Member')
    end as sender_name,
    case
      when m.sender_role = 'creator' then coalesce(c.handle, '')
      else coalesce(p.username, '')
    end as sender_handle,
    case
      when m.sender_role = 'creator' then c.avatar_url
      else p.avatar_url
    end as sender_avatar_url,
    m.body,
    m.created_at
  from recent_messages m
  left join public.creators c on c.id = m.sender_id
  left join public.profiles p on p.id = m.sender_id
  order by m.created_at asc;
end;
$$;

create or replace function public.mark_chat_thread_read(
  p_thread_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
  now_at timestamptz := now();
  updated_read_at timestamptz;
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;

  update public.chat_threads t
  set
    last_read_by_creator_at = case
      when current_uid = t.creator_id then now_at
      else t.last_read_by_creator_at
    end,
    last_read_by_member_at = case
      when current_uid = t.member_id then now_at
      else t.last_read_by_member_at
    end,
    updated_at = now_at
  where t.id = p_thread_id
    and current_uid in (t.creator_id, t.member_id)
  returning case
    when current_uid = t.creator_id then t.last_read_by_creator_at
    else t.last_read_by_member_at
  end into updated_read_at;

  if updated_read_at is null then
    raise exception 'Chat not found';
  end if;

  return now_at;
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

  insert into public.notifications (
    user_id,
    type,
    payload
  )
  values (
    recipient_id,
    'chat_message',
    jsonb_build_object(
      'thread_id', target_thread.id,
      'message_id', inserted_message.id,
      'from_user_id', current_uid,
      'preview', left(normalized_body, 80)
    )
  );

  return query
  select target_thread.id, inserted_message.id, inserted_message.created_at;
end;
$$;

create or replace function public.get_chatable_creators()
returns table (
  creator_id uuid,
  display_name text,
  handle text,
  avatar_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;

  return query
  select distinct
    c.id as creator_id,
    c.display_name,
    c.handle,
    c.avatar_url
  from public.subscriptions s
  join public.creators c on c.id = s.creator_id
  where s.subscriber_id = current_uid
    and s.status = 'active'
    and (s.current_period_end is null or s.current_period_end > now())
  order by c.display_name;
end;
$$;

create or replace function public.get_chatable_members()
returns table (
  member_id uuid,
  display_name text,
  username text,
  avatar_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;

  if not exists (select 1 from public.creators c where c.id = current_uid) then
    raise exception 'Creator account required';
  end if;

  return query
  select distinct
    p.id as member_id,
    p.display_name,
    p.username,
    p.avatar_url
  from public.subscriptions s
  join public.profiles p on p.id = s.subscriber_id
  where s.creator_id = current_uid
    and s.status = 'active'
    and (s.current_period_end is null or s.current_period_end > now())
  order by coalesce(p.display_name, p.username, p.id::text);
end;
$$;

revoke all on function public.get_chat_threads() from public;
grant execute on function public.get_chat_threads() to authenticated;

revoke all on function public.get_chat_messages(uuid, integer) from public;
grant execute on function public.get_chat_messages(uuid, integer) to authenticated;

revoke all on function public.mark_chat_thread_read(uuid) from public;
grant execute on function public.mark_chat_thread_read(uuid) to authenticated;

revoke all on function public.send_chat_message(text, uuid, uuid, uuid) from public;
grant execute on function public.send_chat_message(text, uuid, uuid, uuid) to authenticated;

revoke all on function public.get_chatable_creators() from public;
grant execute on function public.get_chatable_creators() to authenticated;

revoke all on function public.get_chatable_members() from public;
grant execute on function public.get_chatable_members() to authenticated;

commit;
