-- Original photographs, processing records and reviewer identity stay owner-only.
create table public.building_media (
  id uuid primary key,
  owner uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending','processed','approved')),
  original_path text not null,
  derivative_path text,
  original_sha256 text,
  public_metadata jsonb,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (status <> 'approved' or (public_metadata is not null and reviewed_at is not null and derivative_path is not null))
);
alter table public.building_media enable row level security;
revoke all on public.building_media from anon, authenticated;
grant select on public.building_media to authenticated;
grant all on public.building_media to service_role;
create policy owner_reads_building_media on public.building_media for select to authenticated
  using (owner = auth.uid() and exists (select 1 from public.admin_users where id = auth.uid()));
create index building_media_owner on public.building_media(owner,created_at desc);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('building-media','building-media',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=10485760,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];
-- No public storage policy: uploads use bounded owner-authorized signed URLs;
-- originals and derivatives are read only by the server until release packaging.

create function public.freeze_approved_building_media() returns trigger
language plpgsql set search_path=public as $$
begin
  if old.status = 'approved' then raise exception 'Approved photograph records are immutable'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger freeze_approved_building_media before update or delete on public.building_media
  for each row execute function public.freeze_approved_building_media();
revoke all on function public.freeze_approved_building_media() from public,anon,authenticated;
