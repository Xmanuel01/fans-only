begin;

create table if not exists public.post_likes (
  post_id bigint not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_comments (
  id bigserial primary key,
  post_id bigint not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint post_comments_body_length check (char_length(btrim(body)) between 1 and 1000)
);

create index if not exists post_likes_user_created_idx
  on public.post_likes (user_id, created_at desc);

create index if not exists post_comments_post_created_idx
  on public.post_comments (post_id, created_at asc);

alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;

create or replace function public.can_view_post(
  p_post_id bigint,
  p_user_id uuid
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
        p.creator_id = p_user_id
        or (
          exists (
            select 1
            from public.profiles pr
            where pr.id = p_user_id
              and pr.age_confirmed_at is not null
          )
          and (
            p.visibility = 'public'
            or (
              p.visibility = 'subscribers'
              and exists (
                select 1
                from public.subscriptions s
                where s.creator_id = p.creator_id
                  and s.subscriber_id = p_user_id
                  and s.status = 'active'
                  and (s.current_period_end is null or s.current_period_end > now())
              )
            )
            or (
              p.visibility = 'ppv'
              and exists (
                select 1
                from public.ppv_purchases ppv
                where ppv.post_id = p.id
                  and ppv.user_id = p_user_id
              )
            )
          )
        )
      from public.posts p
      where p.id = p_post_id
    ),
    false
  );
$$;

drop policy if exists "Post likes: select visible posts" on public.post_likes;
drop policy if exists "Post comments: select visible posts" on public.post_comments;

create policy "Post likes: select visible posts"
  on public.post_likes
  for select
  using (public.can_view_post(post_id, auth.uid()));

create policy "Post comments: select visible posts"
  on public.post_comments
  for select
  using (public.can_view_post(post_id, auth.uid()));

create or replace function public.get_post_social_state(
  p_post_ids bigint[]
)
returns table (
  post_id bigint,
  liked_by_user_ids uuid[],
  comments jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with requested as (
    select distinct unnest(coalesce(p_post_ids, '{}'::bigint[])) as post_id
  ),
  visible as (
    select r.post_id
    from requested r
    where public.can_view_post(r.post_id, auth.uid())
  )
  select
    v.post_id,
    coalesce(
      (
        select array_agg(l.user_id order by l.created_at asc)
        from public.post_likes l
        where l.post_id = v.post_id
      ),
      array[]::uuid[]
    ) as liked_by_user_ids,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', c.id::text,
            'author', coalesce(nullif(p.display_name, ''), nullif(p.username, ''), 'Fan'),
            'body', c.body,
            'created_at', c.created_at
          )
          order by c.created_at asc
        )
        from public.post_comments c
        left join public.profiles p on p.id = c.user_id
        where c.post_id = v.post_id
      ),
      '[]'::jsonb
    ) as comments
  from visible v;
$$;

create or replace function public.toggle_post_like(
  p_post_id bigint
)
returns table (
  liked boolean,
  like_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
  v_post public.posts%rowtype;
  v_deleted integer := null;
  v_actor_name text := 'A fan';
  v_actor_username text := null;
  v_post_title text;
  v_notification_type text;
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_post
  from public.posts
  where id = p_post_id;

  if not found then
    raise exception 'Post not found';
  end if;

  if not public.can_view_post(p_post_id, current_uid) then
    raise exception 'Post is not available';
  end if;

  delete from public.post_likes
  where post_id = p_post_id
    and user_id = current_uid
  returning 1 into v_deleted;

  if v_deleted is null then
    insert into public.post_likes (post_id, user_id)
    values (p_post_id, current_uid)
    on conflict do nothing;

    liked := true;

    if v_post.creator_id is not null and v_post.creator_id <> current_uid then
      select
        coalesce(nullif(display_name, ''), nullif(username, ''), 'A fan'),
        username
      into
        v_actor_name,
        v_actor_username
      from public.profiles
      where id = current_uid;

      v_notification_type := case
        when v_post.post_type = 'story' then 'story_liked'
        else 'post_liked'
      end;

      v_post_title := coalesce(
        nullif(v_post.title, ''),
        nullif(v_post.body, ''),
        case when v_post.post_type = 'story' then 'Story' else 'Post' end
      );

      perform public.create_notification_if_enabled(
        v_post.creator_id,
        v_notification_type,
        jsonb_build_object(
          'post_id', v_post.id,
          'post_type', v_post.post_type,
          'post_title', left(v_post_title, 120),
          'actor_id', current_uid,
          'actor_name', v_actor_name,
          'actor_username', v_actor_username
        ),
        'content'
      );
    end if;
  else
    liked := false;
  end if;

  select count(*)::integer
  into like_count
  from public.post_likes
  where post_id = p_post_id;

  return next;
end;
$$;

create or replace function public.add_post_comment(
  p_post_id bigint,
  p_body text
)
returns table (
  id text,
  author text,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
  normalized_body text := left(btrim(coalesce(p_body, '')), 1000);
  v_post public.posts%rowtype;
  v_comment public.post_comments%rowtype;
  v_actor_name text := 'A fan';
  v_actor_username text := null;
  v_post_title text;
  v_notification_type text;
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;

  if normalized_body = '' then
    raise exception 'Comment body is required';
  end if;

  select *
  into v_post
  from public.posts
  where id = p_post_id;

  if not found then
    raise exception 'Post not found';
  end if;

  if not public.can_view_post(p_post_id, current_uid) then
    raise exception 'Post is not available';
  end if;

  select
    coalesce(nullif(display_name, ''), nullif(username, ''), 'A fan'),
    username
  into
    v_actor_name,
    v_actor_username
  from public.profiles
  where id = current_uid;

  insert into public.post_comments (post_id, user_id, body)
  values (p_post_id, current_uid, normalized_body)
  returning * into v_comment;

  if v_post.creator_id is not null and v_post.creator_id <> current_uid then
    v_notification_type := case
      when v_post.post_type = 'story' then 'story_commented'
      else 'post_commented'
    end;

    v_post_title := coalesce(
      nullif(v_post.title, ''),
      nullif(v_post.body, ''),
      case when v_post.post_type = 'story' then 'Story' else 'Post' end
    );

    perform public.create_notification_if_enabled(
      v_post.creator_id,
      v_notification_type,
      jsonb_build_object(
        'post_id', v_post.id,
        'post_type', v_post.post_type,
        'post_title', left(v_post_title, 120),
        'actor_id', current_uid,
        'actor_name', v_actor_name,
        'actor_username', v_actor_username,
        'comment_body', normalized_body
      ),
      'content'
    );
  end if;

  return query
  select v_comment.id::text, v_actor_name, v_comment.body, v_comment.created_at;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.post_likes;
    exception
      when duplicate_object then null;
    end;

    begin
      alter publication supabase_realtime add table public.post_comments;
    exception
      when duplicate_object then null;
    end;
  end if;
end;
$$;

revoke all on function public.get_post_social_state(bigint[]) from public;
grant execute on function public.get_post_social_state(bigint[]) to authenticated;

revoke all on function public.toggle_post_like(bigint) from public;
grant execute on function public.toggle_post_like(bigint) to authenticated;

revoke all on function public.add_post_comment(bigint, text) from public;
grant execute on function public.add_post_comment(bigint, text) to authenticated;

commit;
