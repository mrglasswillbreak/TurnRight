-- Pack bounded check batches so PostgreSQL compresses repeated keys/geometry.
-- Identical batches share one campus-private payload. Receipts remain permanent.
create table source_check_payloads (
 campus_id text not null references campuses(id), digest text not null,
 value jsonb not null check(jsonb_typeof(value)='array'),
 primary key(campus_id,digest)
);
create table source_check_pages (
 run_id uuid not null references source_check_runs(id), campus_id text not null,
 kind text not null check(kind in ('observation','record','group','member')),
 ordinal integer not null, item_count integer not null check(item_count between 1 and 100),
 digest text not null, primary key(run_id,kind,ordinal),
 foreign key(campus_id,digest) references source_check_payloads(campus_id,digest)
);
create index source_check_page_payload on source_check_pages(campus_id,digest);
create index source_group_run on source_proposal_groups(run_id);
create index source_decision_before_observations on source_decision_receipts using gin(observations_before jsonb_path_ops);
create index source_decision_after_observations on source_decision_receipts using gin(observations_after jsonb_path_ops);
create index source_decision_evidence_refs on source_decision_receipts using gin(evidence jsonb_path_ops);
create index source_accepted_observation_run on source_accepted_observations(run_id,identity);
alter table source_check_payloads enable row level security;
alter table source_check_pages enable row level security;
revoke all on source_check_payloads,source_check_pages from public,anon,authenticated,service_role;
alter table source_check_runs add column evidence_retention jsonb not null default '{}';

-- Compatibility reader also supports interrupted pre-upgrade checks.
create function _source_check_rows(check_id uuid,part text,min_ordinal integer default 0,max_ordinal integer default 300000)
returns table(ordinal integer,value jsonb) language sql stable security definer set search_path=public as $$
 select s.ordinal,s.value from source_check_staging s join source_check_runs r on r.id=s.run_id
 where s.run_id=check_id and s.kind=part and r.campus_id=current_campus_id() and s.ordinal>=min_ordinal and s.ordinal<max_ordinal
 union all
 select p.ordinal+x.n::integer-1,x.value from source_check_pages p
 join source_check_payloads b on b.campus_id=p.campus_id and b.digest=p.digest
 cross join lateral jsonb_array_elements(b.value) with ordinality x(value,n)
 where p.run_id=check_id and p.kind=part and p.campus_id=current_campus_id()
 and p.ordinal<max_ordinal and p.ordinal+p.item_count>min_ordinal
 and p.ordinal>=greatest(0,min_ordinal-99)
 and p.ordinal+x.n-1>=min_ordinal and p.ordinal+x.n-1<max_ordinal
$$;
create function _source_check_store(check_id uuid,part text,start_offset integer,items jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare fingerprint text:=md5(items::text); stored jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('turnright-source-storage:'||current_campus_id()));
 if jsonb_array_length(items) not between 1 and 100 or octet_length(items::text)>524288 then raise exception 'Check batch exceeds bounds'; end if;
 insert into source_check_payloads values(current_campus_id(),fingerprint,items) on conflict do nothing;
 select value into stored from source_check_payloads where campus_id=current_campus_id() and digest=fingerprint;
 -- The digest is a deduplication index, never an unchecked content identity.
 if stored is distinct from items then raise exception 'Evidence digest collision'; end if;
 insert into source_check_pages values(check_id,current_campus_id(),part,start_offset,jsonb_array_length(items),fingerprint)
 on conflict do nothing;
 if not exists(select 1 from source_check_pages where run_id=check_id and kind=part and ordinal=start_offset and digest=fingerprint and item_count=jsonb_array_length(items)) then raise exception 'Check batch changed on retry'; end if;
end $$;
create function _source_observation_pinned(check_id uuid,feature_identity text) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from source_accepted_observations a where a.run_id=check_id and a.identity=feature_identity)
 or exists(select 1 from source_proposal_groups g where g.run_id=check_id
  and g.features @> jsonb_build_array(jsonb_build_object('observation',jsonb_build_object('identity',feature_identity))))
 or exists(select 1 from source_decision_receipts d where d.campus_id=current_campus_id() and
  (d.observations_before @> jsonb_build_array(jsonb_build_object('run_id',check_id,'identity',feature_identity))
   or d.observations_after @> jsonb_build_array(jsonb_build_object('run_id',check_id,'identity',feature_identity))
   or d.evidence @> jsonb_build_object('checkId',check_id,'features',jsonb_build_array(jsonb_build_object('observation',jsonb_build_object('identity',feature_identity))))))
$$;

create or replace function source_check_stage(run_id uuid,run_token uuid,part text,start_offset integer,records jsonb) returns void
language plpgsql security definer set search_path=public set statement_timeout='10s' as $$
declare r source_check_runs; existing_count integer;
begin
 select * into r from source_check_runs where id=run_id and campus_id=current_campus_id() and token=run_token and status='staging' for update;
 if not found then raise exception 'Check cancelled or replaced'; end if;
 if r.import_id is not null and not exists(select 1 from campus_imports i where i.id=r.import_id and i.run_token=r.token and i.status in ('running','preview') and (i.requested_by is null or workspace_can(i.requested_by,'edit'))) then raise exception 'Import cancelled, replaced, or permission revoked'; end if;
 if part not in ('observation','record','group','member') or start_offset<0 or start_offset+jsonb_array_length(records)>300000 or jsonb_array_length(records) not between 1 and 100 or octet_length(records::text)>524288 then raise exception 'Check batch exceeds bounds'; end if;
 -- Locking the run serializes overlapping/retried batches before deduplication.
 select count(*) into existing_count from _source_check_rows(r.id,part,start_offset,start_offset+jsonb_array_length(records)) s
 where s.ordinal>=start_offset and s.ordinal<start_offset+jsonb_array_length(records);
 if existing_count>0 then
  if existing_count<>jsonb_array_length(records) or exists(
   select 1 from jsonb_array_elements(records) with ordinality q(v,n)
   left join _source_check_rows(r.id,part,start_offset,start_offset+jsonb_array_length(records)) s on s.ordinal=start_offset+n-1
   where s.value is distinct from v) then raise exception 'Check batch changed on retry'; end if;
 else perform _source_check_store(r.id,part,start_offset,records);
 end if;
 update source_check_runs set updated_at=now() where id=r.id;
end $$;

create or replace function source_check_finish(run_id uuid,run_token uuid,counts jsonb,diagnostic_summary jsonb default '[]') returns jsonb
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
  select count(*) into n from _source_check_rows(r.id,p) s;
  if n is distinct from (counts->>p)::integer or (n>0 and n<>(select max(ordinal)+1 from _source_check_rows(r.id,p) s)) then raise exception 'Incomplete check staging'; end if;
 end loop;
 if exists(
  with observations as materialized (select value->>'identity' identity,(value->>'recordCount')::integer expected from _source_check_rows(r.id,'observation')),
  records as materialized (select value->>'identity' identity,count(*) actual from _source_check_rows(r.id,'record') group by value->>'identity')
  select 1 from observations o full join records x using(identity)
  where o.identity is null or o.expected is null or o.expected<>coalesce(x.actual,0)
  union all select 1 from _source_check_rows(r.id,'observation') group by value->>'identity' having count(*)>1
 ) then raise exception 'Incomplete observation lineage'; end if;
 select coalesce((select q.enabled from source_check_policy q where campus_id=r.campus_id and source_key=r.source_key),false) into enabled;
 -- Raw observations/records stay losslessly packed. Only review dependencies
 -- need individual rows and foreign keys for acceptance and guided undo.
 if enabled then
  insert into source_observations
  select r.id,r.campus_id,o.value->>'identity',o.value from _source_check_rows(r.id,'observation') o
  where o.value->>'identity' in (
   select f#>>'{observation,identity}' from _source_check_rows(r.id,'group') g
   cross join lateral jsonb_array_elements(g.value->'features') f);
  insert into source_observation_records
  select r.id,s.value->>'identity',s.value#>>'{record,id}',s.value->'record'
  from _source_check_rows(r.id,'record') s
  where exists(select 1 from source_observations o where o.run_id=r.id and o.identity=s.value->>'identity');
  if exists(select 1 from source_observations o where o.run_id=r.id and (o.value->>'recordCount')::integer<>(select count(*) from source_observation_records x where x.run_id=o.run_id and x.identity=o.identity)) then raise exception 'Incomplete observation lineage'; end if;
 end if;
 if enabled then
  perform set_config('turnright.source_finalization',r.id::text,true);
  -- A failed collection cannot retire another collection's proposals.
  update map_changes m set status='superseded' from source_proposal_groups g where m.campus_id=r.campus_id and g.campus_id=m.campus_id and m.id=g.id and m.status='pending' and g.source_key=r.source_key
   and (select receipt->>'configurationHash' from source_check_runs where id=g.run_id)=r.receipt->>'configurationHash'
   and not exists(select 1 from jsonb_array_elements(g.features) f where not exists(select 1 from jsonb_array_elements(r.receipt->'collections') c where (c->>'complete')::boolean and c->>'identity'=coalesce(f#>>'{observation,collection}',f#>>'{accepted,collection}')))
   and not exists(select 1 from _source_check_rows(r.id,'group') s where s.value->>'id'=m.id);
  -- Retain rejected/accepted receipts and only reopen a recurring superseded revision.
  insert into source_proposal_groups(campus_id,id,run_id,source_key,classification,verification,blocking_reasons,eligible,features,member_count)
  select r.campus_id,value->>'id',r.id,r.source_key,value->>'classification',value->>'verification',value->'blockingReasons',(value->>'eligible')::boolean,value->'features',(value->>'memberCount')::integer
  from _source_check_rows(r.id,'group') s
  on conflict(campus_id,id) do update set run_id=excluded.run_id,verification=excluded.verification,blocking_reasons=excluded.blocking_reasons,eligible=excluded.eligible,features=excluded.features,classification=excluded.classification,member_count=excluded.member_count;
  insert into source_group_members select r.campus_id,value->>'groupId',value->>'id',nullif(value->'before','null'),nullif(value->'after','null') from _source_check_rows(r.id,'member') s
  on conflict(campus_id,group_id,record_id) do update set before_record=excluded.before_record,after_record=excluded.after_record
  where not exists(select 1 from map_changes m where m.campus_id=excluded.campus_id and m.id=excluded.group_id and m.status in ('accepted','rejected'));
  if exists(select 1 from source_proposal_groups g where g.run_id=r.id and g.member_count<>(select count(*) from source_group_members m where m.campus_id=g.campus_id and m.group_id=g.id)) then raise exception 'Incomplete dependency group'; end if;
  insert into map_changes(campus_id,id,source_id,kind,before,after,base_hash,summary)
  select r.campus_id,value->>'id',value->>'source_id',value->>'kind',nullif(value->'before','null'),nullif(value->'after','null'),value->>'base_hash',value->>'summary' from _source_check_rows(r.id,'group') s
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

create or replace function source_provenance_backfill(actor uuid,check_id uuid,apply_matches boolean default false,page_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=public set statement_timeout='10s' as $$
declare run source_check_runs; observation record; exact boolean; findings jsonb:='[]'; recovered integer:=0;
begin
 if not workspace_can(actor,case when apply_matches then 'manage' else 'read' end) then raise sqlstate 'PT403' using message='Campus permission required'; end if;
 if page_offset<0 or page_offset>100000 then raise exception 'Invalid provenance page'; end if;
 perform pg_advisory_xact_lock(hashtext('turnright-source-review:'||current_campus_id()));
 select * into run from source_check_runs where id=check_id and campus_id=current_campus_id() and status in ('shadow','complete');
 if not found then raise exception 'Completed evidence check required'; end if;
 if run.evidence_retention->>'rawSnapshot'='expired' then raise exception 'Temporary raw snapshot expired; check again. Accepted and decision evidence is retained.'; end if;
 for observation in with headers as materialized (select * from _source_check_rows(run.id,'observation',page_offset,page_offset+100)),
 derived as materialized (select value->>'identity' identity,value->'record' record from _source_check_rows(run.id,'record') where value->>'identity' in (select value->>'identity' from headers))
 select run.id run_id,run.campus_id campus_id,o.value->>'identity' identity,o.value,
 coalesce((select jsonb_agg(d.record) from derived d where d.identity=o.value->>'identity'),'[]') records
 from headers o order by o.ordinal loop
  exact:=coalesce((observation.value->>'stable')::boolean,false) and coalesce(observation.value->>'evidenceUnavailable','false')<>'true' and (observation.value->>'recordCount')::integer>0 and (observation.value->>'recordCount')::integer=jsonb_array_length(observation.records)
   and not exists(select 1 from (select value r from jsonb_array_elements(observation.records)) q where
    not exists(select 1 from source_features s where s.campus_id=run.campus_id and s.id=r->>'id' and s.hash=r->>'hash' and s.payload=r->'payload')
    or not exists(select 1 from map_changes m where m.campus_id=run.campus_id and m.status='accepted' and m.source_id=r->>'id'
       and m.after->>'hash'=r->>'hash' and m.after->'payload'=r->'payload' and m.reviewed_at>=(run.receipt->>'retrievedAt')::timestamptz));
  findings:=findings||jsonb_build_array(jsonb_build_object('identity',observation.identity,'recoverable',exact,'reason',case when exact then 'Exact accepted identities, content and retained receipt match' else 'Historical upstream evidence is insufficient; accepted data retained' end));
  if apply_matches and exact and not exists(select 1 from source_accepted_observations where campus_id=run.campus_id and source_key=run.source_key and identity=observation.identity) then
   insert into source_observations values(run.id,run.campus_id,observation.identity,observation.value) on conflict do nothing;
   insert into source_observation_records select run.id,observation.identity,value->>'id',value from jsonb_array_elements(observation.records) on conflict do nothing;
   insert into source_accepted_observations(campus_id,source_key,identity,run_id) values(run.campus_id,run.source_key,observation.identity,run.id);
   insert into source_feature_lineage select run.campus_id,run.source_key,observation.identity,record_id from source_observation_records where run_id=run.id and identity=observation.identity;
   insert into workspace_audit(campus_id,actor,action,subject,details) values(run.campus_id,actor,'source-provenance-recovered',observation.identity,jsonb_build_object('checkId',run.id,'mapContentChanged',false));
   recovered:=recovered+1;
  end if;
 end loop;
 return jsonb_build_object('findings',findings,'recovered',recovered,'nextOffset',case when jsonb_array_length(findings)=100 then page_offset+100 else null end);
end $$;

-- Each maintenance call bounds its work and shares the decision lock.
-- Active/failed resumable runs are untouched. Raw snapshots retain the latest
-- two successful runs per source; accepted/proposal/undo rows never expire.
create function source_check_maintain() returns jsonb language plpgsql security definer
set search_path=public set statement_timeout='30s' set lock_timeout='2s' as $$
declare page record; target record; compact_run uuid; touched integer:=0; n integer; archived integer:=0; compacted integer:=0; expired integer:=0;
begin
 perform pg_advisory_xact_lock(hashtext('turnright-source-review:'||current_campus_id()));
 perform pg_advisory_xact_lock(hashtext('turnright-source-storage:'||current_campus_id()));
 -- Convert old temporary rows before removing any duplicate. Bound both rows
 -- and bytes; variable-sized batches retain their original ordinal sequence.
 for target in select s.run_id,s.kind from source_check_staging s join source_check_runs r on r.id=s.run_id
  where r.campus_id=current_campus_id() and r.status in ('complete','shadow')
  group by s.run_id,s.kind order by s.run_id,s.kind limit 4 loop
  for n in 1..25 loop
   select min(ordinal) start_offset,jsonb_agg(value order by ordinal) items,count(*) count into page
   from (select * from (select ordinal,value,sum(octet_length(value::text)+2) over(order by ordinal) bytes
     from (select ordinal,value from source_check_staging where run_id=target.run_id and kind=target.kind order by ordinal limit 100) first_rows) sized
     where bytes<=524286) bounded;
   exit when page.count=0;
   perform _source_check_store(target.run_id,target.kind,page.start_offset,page.items);
   delete from source_check_staging where run_id=target.run_id and kind=target.kind and ordinal>=page.start_offset and ordinal<page.start_offset+page.count;
   archived:=archived+page.count;
  end loop;
 end loop;
 -- Only remove hot duplicates after their exact observation and every derived
 -- record are proven present in the retained packed evidence. Decisions pin
 -- both before and after observations, even after later edits or reversals.
 select o.run_id into compact_run from source_observations o join source_check_runs r on r.id=o.run_id
  where r.campus_id=current_campus_id() and r.status in ('complete','shadow')
  and not exists(select 1 from source_check_staging s where s.run_id=r.id)
  and not _source_observation_pinned(o.run_id,o.identity)
  and (exists(select 1 from source_check_pages p where p.run_id=o.run_id)
   or exists(select 1 from source_observations copy where copy.campus_id=o.campus_id and copy.run_id<>o.run_id and copy.identity=o.identity and copy.value=o.value))
  order by o.run_id,o.identity limit 1;
 for target in
  with candidates as materialized (
   select o.* from source_observations o where o.run_id=compact_run and not _source_observation_pinned(o.run_id,o.identity)
   order by o.identity limit 1000
  ), archived_observations as materialized (
   select value from _source_check_rows(compact_run,'observation')
   union all select o.value from source_observations o where o.campus_id=current_campus_id() and o.run_id<>compact_run and o.identity in (select identity from candidates)
  ), archived_records as materialized (
   select value->>'identity' identity,value->'record' record from _source_check_rows(compact_run,'record')
   union all select x.identity,x.value from source_observation_records x join source_observations o using(run_id,identity)
    where o.campus_id=current_campus_id() and o.run_id<>compact_run and o.identity in (select identity from candidates)
  )
  select distinct o.run_id,o.identity from candidates o join archived_observations p on p.value->>'identity'=o.identity and p.value=o.value
  where not exists(select 1 from source_observation_records x where x.run_id=o.run_id and x.identity=o.identity
   and not exists(select 1 from archived_records a where a.identity=x.identity and a.record=x.value)) loop
   delete from source_observation_records where run_id=target.run_id and identity=target.identity;
   delete from source_observations where run_id=target.run_id and identity=target.identity;
   compacted:=compacted+1;
 end loop;
 -- Expire only unneeded raw snapshot pages; immutable receipts and all materialized
 -- decision/proposal/accepted dependencies survive independently of these pages.
 for target in select id,created_at from (select r.*,row_number() over(partition by source_key order by created_at desc,id desc) recency
  from source_check_runs r where r.campus_id=current_campus_id() and r.status in ('complete','shadow')) q
  where recency>2 and evidence_retention->>'rawSnapshot' is distinct from 'expired'
  and not exists(select 1 from source_check_staging s where s.run_id=q.id)
  and not exists(select 1 from source_observations o where o.run_id=q.id and not _source_observation_pinned(o.run_id,o.identity))
  union all
  select r.id,r.created_at from source_check_runs r where r.campus_id=current_campus_id() and r.status in ('failed','replaced')
   and r.evidence_retention->>'rawSnapshot' is distinct from 'expired'
   and exists(select 1 from source_check_runs newer where newer.campus_id=r.campus_id and newer.source_key=r.source_key and newer.created_at>r.created_at)
   and not exists(select 1 from source_check_staging s where s.run_id=r.id)
  order by created_at limit 1 loop
  delete from source_check_pages where (run_id,kind,ordinal) in
   (select run_id,kind,ordinal from source_check_pages where run_id=target.id order by kind,ordinal limit 1000);
  get diagnostics expired=row_count;
  if not exists(select 1 from source_check_pages where run_id=target.id) then
   update source_check_runs set evidence_retention=jsonb_build_object('rawSnapshot','expired','expiredAt',now(),'decisionEvidence','retained') where id=target.id;
  end if;
 end loop;
 delete from source_check_payloads where (campus_id,digest) in
  (select p.campus_id,p.digest from source_check_payloads p where p.campus_id=current_campus_id()
   and not exists(select 1 from source_check_pages l where l.campus_id=p.campus_id and l.digest=p.digest)
   order by digest limit 1000);
 get diagnostics touched=row_count;
 return jsonb_build_object('archived',archived,'compacted',compacted,'expiredPages',expired,'unusedPayloads',touched,
  'work',archived+compacted+expired+touched);
end $$;
do $$ declare f record; begin
 for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname in ('_source_check_rows','_source_check_store','_source_observation_pinned','source_check_maintain') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);
 end loop;
end $$;
grant execute on function source_check_maintain() to service_role;
notify pgrst,'reload schema';
