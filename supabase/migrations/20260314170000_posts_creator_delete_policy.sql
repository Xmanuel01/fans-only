begin;

drop policy if exists "Posts: creator delete" on public.posts;

create policy "Posts: creator delete"
  on public.posts
  for delete
  using (
    auth.uid() = creator_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.age_confirmed_at is not null
    )
  );

commit;
