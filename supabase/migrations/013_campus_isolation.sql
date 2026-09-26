-- Additive campus identity. Legacy requests and every existing record remain LASU.
create table public.campuses (
  id text primary key,
  slug text not null unique check(slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name text not null check(length(name) between 1 and 160),
  boundary jsonb not null,
  bounds jsonb not null,
  created_at timestamptz not null default now()
);
insert into public.campuses(id,slug,name,boundary,bounds)
select 'lasu','lasu','LASU Ojo',payload->'boundary',payload->'bounds'
from public.source_features where entity='meta' limit 1;
insert into public.campuses(id,slug,name,boundary,bounds)
values('lasu','lasu','LASU Ojo','{"type":"Feature","properties":{"id":"lasu-boundary"},"geometry":{"type":"Polygon","coordinates":[[[3.190,6.455],[3.215,6.455],[3.215,6.489],[3.190,6.489],[3.190,6.455]]]}}','[[3.190,6.455],[3.215,6.489]]')
on conflict(id) do nothing;
alter table public.campuses enable row level security;
revoke all on public.campuses from public,anon,authenticated;
grant all on public.campuses to service_role;

create function public.current_campus_id() returns text language sql stable set search_path=public as $$
  select coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-turnright-campus','lasu');
$$;
create function public.protect_campus_identity() returns trigger language plpgsql as $$
begin
  if new.campus_id is distinct from old.campus_id then raise exception 'Campus identity is immutable'; end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['source_features','map_changes','map_edits','edit_history','reports','jobs','releases','editor_operations','surveys','survey_revisions','survey_chunks','baseline_reconciliations','source_field_reviews','building_media','model_assets'] loop
    execute format('alter table public.%I add column campus_id text not null default public.current_campus_id() references public.campuses(id)',t);
    execute format('create index on public.%I(campus_id)',t);
    execute format('create trigger immutable_campus before update on public.%I for each row execute function public.protect_campus_identity()',t);
  end loop;
end $$;
alter table public.source_features drop constraint source_features_pkey, add primary key(campus_id,id);
alter table public.map_changes drop constraint map_changes_pkey, add primary key(campus_id,id);
alter table public.map_edits drop constraint map_edits_pkey, add primary key(campus_id,id,kind);
alter table public.model_assets drop constraint model_assets_owner_sha256_key, add unique(campus_id,owner,sha256);
alter table public.releases add column catalogue_revision text;
-- Composite foreign keys prevent private evidence referring to another campus.
alter table public.surveys add unique(campus_id,id);
alter table public.survey_revisions add unique(campus_id,id);
alter table public.survey_revisions add foreign key(campus_id,survey_id) references public.surveys(campus_id,id);
alter table public.survey_chunks add foreign key(campus_id,revision_id) references public.survey_revisions(campus_id,id);
alter table public.surveys add foreign key(campus_id,head_revision) references public.survey_revisions(campus_id,id);

create or replace function public.save_editor_batch(operation_id uuid, actor_id uuid, items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare item jsonb; edit jsonb; previous map_edits; saved map_edits;
  receipt editor_operations; results jsonb := '[]'::jsonb;
begin
  if not exists(select 1 from admin_users where id = actor_id) then raise exception 'Editor access required'; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) < 1 or jsonb_array_length(items) > 500 then raise exception 'Invalid edit batch'; end if;
  -- The editor has one owner. A common lock also covers concurrent inserts and retries.
  perform pg_advisory_xact_lock(hashtext('turnright-editor:' || current_campus_id()));
  select * into receipt from editor_operations where campus_id=current_campus_id() and id = operation_id;
  if found then
    if receipt.actor <> actor_id or receipt.request is distinct from items then raise exception 'Operation ID reused with different edits'; end if;
    return receipt.result;
  end if;
  if (select count(*) from jsonb_array_elements(items)) <> (select count(distinct (x->'edit'->>'kind',x->'edit'->>'id')) from jsonb_array_elements(items) x) then raise exception 'Duplicate edit in batch'; end if;
  for item in select * from jsonb_array_elements(items) loop
    edit := item->'edit';
    select * into previous from map_edits where campus_id=current_campus_id() and id=edit->>'id' and kind=edit->>'kind' for update;
    if previous.updated_at is distinct from (item->>'expectedUpdatedAt')::timestamptz then
      raise sqlstate 'PT409' using message = 'This draft changed in another session. Your local work is preserved; review the conflict before retrying.';
    end if;
    insert into map_edits(id,kind,geometry,properties,deleted,edited_by,updated_at)
      values(edit->>'id',edit->>'kind',edit->'geometry',edit->'properties',coalesce((edit->>'deleted')::boolean,false),actor_id,clock_timestamp())
      on conflict(campus_id,id,kind) do update set geometry=excluded.geometry,properties=excluded.properties,deleted=excluded.deleted,edited_by=excluded.edited_by,updated_at=excluded.updated_at
      returning * into saved;
    results := results || jsonb_build_array(to_jsonb(saved));
  end loop;
  insert into editor_operations(id,actor,request,result) values(operation_id,actor_id,items,results);
  return results;
end $$;

create or replace function public.review_map_change(change_id text, accept_change boolean) returns void language plpgsql security definer set search_path = public as $$
declare change_record map_changes; current_hash text;
begin
 perform pg_advisory_xact_lock(hashtext('turnright-source-review:' || current_campus_id()));
 select * into change_record from map_changes where campus_id=current_campus_id() and id=change_id and status='pending' for update;
 if not found then raise exception 'Change is no longer pending'; end if;
 select hash into current_hash from source_features where campus_id=current_campus_id() and id=change_record.source_id for update;
 if current_hash is distinct from change_record.base_hash then raise exception 'Source changed since this proposal. Refresh the review queue.'; end if;
 if accept_change then
  if change_record.kind='remove' then delete from source_features where campus_id=current_campus_id() and id=change_record.source_id;
  else insert into source_features(id,source,entity,payload,hash) values(change_record.after->>'id',change_record.after->>'source',change_record.after->>'entity',change_record.after->'payload',change_record.after->>'hash') on conflict(campus_id,id) do update set source=excluded.source,entity=excluded.entity,payload=excluded.payload,hash=excluded.hash,updated_at=now(); end if;
 end if;
 update map_changes set status=case when accept_change then 'accepted' else 'rejected' end, reviewed_at=now() where campus_id=current_campus_id() and id=change_id;
end $$;

create or replace function public.review_map_fields(change_id text, expected_before jsonb, expected_after jsonb, reviewed_record jsonb, selected_fields jsonb, actor_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare proposal map_changes; current_hash text;
begin
 if not exists(select 1 from admin_users where id=actor_id) then raise exception 'Editor access required'; end if;
 perform pg_advisory_xact_lock(hashtext('turnright-source-review:' || current_campus_id()));
 select * into proposal from map_changes where campus_id=current_campus_id() and id=change_id and status='pending' for update;
 if not found or proposal.kind <> 'modify' then raise exception 'Change is no longer pending'; end if;
 if proposal.before is distinct from expected_before or proposal.after is distinct from expected_after then raise exception 'Proposal changed. Refresh review.'; end if;
 select hash into current_hash from source_features where campus_id=current_campus_id() and id=proposal.source_id for update;
 if current_hash is distinct from proposal.base_hash then raise exception 'Source changed. Refresh review.'; end if;
 if reviewed_record->>'id' <> proposal.source_id or reviewed_record->>'entity' <> proposal.before->>'entity' or jsonb_array_length(selected_fields)=0 then raise exception 'Invalid reviewed record'; end if;
 update source_features set payload=reviewed_record->'payload', hash=reviewed_record->>'hash', updated_at=now() where campus_id=current_campus_id() and id=proposal.source_id;
 insert into source_field_reviews(change_id,source_id,selected_fields,before_record,after_record,actor_id)
 values(proposal.id,proposal.source_id,selected_fields,proposal.before,reviewed_record,actor_id);
 update map_changes set before=reviewed_record, base_hash=reviewed_record->>'hash',
 status=case when reviewed_record->'payload'=proposal.after->'payload' then 'accepted' else 'pending' end,
 reviewed_at=case when reviewed_record->'payload'=proposal.after->'payload' then now() else null end
 where campus_id=current_campus_id() and id=proposal.id;
end $$;

drop function public.snapshot_release(text);
create function public.snapshot_release(release_summary text, catalogue_hash text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare release_id uuid;
begin
 perform pg_advisory_xact_lock(hashtext('turnright-release'));
 if exists(select 1 from releases where campus_id=current_campus_id() and status in ('queued','building')) then raise exception 'A release is already being built'; end if;
 insert into releases(summary,catalogue_revision,snapshot) values(release_summary,catalogue_hash,jsonb_build_object('features',(select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from source_features s where s.campus_id=current_campus_id()),'edits',(select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) from map_edits e where e.campus_id=current_campus_id()))) returning id into release_id;
 return release_id;
end $$;

create or replace function public.bootstrap_sources(records jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtext('turnright-source-bootstrap'));
 if exists(select 1 from source_features where campus_id=current_campus_id()) then raise exception 'Sources are already initialized'; end if;
 if jsonb_array_length(records)<1 then raise exception 'Incomplete source baseline'; end if;
 insert into source_features(id,source,entity,payload,hash) select x.id,x.source,x.entity,x.payload,x.hash from jsonb_to_recordset(records) as x(id text,source text,entity text,payload jsonb,hash text);
end $$;

create or replace function public._reconcile_published_baseline(actor uuid, published_version text, expected_sources jsonb, records jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare receipt uuid; baseline_matches boolean;
begin
  if not exists(select 1 from admin_users where id=actor) then raise exception 'Administrator required'; end if;
  if jsonb_typeof(records) is distinct from 'array' or jsonb_array_length(records) < 1 or jsonb_array_length(records) > 300000 then raise exception 'Invalid source snapshot'; end if;
  if jsonb_typeof(expected_sources) is distinct from 'array' then raise exception 'Invalid expected source snapshot'; end if;
  -- Also bind owned values in the implementation's statement context.
  expected_sources := expected_sources || '[]'::jsonb;
  records := records || '[]'::jsonb;
  if (select count(*) <> count(distinct x.id) from jsonb_to_recordset(records) as x(id text)) then raise exception 'Invalid source snapshot: duplicate key or missing ID'; end if;
  if not exists(select 1 from jsonb_array_elements(records) r where r->>'entity'='meta' and r->'payload'->>'version'=published_version) then raise exception 'Published version mismatch'; end if;
  lock table source_features in share row exclusive mode;
  with expected as materialized (
    select e->>'id' as id, e as record from jsonb_array_elements(expected_sources) e
  ), actual as materialized (
    select s.id, to_jsonb(s) as record from source_features s where s.campus_id=current_campus_id()
  )
  select
    (select count(*) = count(distinct id) from expected)
    and not exists (
      select 1 from expected e full join actual s on s.id=e.id
      where s.id is null or e.id is null or s.record is distinct from e.record
    ) into baseline_matches;
  if not baseline_matches then raise exception 'Source baseline changed; review it again'; end if;
  -- The locked, exact comparison established that this is the current snapshot.
  -- Reuse it for rollback instead of serializing and sorting the campus again.
  insert into baseline_reconciliations(actor_id,published_version,before_sources,after_sources)
    values(actor,published_version,expected_sources,records) returning id into receipt;
  -- Keep unchanged rows and their timestamps. Rewriting all campus records
  -- needlessly exceeds the API statement budget on small database instances.
  with incoming as materialized (
    select x.id from jsonb_to_recordset(records) as x(id text)
  )
  delete from source_features s
    where s.campus_id=current_campus_id() and s.id in (select e->>'id' from jsonb_array_elements(expected_sources) e)
      and not exists(select 1 from incoming i where i.id=s.id);
  insert into source_features(id,source,entity,payload,hash)
    select x.id,x.source,x.entity,x.payload,x.hash
    from jsonb_to_recordset(records) as x(id text,source text,entity text,payload jsonb,hash text)
    left join source_features s on s.campus_id=current_campus_id() and s.id=x.id
    where s.id is null or (s.source,s.entity,s.payload,s.hash) is distinct from (x.source,x.entity,x.payload,x.hash)
    on conflict(campus_id,id) do update set source=excluded.source,entity=excluded.entity,payload=excluded.payload,hash=excluded.hash,updated_at=now();
  return receipt;
end; $$;

create or replace function public.save_survey_revision(actor_id uuid, command text, payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s surveys; r survey_revisions; old_samples jsonb; idx integer; result_status text;
begin
  if not exists(select 1 from admin_users where id = actor_id) then raise exception 'Editor access required'; end if;
  perform pg_advisory_xact_lock(hashtext('turnright-surveys:' || actor_id::text));
  if command = 'begin' then
    if octet_length((payload->'metadata')::text) > 1000000 then raise exception 'Survey metadata too large'; end if;
    insert into surveys(id,owner) values((payload->>'surveyId')::uuid,actor_id) on conflict(id) do nothing;
    select * into s from surveys where campus_id=current_campus_id() and id=(payload->>'surveyId')::uuid;
    if s.id is null or s.owner <> actor_id then raise exception 'Survey owner mismatch'; end if;
    select * into r from survey_revisions where campus_id=current_campus_id() and id=(payload->>'revisionId')::uuid;
    if found then
      if r.owner <> actor_id or r.survey_id <> s.id or r.metadata is distinct from payload->'metadata' or r.chunk_count <> (payload->>'chunkCount')::integer or r.expected_revision is distinct from (payload->>'expectedRevision')::uuid then raise exception 'Operation ID reused with different survey'; end if;
    else
      insert into survey_revisions(id,survey_id,owner,expected_revision,metadata,chunk_count)
        values((payload->>'revisionId')::uuid,s.id,actor_id,(payload->>'expectedRevision')::uuid,payload->'metadata',(payload->>'chunkCount')::integer);
    end if;
    return jsonb_build_object('ok',true);
  end if;
  if command = 'archive' then
    select * into s from surveys where campus_id=current_campus_id() and id=(payload->>'surveyId')::uuid and owner=actor_id for update;
    if not found then raise exception 'Survey not found'; end if;
    if s.head_revision is distinct from (payload->>'expectedRevision')::uuid then raise sqlstate 'PT409' using message='Survey changed. Refresh before archiving.'; end if;
    update surveys set archived=(payload->>'archived')::boolean,updated_at=clock_timestamp() where campus_id=current_campus_id() and id=s.id;
    return jsonb_build_object('ok',true);
  end if;
  select * into r from survey_revisions where campus_id=current_campus_id() and id=(payload->>'revisionId')::uuid and owner=actor_id for update;
  if not found then raise exception 'Survey revision not found'; end if;
  if command = 'chunk' then
    idx := (payload->>'index')::integer;
    if idx < 0 or idx >= r.chunk_count or octet_length((payload->'samples')::text) > 200000 then raise exception 'Invalid recording chunk'; end if;
    select samples into old_samples from survey_chunks where campus_id=current_campus_id() and revision_id=r.id and chunk_index=idx;
    if found then
      if old_samples is distinct from payload->'samples' then raise exception 'Chunk retry contains different samples'; end if;
    else
      if r.status <> 'pending' then raise exception 'Finalized evidence is immutable'; end if;
      insert into survey_chunks(revision_id,chunk_index,owner,samples) values(r.id,idx,actor_id,payload->'samples');
    end if;
    return jsonb_build_object('ok',true);
  end if;
  if command <> 'finalize' then raise exception 'Invalid survey command'; end if;
  select * into s from surveys where campus_id=current_campus_id() and id=r.survey_id for update;
  if r.status = 'pending' then
    if (select count(*) from survey_chunks where campus_id=current_campus_id() and revision_id=r.id) <> r.chunk_count then raise exception 'Recording upload is incomplete'; end if;
    result_status := case when s.head_revision is not distinct from r.expected_revision then 'complete' else 'conflict' end;
    update survey_revisions set status=result_status where campus_id=current_campus_id() and id=r.id;
    if result_status = 'complete' then update surveys set head_revision=r.id,updated_at=clock_timestamp() where campus_id=current_campus_id() and id=s.id; end if;
  else result_status := r.status;
  end if;
  return jsonb_build_object('revisionId',r.id,'status',result_status,'headRevision',(select head_revision from surveys where campus_id=current_campus_id() and id=s.id));
end $$;

create or replace function public.audit_map_edit() returns trigger language plpgsql security definer set search_path = public as $$
begin
 insert into edit_history(campus_id,edit_id,before,after,actor) values(coalesce(new.campus_id,old.campus_id),coalesce(new.id,old.id),to_jsonb(old),to_jsonb(new),coalesce(new.edited_by,old.edited_by,auth.uid()));
 return coalesce(new,old);
end $$;

create or replace function public.protect_editable_model_draft()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.properties ? 'modelDocument' then raise exception 'Store editable model documents as immutable private assets'; end if;
  if (new.properties ? 'modelDocumentAsset' or (tg_op='UPDATE' and old.properties ? 'modelDocumentAsset'))
    and coalesce(current_setting('turnright.model_document_version',true),'') <> '1' then
    raise sqlstate 'PT409' using message='Update the editor before changing this authored model. Local changes are retained.';
  end if;
  if new.properties ? 'modelDocumentAsset' and not exists(
    select 1 from model_assets a where a.campus_id=new.campus_id and a.id::text=new.properties->'modelDocumentAsset'->>'id'
      and a.status='ready' and a.version=1 and a.owner=new.edited_by
      and a.sha256=new.properties->'modelDocumentAsset'->>'sha256'
      and a.bytes=(new.properties->'modelDocumentAsset'->>'bytes')::integer
  ) then raise exception 'The editable model asset is not verified for this owner'; end if;
  return new;
end $$;

create or replace function public.protect_release_snapshot() returns trigger language plpgsql as $$
begin
 if new.campus_id is distinct from old.campus_id or new.catalogue_revision is distinct from old.catalogue_revision or new.snapshot is distinct from old.snapshot or new.summary is distinct from old.summary then raise exception 'Release snapshots are immutable; create a new release'; end if;
 return new;
end $$;

notify pgrst, 'reload schema';

create function public.create_campus(identity jsonb, records jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
  insert into campuses(id,slug,name,boundary,bounds) values(identity->>'id',identity->>'slug',identity->>'name',identity->'boundary',identity->'bounds');
  insert into source_features(campus_id,id,source,entity,payload,hash)
    select identity->>'id',x.id,x.source,x.entity,x.payload,x.hash from jsonb_to_recordset(records) as x(id text,source text,entity text,payload jsonb,hash text);
end $$;
revoke all on function public.create_campus(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_campus(jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';

revoke all on function public.snapshot_release(text,text) from public,anon,authenticated;
grant execute on function public.snapshot_release(text,text) to service_role;
