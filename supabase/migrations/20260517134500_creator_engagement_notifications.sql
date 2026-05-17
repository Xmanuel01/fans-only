begin;

create or replace function public.notify_creator_post_engagement(
  p_post_id bigint,
  p_event text,
  p_comment_body text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
  normalized_event text := lower(trim(coalesce(p_event, '')));
  normalized_comment text := left(btrim(coalesce(p_comment_body, '')), 280);
  v_post public.posts%rowtype;
  v_actor_name text := 'A fan';
  v_actor_username text := null;
  v_notification_type text;
  v_post_title text;
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;

  if normalized_event not in ('like', 'comment') then
    raise exception 'Unsupported engagement event';
  end if;

  if normalized_event = 'comment' and normalized_comment = '' then
    raise exception 'Comment body is required';
  end if;

  select *
  into v_post
  from public.posts
  where id = p_post_id;

  if not found then
    raise exception 'Post not found';
  end if;

  if v_post.creator_id is null or v_post.creator_id = current_uid then
    return;
  end if;

  select
    coalesce(nullif(display_name, ''), nullif(username, ''), 'A fan'),
    username
  into
    v_actor_name,
    v_actor_username
  from public.profiles
  where id = current_uid;

  v_notification_type := case
    when v_post.post_type = 'story' and normalized_event = 'like' then 'story_liked'
    when v_post.post_type = 'story' and normalized_event = 'comment' then 'story_commented'
    when normalized_event = 'like' then 'post_liked'
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
      'comment_body', case when normalized_event = 'comment' then normalized_comment else null end
    ),
    'content'
  );
end;
$$;

commit;
