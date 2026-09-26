-- Deploy compatible readers before enabling version-1 model writes.
create table if not exists public.model_assets (
  id uuid primary key,
  owner uuid not null references auth.users(id),
  version integer not null check (version = 1),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  bytes integer not null check (bytes > 0 and bytes <= 26214400),
  path text not null unique,
  status text not null default 'pending' check (status in ('pending','ready')),
  created_at timestamptz not null default now(),
  unique(owner,sha256)
);
alter table public.model_assets enable row level security;
revoke all on public.model_assets from public,anon,authenticated;
grant all on public.model_assets to service_role;
create or replace function public.protect_model_asset_identity()
returns trigger language plpgsql set search_path=public as $$
begin
  if (new.id,new.owner,new.version,new.sha256,new.bytes,new.path) is distinct from
     (old.id,old.owner,old.version,old.sha256,old.bytes,old.path)
     or (old.status='ready' and new.status <> 'ready') then
    raise exception 'Verified model asset identity is immutable';
  end if;
  return new;
end $$;
drop trigger if exists protect_model_asset_identity on public.model_assets;
create trigger protect_model_asset_identity before update on public.model_assets for each row execute function public.protect_model_asset_identity();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('building-models','building-models',false,26214400,array['application/json'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- No client storage policies: upload and read URLs are short-lived and owner-authorized by the API.
create or replace function public.protect_editable_model_draft()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.properties ? 'modelDocument' then raise exception 'Store editable model documents as immutable private assets'; end if;
  if (new.properties ? 'modelDocumentAsset' or (tg_op='UPDATE' and old.properties ? 'modelDocumentAsset'))
    and coalesce(current_setting('turnright.model_document_version',true),'') <> '1' then
    raise sqlstate 'PT409' using message='Update the editor before changing this authored model. Local changes are retained.';
  end if;
  if new.properties ? 'modelDocumentAsset' and not exists(
    select 1 from model_assets a where a.id::text=new.properties->'modelDocumentAsset'->>'id'
      and a.status='ready' and a.version=1 and a.owner=new.edited_by
      and a.sha256=new.properties->'modelDocumentAsset'->>'sha256'
      and a.bytes=(new.properties->'modelDocumentAsset'->>'bytes')::integer
  ) then raise exception 'The editable model asset is not verified for this owner'; end if;
  return new;
end $$;
drop trigger if exists protect_editable_model_draft on public.map_edits;
create trigger protect_editable_model_draft before insert or update on public.map_edits for each row execute function public.protect_editable_model_draft();
create or replace function public.save_editor_model_batch(operation_id uuid,actor_id uuid,items jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  perform set_config('turnright.model_document_version','1',true);
  return public.save_editor_batch(operation_id,actor_id,items);
end $$;
revoke all on function public.save_editor_model_batch(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_editor_model_batch(uuid,uuid,jsonb) to service_role;
