-- Deploy before new workers. Generation is opt-in; guards are always active.
alter table campus_imports add column retrieval_receipt jsonb not null default '{}';
alter table campus_imports add column force_uncached boolean not null default false;
alter table campus_imports add column requested_by uuid references auth.users(id);
create table source_state_revisions (
 campus_id text primary key references campuses(id), revision bigint not null default 0
);
create function source_state_changed() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into source_state_revisions values(coalesce(new.campus_id,old.campus_id),1)
 on conflict(campus_id) do update set revision=source_state_revisions.revision+1;
 return coalesce(new,old);
end $$;
create trigger source_state_revision after insert or update or delete on source_features for each row execute function source_state_changed();
create table source_check_policy (
 campus_id text not null references campuses(id), source_key text not null, enabled boolean not null default false,
 primary key(campus_id,source_key)
);
create table source_check_runs (
 id uuid primary key, campus_id text not null references campuses(id), source_key text not null,
 token uuid not null, baseline_revision bigint not null, import_id uuid references campus_imports(id),
 status text not null default 'staging' check(status in ('staging','shadow','complete','failed','replaced')),
 receipt jsonb not null, manifest jsonb, diagnostics jsonb not null default '[]',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz
);
create unique index source_check_claim on source_check_runs(campus_id,source_key) where status='staging';
create index source_check_recent on source_check_runs(campus_id,created_at desc);
create table source_check_staging (
 run_id uuid not null references source_check_runs(id), kind text not null check(kind in ('observation','record','group','member')),
 ordinal integer not null, value jsonb not null, primary key(run_id,kind,ordinal)
);
create table source_verification_evidence (
 run_id uuid not null references source_check_runs(id), identity text not null, value jsonb not null,
 primary key(run_id,identity)
);
create table source_observations (
 run_id uuid not null references source_check_runs(id), campus_id text not null references campuses(id),
 identity text not null, value jsonb not null, primary key(run_id,identity)
);
create table source_accepted_observations (
 campus_id text not null references campuses(id), source_key text not null, identity text not null,
 run_id uuid not null, record_overrides jsonb not null default '{}', primary key(campus_id,source_key,identity),
 foreign key(run_id,identity) references source_observations(run_id,identity)
);
create table source_observation_records (
 run_id uuid not null, identity text not null, record_id text not null, value jsonb not null,
 primary key(run_id,identity,record_id), foreign key(run_id,identity) references source_observations(run_id,identity)
);
create table source_feature_lineage (
 campus_id text not null references campuses(id), source_key text not null, identity text not null, record_id text not null,
 primary key(campus_id,source_key,identity,record_id)
);
create index source_lineage_record on source_feature_lineage(campus_id,record_id);
create table source_proposal_groups (
 campus_id text not null references campuses(id), id text not null, run_id uuid not null references source_check_runs(id),
 source_key text not null, classification text not null, verification text not null,
 blocking_reasons jsonb not null, eligible boolean not null, features jsonb not null,
 member_count integer not null check(member_count between 1 and 300000), primary key(campus_id,id)
);
create table source_group_members (
 campus_id text not null, group_id text not null, record_id text not null, before_record jsonb, after_record jsonb,
 expected_hash text generated always as (before_record->>'hash') stored,
 primary key(campus_id,group_id,record_id), foreign key(campus_id,group_id) references source_proposal_groups(campus_id,id)
);
create table source_decision_receipts (
 id uuid primary key default gen_random_uuid(), campus_id text not null references campuses(id), group_id text,
 actor uuid, outcome text not null, reversal_of uuid references source_decision_receipts(id),
 members jsonb not null, observations_before jsonb not null default '[]', observations_after jsonb not null default '[]',
 evidence jsonb not null default '{}', created_at timestamptz not null default now(),
 unique(campus_id,reversal_of)
);
create index source_decisions_recent on source_decision_receipts(campus_id,created_at desc);
create index source_decisions_group on source_decision_receipts(campus_id,group_id,created_at desc);
create function immutable_source_receipt() returns trigger language plpgsql as $$
begin raise exception 'Source decision evidence is immutable'; end $$;
create trigger source_receipt_immutable before update or delete on source_decision_receipts for each row execute function immutable_source_receipt();
-- These records are private even to the generic REST service. Access uses the
-- campus and actor checked functions below; retention cannot cascade into them.
do $$ declare t text; begin
 foreach t in array array['source_state_revisions','source_check_policy','source_check_runs','source_check_staging','source_verification_evidence','source_observations','source_observation_records','source_accepted_observations','source_feature_lineage','source_proposal_groups','source_group_members','source_decision_receipts'] loop
  execute format('alter table %I enable row level security',t);
  execute format('revoke all on %I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

create function source_check_begin(run_id uuid,run_token uuid,source_identity text,check_receipt jsonb,import_identity uuid default null) returns jsonb
language plpgsql security definer set search_path=public set lock_timeout='2s' set statement_timeout='10s' as $$
declare r source_check_runs; rev bigint;
begin
 if length(source_identity) not between 1 and 200 or octet_length(check_receipt::text)>524288 then raise exception 'Invalid check receipt'; end if;
 perform pg_advisory_xact_lock(hashtext('source-check:'||current_campus_id()||':'||source_identity));
 select * into r from source_check_runs where id=run_id;
 if found then
  if r.campus_id<>current_campus_id() or r.token<>run_token or r.source_key<>source_identity or r.receipt<>check_receipt then raise exception 'Check identity already used'; end if;
  if r.status='failed' then
   if exists(select 1 from source_check_runs newer where newer.campus_id=r.campus_id and newer.source_key=r.source_key and newer.id<>r.id and (newer.status='staging' or newer.created_at>r.created_at)) then raise exception 'Check replaced by a newer run'; end if;
   update source_check_runs set status='staging',updated_at=now() where id=r.id;
   r.status:='staging';
  end if;
  return jsonb_build_object('id',r.id,'revision',r.baseline_revision,'status',r.status);
 end if;
 if import_identity is not null and not exists(select 1 from campus_imports i where i.campus_id=current_campus_id() and i.id=import_identity and i.run_token=source_check_begin.run_token and i.status in ('running','preview') and (i.requested_by is null or workspace_can(i.requested_by,'edit'))) then raise exception 'Import cancelled, replaced, or permission revoked'; end if;
 if exists(select 1 from source_check_runs c where campus_id=current_campus_id() and source_key=source_identity and status='staging' and updated_at>now()-interval '30 minutes' and (c.import_id is null or exists(select 1 from campus_imports i where i.id=c.import_id and i.run_token=c.token and i.status in ('running','preview')))) then raise exception 'A source check already holds this claim'; end if;
 update source_check_runs set status='replaced',completed_at=now() where campus_id=current_campus_id() and source_key=source_identity and status='staging';
 select coalesce((select revision from source_state_revisions where campus_id=current_campus_id()),0) into rev;
 insert into source_check_runs(id,campus_id,source_key,token,baseline_revision,receipt,import_id) values(run_id,current_campus_id(),source_identity,run_token,rev,check_receipt,import_identity);
 return jsonb_build_object('id',run_id,'revision',rev,'status','staging');
end $$;
create function source_check_baseline(run_id uuid,run_token uuid,part text,page_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=public set statement_timeout='10s' as $$
declare r source_check_runs; result jsonb;
begin
 select * into r from source_check_runs where id=run_id and campus_id=current_campus_id() and token=run_token and status='staging';
 if not found then raise exception 'Check cancelled or replaced'; end if;
 if r.import_id is not null and not exists(select 1 from campus_imports i where i.id=r.import_id and i.run_token=r.token and i.status in ('running','preview') and (i.requested_by is null or workspace_can(i.requested_by,'edit'))) then raise exception 'Import cancelled, replaced, or permission revoked'; end if;
 if page_offset<0 or page_offset>300000 then raise exception 'Invalid page'; end if;
 if r.baseline_revision<>coalesce((select revision from source_state_revisions where campus_id=r.campus_id),0) then raise exception 'Accepted state changed; restart the check'; end if;
 if part='records' then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select * from source_features where campus_id=r.campus_id order by id limit 1000 offset page_offset) q;
 elsif part='observations' then
  select coalesce(jsonb_agg(value),'[]') into result from (select o.value||jsonb_build_object('records',coalesce((select jsonb_agg(coalesce(a.record_overrides->x.record_id,x.value) order by x.record_id) from source_observation_records x where x.run_id=o.run_id and x.identity=o.identity),'[]')) value from source_accepted_observations a join source_observations o on o.run_id=a.run_id and o.identity=a.identity where a.campus_id=r.campus_id and a.source_key=r.source_key order by a.identity limit 1000 offset page_offset) q;
 elsif part='evidence' then
  select coalesce(jsonb_agg(jsonb_build_object('identity',identity,'value',value)),'[]') into result from (select identity,value from source_verification_evidence e where e.run_id=r.id order by identity limit 1000 offset page_offset) q;
 else raise exception 'Invalid baseline part'; end if;
 return result;
end $$;
create function source_check_stage(run_id uuid,run_token uuid,part text,start_offset integer,records jsonb) returns void
language plpgsql security definer set search_path=public set statement_timeout='10s' as $$
declare r source_check_runs;
begin
 select * into r from source_check_runs where id=run_id and campus_id=current_campus_id() and token=run_token and status='staging' for update;
 if not found then raise exception 'Check cancelled or replaced'; end if;
 if r.import_id is not null and not exists(select 1 from campus_imports i where i.id=r.import_id and i.run_token=r.token and i.status in ('running','preview') and (i.requested_by is null or workspace_can(i.requested_by,'edit'))) then raise exception 'Import cancelled, replaced, or permission revoked'; end if;
 if part not in ('observation','record','group','member') or start_offset<0 or start_offset+jsonb_array_length(records)>300000 or jsonb_array_length(records) not between 1 and 100 or octet_length(records::text)>524288 then raise exception 'Check batch exceeds bounds'; end if;
 insert into source_check_staging select run_id,part,start_offset+ord::integer-1,v from jsonb_array_elements(records) with ordinality q(v,ord) on conflict do nothing;
 if exists(select 1 from jsonb_array_elements(records) with ordinality q(v,ord) join source_check_staging s on s.run_id=r.id and s.kind=part and s.ordinal=start_offset+ord-1 where s.value<>v) then raise exception 'Check batch changed on retry'; end if;
 update source_check_runs set updated_at=now() where id=r.id;
end $$;
create function source_check_finish(run_id uuid,run_token uuid,counts jsonb,diagnostic_summary jsonb default '[]') returns jsonb
language plpgsql security definer set search_path=public set statement_timeout='60s' set lock_timeout='2s' as $$
declare r source_check_runs; enabled boolean; p text; n integer;
begin
 perform pg_advisory_xact_lock(hashtext('turnright-source-review:'||current_campus_id()));
 select * into r from source_check_runs where id=run_id and campus_id=current_campus_id() and token=run_token for update;
 if not found then raise exception 'Unknown check'; end if;
 if r.status in ('complete','shadow') then return jsonb_build_object('status',r.status,'counts',r.manifest); end if;
 if r.status<>'staging' then raise exception 'Check cancelled or replaced'; end if;
 if r.import_id is not null and not exists(select 1 from campus_imports i where i.id=r.import_id and i.campus_id=r.campus_id and i.run_token=r.token and i.status in ('running','preview') and (i.requested_by is null or workspace_can(i.requested_by,'edit'))) then raise exception 'Import cancelled, replaced, or permission revoked'; end if;
 lock table source_features in share mode;
 if r.baseline_revision<>coalesce((select revision from source_state_revisions where campus_id=r.campus_id),0) then raise exception 'Accepted state changed; restart the check'; end if;
 foreach p in array array['observation','record','group','member'] loop
  select count(*) into n from source_check_staging s where s.run_id=r.id and kind=p;
  if n is distinct from (counts->>p)::integer or (n>0 and n<>(select max(ordinal)+1 from source_check_staging s where s.run_id=r.id and kind=p)) then raise exception 'Incomplete check staging'; end if;
 end loop;
 insert into source_observations select r.id,r.campus_id,value->>'identity',value from source_check_staging s where s.run_id=r.id and kind='observation';
 insert into source_observation_records select r.id,value->>'identity',value#>>'{record,id}',value->'record' from source_check_staging s where s.run_id=r.id and kind='record';
 if exists(select 1 from source_observations o where o.run_id=r.id and (o.value->>'recordCount')::integer<>(select count(*) from source_observation_records x where x.run_id=o.run_id and x.identity=o.identity)) then raise exception 'Incomplete observation lineage'; end if;
 select coalesce((select q.enabled from source_check_policy q where campus_id=r.campus_id and source_key=r.source_key),false) into enabled;
 if enabled then
  perform set_config('turnright.source_finalization',r.id::text,true);
  -- A failed collection cannot retire another collection's proposals.
  update map_changes m set status='superseded' from source_proposal_groups g where m.campus_id=r.campus_id and g.campus_id=m.campus_id and m.id=g.id and m.status='pending' and g.source_key=r.source_key
   and (select receipt->>'configurationHash' from source_check_runs where id=g.run_id)=r.receipt->>'configurationHash'
   and not exists(select 1 from jsonb_array_elements(g.features) f where not exists(select 1 from jsonb_array_elements(r.receipt->'collections') c where (c->>'complete')::boolean and c->>'identity'=coalesce(f#>>'{observation,collection}',f#>>'{accepted,collection}')))
   and not exists(select 1 from source_check_staging s where s.run_id=r.id and s.kind='group' and s.value->>'id'=m.id);
  -- Retain rejected/accepted receipts and only reopen a recurring superseded revision.
  insert into source_proposal_groups(campus_id,id,run_id,source_key,classification,verification,blocking_reasons,eligible,features,member_count)
  select r.campus_id,value->>'id',r.id,r.source_key,value->>'classification',value->>'verification',value->'blockingReasons',(value->>'eligible')::boolean,value->'features',(value->>'memberCount')::integer
  from source_check_staging s where s.run_id=r.id and kind='group'
  on conflict(campus_id,id) do update set run_id=excluded.run_id,verification=excluded.verification,blocking_reasons=excluded.blocking_reasons,eligible=excluded.eligible,features=excluded.features,classification=excluded.classification,member_count=excluded.member_count;
  insert into source_group_members select r.campus_id,value->>'groupId',value->>'id',nullif(value->'before','null'),nullif(value->'after','null') from source_check_staging s where s.run_id=r.id and kind='member'
  on conflict(campus_id,group_id,record_id) do update set before_record=excluded.before_record,after_record=excluded.after_record
  where not exists(select 1 from map_changes m where m.campus_id=excluded.campus_id and m.id=excluded.group_id and m.status in ('accepted','rejected'));
  if exists(select 1 from source_proposal_groups g where g.run_id=r.id and g.member_count<>(select count(*) from source_group_members m where m.campus_id=g.campus_id and m.group_id=g.id)) then raise exception 'Incomplete dependency group'; end if;
  insert into map_changes(campus_id,id,source_id,kind,before,after,base_hash,summary)
  select r.campus_id,value->>'id',value->>'source_id',value->>'kind',nullif(value->'before','null'),nullif(value->'after','null'),value->>'base_hash',value->>'summary' from source_check_staging s where s.run_id=r.id and kind='group'
  on conflict(campus_id,id) do update set status='pending',reviewed_at=null,before=excluded.before,after=excluded.after,base_hash=excluded.base_hash
  where map_changes.status in ('superseded','pending') or (map_changes.status='accepted' and (select outcome from source_decision_receipts d where d.campus_id=map_changes.campus_id and d.group_id=map_changes.id order by d.created_at desc,d.id desc limit 1)='reversed');
 end if;
 update source_check_runs set status=case when enabled then 'complete' else 'shadow' end,manifest=counts,diagnostics=diagnostic_summary,completed_at=now() where id=r.id;
 if r.import_id is not null then
  update campus_imports set status='reviewed',message=case when enabled then 'Verified comparison queued; acceptance is separate' else 'Shadow comparison saved; proposal generation is disabled' end,updated_at=now() where id=r.import_id;
  update campus_sources s set configuration=i.configuration,last_checked_at=now(),updated_at=now() from campus_imports i where i.id=r.import_id and s.campus_id=r.campus_id and s.id=i.source_id;
 end if;
 -- Never advance accepted_import_id or the accepted observations here.
 return jsonb_build_object('status',case when enabled then 'complete' else 'shadow' end,'counts',counts);
end $$;

create function source_group_eligibility(change_id text) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare g source_proposal_groups; m map_changes; reasons jsonb;
begin
 select * into m from map_changes where campus_id=current_campus_id() and id=change_id;
 select * into g from source_proposal_groups where campus_id=current_campus_id() and id=change_id;
 if not found then
  reasons:=case when m.kind='remove' or coalesce(m.after,m.before)->>'entity' in ('node','edge') then '["Legacy routing or removal proposal needs a verified feature group. Run a new source check."]'::jsonb else '[]'::jsonb end;
  return jsonb_build_object('eligible',jsonb_array_length(reasons)=0,'blockingReasons',reasons,'classification','legacy','verification','unverified','dependencyCount',0);
 end if;
 reasons:=g.blocking_reasons;
 if exists(select 1 from source_group_members d left join source_features s on s.campus_id=d.campus_id and s.id=d.record_id where d.campus_id=g.campus_id and d.group_id=g.id and s.hash is distinct from d.expected_hash) then reasons:=reasons||'"Accepted records changed; a fresh comparison is required."'::jsonb; end if;
 if exists(select 1 from source_group_members where campus_id=g.campus_id and group_id=g.id and (before_record->>'evidenceUnavailable'='true' or after_record->>'evidenceUnavailable'='true')) then reasons:=reasons||'"Oversized record evidence is unavailable for acceptance."'::jsonb; end if;
 if g.member_count>1000 then reasons:=reasons||'"Connected group exceeds the atomic decision limit (1,000 records)."'::jsonb; end if;
 if exists(select 1 from source_group_members where campus_id=g.campus_id and group_id=g.id and after_record is null) and g.verification<>'verified' then reasons:=reasons||'"Source removal is not verified."'::jsonb; end if;
 if exists(select 1 from jsonb_array_elements(g.features) f where f->'observation'='null'::jsonb and (
  f#>>'{evidence,status}' is distinct from 'verified' or coalesce(f#>>'{evidence,method}','') not in ('osm-history','arcgis-object-id','arcgis-embedded','independent-overture-snapshot','declared-complete-file')
  or f#>>'{evidence,contentHash}' is distinct from f#>>'{accepted,contentHash}'
  or f#>>'{evidence,configurationHash}' is distinct from (select receipt->>'configurationHash' from source_check_runs where id=g.run_id)
  or not exists(select 1 from source_accepted_observations a join source_observations o on o.run_id=a.run_id and o.identity=a.identity where a.campus_id=g.campus_id and a.source_key=g.source_key and a.identity=f->>'identity' and o.value->>'contentHash'=f#>>'{accepted,contentHash}')
 )) then reasons:=reasons||'"Removal evidence does not match the accepted upstream observation and check scope."'::jsonb; end if;
 return jsonb_build_object('eligible',g.eligible and jsonb_array_length(reasons)=0,'blockingReasons',reasons,'classification',g.classification,'verification',g.verification,'dependencyCount',g.member_count,'groupId',g.id,'checkId',g.run_id);
end $$;
create function source_assert_eligible(change_id text) returns void language plpgsql security definer set search_path=public as $$
begin
 if not coalesce((source_group_eligibility(change_id)->>'eligible')::boolean,false) then raise sqlstate 'PT409' using message='Source group is blocked: '||(source_group_eligibility(change_id)->'blockingReasons')::text; end if;
end $$;
create function source_record_current(expected jsonb,record_identity text) returns boolean language sql stable security definer set search_path=public as $$
 select case when nullif(expected,'null') is null then not exists(select 1 from source_features where campus_id=current_campus_id() and id=record_identity)
 else exists(select 1 from source_features s where s.campus_id=current_campus_id() and s.id=record_identity
 and s.hash=expected->>'hash' and s.entity=expected->>'entity' and s.source=expected->>'source' and s.payload=expected->'payload'
 and coalesce(s.private_attributes,'{}')=coalesce(expected->'private_attributes','{}') and coalesce(s.gis_metadata,'{}')=coalesce(expected->'gis_metadata','{}')) end
$$;
revoke all on function source_record_current(jsonb,text) from public,anon,authenticated,service_role;
create function source_assert_revision(change_id text) returns void language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from source_proposal_groups where campus_id=current_campus_id() and id=change_id)
 and not exists(select 1 from map_changes where campus_id=current_campus_id() and id=change_id
  and current_setting('turnright.reviewed_revision',true)=jsonb_build_array(id,review_revision)::text)
 then raise sqlstate 'PT409' using message='Source review revision changed or is missing; reopen this group before deciding'; end if;
end $$;
revoke all on function source_assert_revision(text) from public,anon,authenticated,service_role;
-- Low-level endpoints are guarded too. Bulk and team wrappers call this function.
alter function review_map_change(text,boolean) rename to _legacy_review_map_change;
revoke all on function _legacy_review_map_change(text,boolean) from public,anon,authenticated,service_role;
create function review_map_change(change_id text,accept_change boolean) returns void language plpgsql security definer set search_path=public set statement_timeout='10s' as $$
declare g source_proposal_groups; m source_group_members; proposal map_changes; before_obs jsonb; after_obs jsonb; actor_id uuid;
begin
 perform pg_advisory_xact_lock(hashtext('turnright-source-review:'||current_campus_id()));
 select * into proposal from map_changes where campus_id=current_campus_id() and id=change_id and status='pending' for update;
 if not found then raise exception 'Change is no longer pending'; end if;
 perform source_assert_revision(change_id);
 if accept_change then perform source_assert_eligible(change_id); end if;
 perform set_config('turnright.source_decision',change_id,true);
 select * into g from source_proposal_groups where campus_id=current_campus_id() and id=change_id;
 if not found then
  perform _legacy_review_map_change(change_id,accept_change);
  insert into source_decision_receipts(campus_id,group_id,actor,outcome,members,evidence)
  values(current_campus_id(),change_id,nullif(current_setting('turnright.source_actor',true),'')::uuid,case when accept_change then 'accepted' else 'rejected' end,
   jsonb_build_array(jsonb_build_object('id',proposal.source_id,'before',proposal.before,'after',proposal.after)),jsonb_build_object('classification','legacy','revision',proposal.review_revision));
  return;
 end if;
 actor_id:=nullif(current_setting('turnright.source_actor',true),'')::uuid;
 if accept_change then
  for m in select * from source_group_members where campus_id=g.campus_id and group_id=g.id order by record_id loop
   if not source_record_current(m.before_record,m.record_id) then raise exception 'A dependency changed; review a fresh comparison'; end if;
   -- Removing a referenced source record is unsafe even when the original
   -- feature was deleted. Closures, explicit connections and overrides survive.
   if (m.after_record is null or m.before_record->>'entity' in ('node','edge')) and exists(select 1 from map_edits e where e.campus_id=g.campus_id and (e.id=m.record_id or e.id=regexp_replace(m.record_id,'^[^:]+:','') or strpos(e.properties::text,to_jsonb(regexp_replace(m.record_id,'^[^:]+:',''))::text)>0)) then raise exception 'An editor correction or protected connection depends on this record'; end if;
   if m.after_record is null and exists(select 1 from source_features s where s.campus_id=g.campus_id and s.entity in ('meta','place') and s.id<>m.record_id and strpos(s.payload::text,to_jsonb(regexp_replace(m.record_id,'^[^:]+:',''))::text)>0 and not exists(select 1 from source_group_members other where other.campus_id=g.campus_id and other.group_id=g.id and other.record_id=s.id and (other.after_record is null or strpos((other.after_record->'payload')::text,to_jsonb(regexp_replace(m.record_id,'^[^:]+:',''))::text)=0))) then raise exception 'A closure, entrance or accepted connection depends on this record'; end if;
  end loop;
  for m in select * from source_group_members where campus_id=g.campus_id and group_id=g.id loop
   if m.after_record is null then delete from source_features where campus_id=g.campus_id and id=m.record_id;
   else insert into source_features(campus_id,id,source,entity,payload,hash,private_attributes,gis_metadata)
    values(g.campus_id,m.record_id,m.after_record->>'source',m.after_record->>'entity',m.after_record->'payload',m.after_record->>'hash',coalesce(m.after_record->'private_attributes','{}'),coalesce(m.after_record->'gis_metadata','{}'))
    on conflict(campus_id,id) do update set source=excluded.source,entity=excluded.entity,payload=excluded.payload,hash=excluded.hash,private_attributes=excluded.private_attributes,gis_metadata=excluded.gis_metadata,updated_at=now(); end if;
  end loop;
  if exists(select 1 from source_features e where e.campus_id=g.campus_id and e.entity='edge'
   and exists(select 1 from source_group_members affected where affected.campus_id=g.campus_id and affected.group_id=g.id and affected.record_id in (e.id,'node:'||(e.payload->>'from'),'node:'||(e.payload->>'to')))
   and (not exists(select 1 from source_features n where n.campus_id=e.campus_id and n.id='node:'||(e.payload->>'from')) or not exists(select 1 from source_features n where n.campus_id=e.campus_id and n.id='node:'||(e.payload->>'to')))) then raise exception 'Routing dependencies are incomplete; no part of this group was applied'; end if;
  if exists(select 1 from source_group_members dependency where dependency.campus_id=g.campus_id and dependency.group_id=g.id and dependency.after_record->>'entity'='place'
   and dependency.after_record#>>'{payload,graphNode}' is not null and not exists(select 1 from source_features n where n.campus_id=g.campus_id and n.id='node:'||(dependency.after_record#>>'{payload,graphNode}'))) then raise exception 'An arrival connection has a missing routing node; no part of this group was applied'; end if;
  select coalesce(jsonb_agg(to_jsonb(a)),'[]') into before_obs from source_accepted_observations a where campus_id=g.campus_id and source_key=g.source_key and identity in (select f->>'identity' from jsonb_array_elements(g.features) f);
  delete from source_accepted_observations where campus_id=g.campus_id and source_key=g.source_key and identity in (select f->>'identity' from jsonb_array_elements(g.features) f);
  delete from source_feature_lineage where campus_id=g.campus_id and source_key=g.source_key and identity in (select f->>'identity' from jsonb_array_elements(g.features) f);
  insert into source_accepted_observations(campus_id,source_key,identity,run_id) select g.campus_id,g.source_key,f->>'identity',g.run_id from jsonb_array_elements(g.features) f where f->'observation'<>'null'::jsonb;
  insert into source_feature_lineage select g.campus_id,g.source_key,f->>'identity',r.record_id from jsonb_array_elements(g.features) f join source_observation_records r on r.run_id=g.run_id and r.identity=f->>'identity' on conflict do nothing;
  select coalesce(jsonb_agg(to_jsonb(a)),'[]') into after_obs from source_accepted_observations a where campus_id=g.campus_id and source_key=g.source_key and identity in (select f->>'identity' from jsonb_array_elements(g.features) f);
 end if;
 insert into source_decision_receipts(campus_id,group_id,actor,outcome,members,observations_before,observations_after,evidence)
 select g.campus_id,g.id,actor_id,case when accept_change then 'accepted' else 'rejected' end,
  coalesce(jsonb_agg(jsonb_build_object('id',record_id,'before',before_record,'after',after_record)),'[]'),coalesce(before_obs,'[]'),coalesce(after_obs,'[]'),jsonb_build_object('checkId',g.run_id,'features',g.features,'classification',g.classification)
 from source_group_members where campus_id=g.campus_id and group_id=g.id;
 update map_changes set status=case when accept_change then 'accepted' else 'rejected' end,reviewed_at=now() where campus_id=g.campus_id and id=g.id;
end $$;
create or replace function team_review_source(actor uuid,change_identity text,accept boolean) returns void language plpgsql security definer set search_path=public as $$
begin
 if not workspace_can(actor,'edit') then raise sqlstate 'PT403' using message='Editing permission required'; end if;
 perform set_config('turnright.source_actor',actor::text,true);
 perform review_map_change(change_identity,accept);
 insert into workspace_audit(campus_id,actor,action,subject,details) values(current_campus_id(),actor,'source-review',change_identity,jsonb_build_object('accepted',accept));
end $$;
-- Retire the old queue rather than let stale workers advance accepted state.
create or replace function finish_campus_import_queue(import_id uuid,expected_token uuid) returns integer language plpgsql security definer set search_path=public as $$
begin raise exception 'Update the import worker: a verified source comparison is required'; end $$;

-- Guard both partial-field entry points. Descriptive decisions retain the raw
-- accepted observation and separately record which accepted record fields moved.
alter function _review_map_fields(text,jsonb,jsonb,jsonb,jsonb,uuid) rename to _legacy_review_map_fields;
revoke all on function _legacy_review_map_fields(text,jsonb,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated,service_role;
create function _review_map_fields(change_id text,expected_before jsonb,expected_after jsonb,reviewed_record jsonb,selected_fields jsonb,actor_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare g source_proposal_groups; before_obs jsonb; after_obs jsonb; key text; a jsonb; b jsonb; allowed text[];
begin
 if not workspace_can(actor_id,'edit') then raise sqlstate 'PT403' using message='Editing permission required'; end if;
 perform pg_advisory_xact_lock(hashtext('turnright-source-review:'||current_campus_id()));
 perform source_assert_revision(change_id);
 perform source_assert_eligible(change_id);
 if not source_record_current(expected_before,expected_before->>'id') then raise exception 'Accepted source record changed; review a fresh comparison'; end if;
 perform set_config('turnright.source_decision',change_id,true);
 allowed:=case when expected_before->>'entity'='feature' then array['properties.name','properties.aliases'] when expected_before->>'entity'='place' then array['name','aliases','category','department','faculty','subtype','address','phone','website','openingHours','businessStatus'] else array[]::text[] end;
 a:=reviewed_record->'payload'; b:=expected_before->'payload';
 for key in select jsonb_array_elements_text(selected_fields) loop
  if not key=any(allowed) then raise exception 'Only supported descriptive fields can be accepted separately'; end if;
  if (a#>string_to_array(key,'.')) is distinct from (expected_after#>(array['payload']||string_to_array(key,'.'))) then raise exception 'Selected value does not match the source proposal'; end if;
  a:=a#-string_to_array(key,'.'); b:=b#-string_to_array(key,'.');
 end loop;
 if (a-'evidence')#-array['properties','evidence'] is distinct from (b-'evidence')#-array['properties','evidence'] then raise exception 'Descriptive review cannot change geometry or routing'; end if;
 select * into g from source_proposal_groups where campus_id=current_campus_id() and id=change_id;
 if found then select coalesce(jsonb_agg(to_jsonb(o)),'[]') into before_obs from source_accepted_observations o where campus_id=g.campus_id and source_key=g.source_key and identity in (select f->>'identity' from jsonb_array_elements(g.features) f); end if;
 perform _legacy_review_map_fields(change_id,expected_before,expected_after,reviewed_record,selected_fields,actor_id);
 if g.id is not null then
  update source_group_members set before_record=reviewed_record where campus_id=g.campus_id and group_id=g.id and record_id=reviewed_record->>'id';
  update map_changes set status='pending',reviewed_at=null where campus_id=g.campus_id and id=g.id;
  update source_accepted_observations o set record_overrides=record_overrides||jsonb_build_object(reviewed_record->>'id',reviewed_record) where campus_id=g.campus_id and source_key=g.source_key and identity in (select l.identity from source_feature_lineage l where l.campus_id=g.campus_id and l.source_key=g.source_key and l.record_id=reviewed_record->>'id');
  select coalesce(jsonb_agg(to_jsonb(o)),'[]') into after_obs from source_accepted_observations o where campus_id=g.campus_id and source_key=g.source_key and identity in (select f->>'identity' from jsonb_array_elements(g.features) f);
 end if;
 insert into source_decision_receipts(campus_id,group_id,actor,outcome,members,observations_before,observations_after,evidence) values(current_campus_id(),change_id,actor_id,'accepted',jsonb_build_array(jsonb_build_object('id',reviewed_record->>'id','before',expected_before,'after',reviewed_record)),coalesce(before_obs,'[]'),coalesce(after_obs,'[]'),jsonb_build_object('fields',selected_fields,'checkId',g.run_id));
end $$;

do $$ declare f record; begin
 for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname in ('source_check_begin','source_check_baseline','source_check_stage','source_check_finish','source_group_eligibility','source_assert_eligible','review_map_change','_review_map_fields') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);
  execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
notify pgrst,'reload schema';
