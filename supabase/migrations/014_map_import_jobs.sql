create table public.campus_sources (
 id uuid primary key,
 campus_id text not null default public.current_campus_id() references public.campuses(id),
 name text not null check(length(name) between 1 and 160),
 kind text not null check(kind in ('file','osm','arcgis')),
 url text,
 configuration jsonb not null default '{"layers":[],"attribution":"","license":"","redistributionConfirmed":false}',
 schedule text not null default 'manual' check(schedule in ('manual','daily')),
 accepted_import_id uuid,
 last_checked_at timestamptz,
 updated_at timestamptz not null default now(),
 unique(campus_id,id)
);
create table public.campus_imports (
 id uuid primary key,
 campus_id text not null default public.current_campus_id() references public.campuses(id),
 source_id uuid not null,
 status text not null default 'draft' check(status in ('draft','queued','running','mapping','preview','reviewed','cancelled','failed')),
 auto_queue boolean not null default false,
 phase text not null default 'inspect' check(phase in ('inspect','preview')),
 configuration jsonb not null,
 run_token uuid not null,
 message text,
 summary jsonb,
 snapshot_path text,
 candidate_path text,
 source_hash text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(campus_id,source_id) references public.campus_sources(campus_id,id),
 unique(campus_id,id)
);
create table public.campus_import_assets (
 id uuid primary key,
 campus_id text not null default public.current_campus_id() references public.campuses(id),
 import_id uuid not null,
 path text not null unique,
 name text not null,
 bytes bigint not null check(bytes > 0 and bytes <= 52428800),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 foreign key(campus_id,import_id) references public.campus_imports(campus_id,id)
);
do $$ declare t text; begin
 foreach t in array array['campus_sources','campus_imports','campus_import_assets'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create index on public.%I(campus_id)',t);
  execute format('create trigger immutable_campus before update on public.%I for each row execute function public.protect_campus_identity()',t);
 end loop;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('campus-imports','campus-imports',false,52428800,null)
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=null;

create function public.add_import_asset(asset jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare job campus_imports; total bigint; saved campus_import_assets;
begin
 select * into job from campus_imports where campus_id=current_campus_id() and id=(asset->>'import_id')::uuid for update;
 if not found or job.status <> 'draft' then raise exception 'Uploads are closed for this import'; end if;
 select * into saved from campus_import_assets where campus_id=current_campus_id() and import_id=job.id and name=asset->>'name';
 if found then
  if saved.sha256 <> asset->>'sha256' or saved.bytes <> (asset->>'bytes')::bigint then raise exception 'A different file already uses this name. Start a replacement import.'; end if;
  return to_jsonb(saved);
 end if;
 select coalesce(sum(bytes),0) into total from campus_import_assets where campus_id=current_campus_id() and import_id=job.id;
 if total+(asset->>'bytes')::bigint > 52428800 then raise exception 'Import upload batch exceeds 50 MiB'; end if;
 insert into campus_import_assets(id,import_id,path,name,bytes,sha256)
 values((asset->>'id')::uuid,job.id,asset->>'path',asset->>'name',(asset->>'bytes')::bigint,asset->>'sha256') returning * into saved;
 return to_jsonb(saved);
end $$;
revoke all on function public.add_import_asset(jsonb) from public,anon,authenticated;
grant execute on function public.add_import_asset(jsonb) to service_role;

-- Applying an import means creating review proposals, never publishing or replacing edits.
create function public.queue_campus_import(import_id uuid, expected_token uuid, proposals jsonb, expected_sources jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare job campus_imports; proposal jsonb; current_records jsonb; count_added integer := 0;
begin
 perform pg_advisory_xact_lock(hashtext('turnright-source-review:' || current_campus_id()));
 select * into job from campus_imports where campus_id=current_campus_id() and id=import_id for update;
 if not found or job.status <> 'preview' or job.run_token <> expected_token then raise exception 'This import is no longer ready for review'; end if;
 if jsonb_array_length(coalesce(job.summary->'errors','[]')) > 0 then raise exception 'Repair import errors before review'; end if;
 select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]') into current_records from source_features s where s.campus_id=current_campus_id();
 if current_records is distinct from expected_sources then raise exception 'The campus changed. Rebuild the import preview.'; end if;
 update map_changes set status='superseded' where campus_id=current_campus_id() and status='pending' and (after->>'source'='import:' || job.source_id::text or before->>'source'='import:' || job.source_id::text);
 for proposal in select * from jsonb_array_elements(proposals) loop
  insert into map_changes(id,source_id,kind,before,after,base_hash,summary)
  values(proposal->>'id',proposal->>'source_id',proposal->>'kind',nullif(proposal->'before','null'),nullif(proposal->'after','null'),proposal->>'base_hash',proposal->>'summary')
  on conflict(campus_id,id) do nothing;
  count_added := count_added+1;
 end loop;
 update campus_imports set status='reviewed',updated_at=now(),message='Changes queued for review' where campus_id=current_campus_id() and id=job.id;
 update campus_sources set configuration=job.configuration,accepted_import_id=job.id,updated_at=now() where campus_id=current_campus_id() and id=job.source_id;
 return count_added;
end $$;
revoke all on function public.queue_campus_import(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.queue_campus_import(uuid,uuid,jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';
