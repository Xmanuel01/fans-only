begin;

alter table public.creators
  add column if not exists banner_url text,
  add column if not exists banner_media_type text
    check (banner_media_type in ('image', 'video'));

insert into storage.buckets (id, name, public)
values ('creator-profiles', 'creator-profiles', true)
on conflict (id) do nothing;

drop policy if exists "Creator profiles: insert own" on storage.objects;
drop policy if exists "Creator profiles: update own" on storage.objects;
drop policy if exists "Creator profiles: delete own" on storage.objects;

create policy "Creator profiles: insert own"
  on storage.objects
  for insert
  with check (
    bucket_id = 'creator-profiles'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Creator profiles: update own"
  on storage.objects
  for update
  using (
    bucket_id = 'creator-profiles'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Creator profiles: delete own"
  on storage.objects
  for delete
  using (
    bucket_id = 'creator-profiles'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

commit;
