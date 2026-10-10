-- Retire reproducible remote-import files without touching editor data or uploads.
alter table public.campus_imports add column artifacts_expired_at timestamptz;

create table public.campus_import_artifact_cleanup (
 campus_id text not null references public.campuses(id),
 import_id uuid not null,
 path text primary key,
 object_id uuid not null,
 bytes bigint not null,
 queued_at timestamptz not null default now(),
 deleted_at timestamptz,
 foreign key(campus_id,import_id) references public.campus_imports(campus_id,id)
);
alter table public.campus_import_artifact_cleanup enable row level security;
revoke all on public.campus_import_artifact_cleanup from public,anon,authenticated,service_role;
create index on public.campus_import_artifact_cleanup(campus_id,import_id) where deleted_at is null;
create index on public.campus_imports(campus_id,source_id,created_at desc);

create function public.import_artifact_path(campus text, job uuid, path text)
returns boolean language sql immutable set search_path=public as $$
 select coalesce(campus ~ '^[a-z0-9-]+$'
   and split_part(path,'/',1)=campus and split_part(path,'/',2)=job::text
   and path=campus || '/' || job::text || '/' || split_part(path,'/',3)
   and split_part(path,'/',3) ~ '^(snapshot|candidate)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$',false);
$$;

create function public.import_artifact_retention_eligible(target_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists (
  select 1 from campus_imports j join campus_sources s on s.campus_id=j.campus_id and s.id=j.source_id
  where j.campus_id=current_campus_id() and j.id=target_id
   and s.kind in ('arcgis','osm') and j.artifacts_expired_at is null
   and s.accepted_import_id is distinct from j.id
   and (j.snapshot_path is null or import_artifact_path(j.campus_id,j.id,j.snapshot_path))
   and (j.candidate_path is null or import_artifact_path(j.campus_id,j.id,j.candidate_path))
   and not exists(select 1 from campus_import_assets a where a.campus_id=j.campus_id and a.import_id=j.id)
   and not exists(select 1 from campus_imports active where active.campus_id=j.campus_id and active.source_id=j.source_id and active.status in ('queued','running'))
   and (
    -- Keep the two newest completed imports, regardless of age, and every completion for a day.
    (j.status='reviewed' and j.updated_at < now()-interval '1 day' and
     (select count(*) from campus_imports newer where newer.campus_id=j.campus_id and newer.source_id=j.source_id
       and newer.status='reviewed' and newer.artifacts_expired_at is null
       and (newer.created_at,newer.id)>(j.created_at,j.id)) >= 2)
    or (j.auto_queue and j.status in ('mapping','preview') and j.updated_at < now()-interval '1 day'
      and exists(select 1 from campus_imports newer where newer.campus_id=j.campus_id and newer.source_id=j.source_id
        and newer.status='reviewed' and newer.artifacts_expired_at is null and newer.created_at>j.created_at))
    or (j.status='cancelled' and j.updated_at < now()-interval '7 days')
    or (j.status='failed' and j.updated_at < now()-interval '7 days'
      and exists(select 1 from campus_imports newer where newer.campus_id=j.campus_id and newer.source_id=j.source_id
        and newer.status='reviewed' and newer.artifacts_expired_at is null and newer.created_at>j.created_at))
   )
 );
$$;

-- Storage metadata is read only here. Actual deletion must use the Storage API.
create function public.import_artifact_objects(target_id uuid)
returns table(path text,object_id uuid,bytes bigint)
language plpgsql stable security definer set search_path=public as $$
begin
 return query select o.name,o.id,coalesce((o.metadata->>'size')::bigint,0)
 from campus_imports j join storage.objects o on o.bucket_id='campus-imports'
  and o.name like j.campus_id || '/' || j.id::text || '/%'
 where j.campus_id=current_campus_id() and j.id=target_id
  and import_artifact_path(j.campus_id,j.id,o.name)
  and o.created_at < now()-interval '1 day'
  and o.updated_at < now()-interval '1 day'
  and not exists(select 1 from campus_import_assets a where a.path=o.name)
  and not exists(select 1 from campus_imports other where other.id<>j.id
    and (other.snapshot_path=o.name or other.candidate_path=o.name))
  and not exists(select 1 from campus_sources s where strpos(s.configuration::text,o.name)>0)
 order by o.name;
end $$;

create function public.plan_import_artifact_cleanup()
returns table(import_id uuid,path text,object_id uuid,bytes bigint,reason text)
language plpgsql stable security definer set search_path=public as $$
begin
 return query
 select x.import_id,x.path,x.object_id,x.bytes,x.reason from (
  select c.import_id,c.path,c.object_id,c.bytes,'retry'::text reason
  from campus_import_artifact_cleanup c where c.campus_id=current_campus_id() and c.deleted_at is null
  union all
  select j.id,o.path,o.object_id,o.bytes,'expired remote import'::text
  from campus_imports j cross join lateral import_artifact_objects(j.id) o
  where j.campus_id=current_campus_id() and import_artifact_retention_eligible(j.id)
   and (select count(*) from import_artifact_objects(j.id)) between 1 and 100
   and not exists(select 1 from unnest(array[j.snapshot_path,j.candidate_path]) p
     where p is not null and not exists(select 1 from import_artifact_objects(j.id) allowed where allowed.path=p))
 ) x order by x.import_id,x.path limit 500;
end $$;

create function public.protect_expired_import_artifacts()
returns trigger language plpgsql set search_path=public as $$
begin
 if old.artifacts_expired_at is not null and
  (new.artifacts_expired_at is distinct from old.artifacts_expired_at
   or new.snapshot_path is not null or new.candidate_path is not null
   or new.run_token is distinct from old.run_token
   or new.status is distinct from old.status) then
  raise sqlstate 'PT409' using message='These source files have expired. Start a new source check; the import summary and review data are retained.';
 end if;
 return new;
end $$;
create trigger protect_expired_import_artifacts before update on public.campus_imports
 for each row execute function public.protect_expired_import_artifacts();

create function public.claim_import_artifact_cleanup(target_id uuid)
returns table(path text,object_id uuid,bytes bigint)
language plpgsql security definer set search_path=public set lock_timeout='2s' set statement_timeout='10s' as $$
declare job campus_imports; file_count integer;
begin
 -- Same row-lock order as the review worker: import, then source.
 select * into job from campus_imports where campus_id=current_campus_id() and id=target_id for update;
 if not found then return; end if;
 perform 1 from campus_sources where campus_id=job.campus_id and id=job.source_id for update;
 if job.artifacts_expired_at is null then
  if not import_artifact_retention_eligible(job.id) then return; end if;
  select count(*) into file_count from import_artifact_objects(job.id);
  if file_count=0 or file_count>100 then return; end if;
  -- If a current file is recent/shared, preserve the whole import, including its retry paths.
  if exists(select 1 from unnest(array[job.snapshot_path,job.candidate_path]) p
    where p is not null and not exists(select 1 from import_artifact_objects(job.id) o where o.path=p)) then return; end if;
  insert into campus_import_artifact_cleanup(campus_id,import_id,path,object_id,bytes)
   select job.campus_id,job.id,o.path,o.object_id,o.bytes from import_artifact_objects(job.id) o;
  update campus_imports set artifacts_expired_at=now(),snapshot_path=null,candidate_path=null,
    status=case when status='reviewed' then status else 'cancelled' end,
    message='Source files expired under retention. Summary and review data are retained; start a new source check to fetch the source again.'
   where campus_id=job.campus_id and id=job.id;
 end if;
 -- Fail closed if a path was replaced or linked elsewhere between retries.
 if exists(select 1 from campus_import_artifact_cleanup c join storage.objects o on o.bucket_id='campus-imports' and o.name=c.path
   where c.campus_id=job.campus_id and c.import_id=job.id and c.deleted_at is null and o.id<>c.object_id)
  or exists(select 1 from campus_import_artifact_cleanup c where c.campus_id=job.campus_id and c.import_id=job.id and c.deleted_at is null
   and (exists(select 1 from campus_import_assets a where a.path=c.path)
    or exists(select 1 from campus_imports i where i.snapshot_path=c.path or i.candidate_path=c.path)
    or exists(select 1 from campus_sources s where strpos(s.configuration::text,c.path)>0))) then
  raise sqlstate 'PT409' using message='A cleanup file changed or acquired a reference; nothing was deleted.';
 end if;
 return query select c.path,c.object_id,c.bytes from campus_import_artifact_cleanup c
  where c.campus_id=job.campus_id and c.import_id=job.id and c.deleted_at is null order by c.path;
end $$;

create function public.finish_import_artifact_cleanup(target_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare finished integer;
begin
 if exists(select 1 from campus_import_artifact_cleanup c join storage.objects o on o.bucket_id='campus-imports' and o.name=c.path
   where c.campus_id=current_campus_id() and c.import_id=target_id and c.deleted_at is null) then
  raise sqlstate 'PT409' using message='Storage deletion is not complete; retry the cleanup.';
 end if;
 update campus_import_artifact_cleanup set deleted_at=now()
  where campus_id=current_campus_id() and import_id=target_id and deleted_at is null;
 get diagnostics finished=row_count;
 return finished;
end $$;

revoke all on function public.import_artifact_path(text,uuid,text),public.import_artifact_retention_eligible(uuid),public.import_artifact_objects(uuid),public.plan_import_artifact_cleanup(),public.protect_expired_import_artifacts(),public.claim_import_artifact_cleanup(uuid),public.finish_import_artifact_cleanup(uuid) from public,anon,authenticated,service_role;
grant execute on function public.plan_import_artifact_cleanup(),public.claim_import_artifact_cleanup(uuid),public.finish_import_artifact_cleanup(uuid) to service_role;
notify pgrst, 'reload schema';
