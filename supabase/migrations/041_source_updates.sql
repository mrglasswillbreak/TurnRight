-- Source review lists never transfer proposal geometry. Decisions use frozen
-- revisions and short transactions, independently of import artifact retention.
alter table map_changes add column review_revision bigint not null default 1;
alter table map_changes add column review_meta jsonb;

create function source_review_metadata(b jsonb,a jsonb,identity text) returns jsonb
language plpgsql immutable set search_path=public as $$
declare p jsonb:=coalesce(nullif(a,'null'),b,'{}'); bp jsonb; ap jsonb; attrs jsonb; fields jsonb; shape boolean; category text;
begin
 bp:=coalesce(b->'payload','{}'); ap:=coalesce(a->'payload','{}');
 attrs:=coalesce(p#>'{payload,properties}',p->'payload','{}');
 shape:=coalesce(bp->'geometry',bp->'coordinates') is distinct from coalesce(ap->'geometry',ap->'coordinates');
 select coalesce(jsonb_agg(k order by k),'[]') into fields from (
  select key k from jsonb_object_keys(coalesce(bp->'properties',bp)||coalesce(ap->'properties',ap)) key
  where key not in ('geometry','coordinates','type','retrievedAt','checkedAt','createdAt')
   and coalesce(bp->'properties',bp)->key is distinct from coalesce(ap->'properties',ap)->key
 ) q;
 category:=coalesce(nullif(attrs->>'kind',''),nullif(attrs->>'category',''),p->>'entity','feature');
 return jsonb_build_object('source',coalesce(p->>'source','unknown'),'layer',coalesce(attrs->>'importLayer',''),
  'featureType',category,'name',coalesce(nullif(attrs->>'name',''),initcap(category)||' · '||coalesce(nullif(attrs->>'importLayer','')||' · ','')||right(identity,12)),
  'fields',fields,'geometryChanged',shape);
end $$;
create function maintain_source_review_metadata() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' or new.before is distinct from old.before or new.after is distinct from old.after or new.kind is distinct from old.kind or new.base_hash is distinct from old.base_hash then
  new.review_meta:=source_review_metadata(new.before,new.after,new.source_id);
 end if;
 if tg_op='UPDATE' and (new.before is distinct from old.before or new.after is distinct from old.after or new.kind is distinct from old.kind or new.base_hash is distinct from old.base_hash or new.status is distinct from old.status) then
  new.review_revision:=old.review_revision+1;
 end if;
 return new;
end $$;
create trigger source_review_metadata_change before insert or update on map_changes for each row execute function maintain_source_review_metadata();
create index source_review_pending_order on map_changes(campus_id,created_at desc,id) where status='pending';
create index source_review_pending_source on map_changes(campus_id,(review_meta->>'source')) where status='pending';
create function backfill_source_reviews() returns integer language plpgsql security definer set search_path=public set statement_timeout='10s' as $$
declare n integer;
begin
 with page as (select campus_id,id from map_changes where review_meta is null order by campus_id,id limit 100 for update skip locked)
 update map_changes m set review_meta=source_review_metadata(m.before,m.after,m.source_id) from page p where m.campus_id=p.campus_id and m.id=p.id;
 get diagnostics n=row_count; return n;
end $$;

create function source_review_matches(meta jsonb,kind text,identity text,filters jsonb) returns boolean language sql immutable as $$
 select (coalesce(filters->>'source','')='' or meta->>'source'=filters->>'source')
 and (coalesce(filters->>'layer','')='' or meta->>'layer'=filters->>'layer')
 and (coalesce(filters->>'featureType','')='' or meta->>'featureType'=filters->>'featureType')
 and (coalesce(filters->>'kind','')='' or kind=filters->>'kind')
 and (coalesce(filters->>'geometry','')='' or (meta->>'geometryChanged')::boolean=(filters->>'geometry')::boolean)
 and (coalesce(filters->>'query','')='' or strpos(lower(concat_ws(' ',meta->>'name',meta->>'layer',identity)),lower(filters->>'query'))>0)
$$;
create function source_review_list(actor uuid,filters jsonb default '{}',page_cursor jsonb default null) returns jsonb
language plpgsql security definer set search_path=public set statement_timeout='10s' as $$
declare result jsonb; total bigint;
begin
 if not workspace_can(actor,'read') then raise sqlstate 'PT403' using message='Campus access required'; end if;
 select count(*) into total from map_changes m where campus_id=current_campus_id() and status='pending' and source_review_matches(review_meta,kind,source_id,filters);
 select coalesce(jsonb_agg(item order by created_at desc,id),'[]') into result from (
  select m.id,m.created_at,jsonb_build_object('id',m.id,'revision',m.review_revision,'sourceId',m.source_id,'kind',m.kind,'createdAt',m.created_at,
   'meta',m.review_meta,'sourceName',coalesce(s.name,m.review_meta->>'source')) item
  from map_changes m left join campus_sources s on s.campus_id=m.campus_id and 'import:'||s.id::text=m.review_meta->>'source'
  where m.campus_id=current_campus_id() and m.status='pending' and m.review_meta is not null and source_review_matches(m.review_meta,m.kind,m.source_id,filters)
   and (page_cursor is null or m.created_at<(page_cursor->>'createdAt')::timestamptz or (m.created_at=(page_cursor->>'createdAt')::timestamptz and m.id>page_cursor->>'id'))
  order by m.created_at desc,m.id limit 51
 ) q;
 return jsonb_build_object('rows',case when jsonb_array_length(result)>50 then result-50 else result end,'total',total,
  'nextCursor',case when jsonb_array_length(result)>50 then jsonb_build_object('createdAt',result#>>'{49,createdAt}','id',result#>>'{49,id}') else null end);
end $$;
create function source_review_overview(actor uuid) returns jsonb language plpgsql security definer set search_path=public set statement_timeout='10s' as $$
declare counts jsonb; layers jsonb; types jsonb;
begin
 if not workspace_can(actor,'read') then raise sqlstate 'PT403' using message='Campus access required'; end if;
 select coalesce(jsonb_object_agg(source,n),'{}') into counts from (select coalesce(review_meta->>'source','unknown') source,count(*) n from map_changes where campus_id=current_campus_id() and status='pending' group by 1) q;
 select coalesce(jsonb_agg(layer order by layer),'[]') into layers from (select distinct review_meta->>'layer' layer from map_changes where campus_id=current_campus_id() and status='pending' and review_meta->>'layer'<>'') q;
 select coalesce(jsonb_agg(kind order by kind),'[]') into types from (select distinct review_meta->>'featureType' kind from map_changes where campus_id=current_campus_id() and status='pending' and review_meta->>'featureType' is not null) q;
 return jsonb_build_object('counts',counts,'layers',layers,'featureTypes',types,'ready',not exists(select 1 from map_changes where campus_id=current_campus_id() and status='pending' and review_meta is null),
  'sources',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'kind',s.kind,'schedule',s.schedule,'configured',jsonb_array_length(coalesce(s.configuration->'layers','[]'))>0,
   'latest',(select jsonb_build_object('id',i.id,'status',i.status,'message',i.message,'updatedAt',i.updated_at) from campus_imports i where i.campus_id=s.campus_id and i.source_id=s.id order by i.created_at desc limit 1),
   'lastSuccess',(select max(i.updated_at) from campus_imports i where i.campus_id=s.campus_id and i.source_id=s.id and i.status in ('reviewed','preview')),
   'active',(select jsonb_build_object('id',i.id,'status',i.status,'message',i.message) from campus_imports i where i.campus_id=s.campus_id and i.source_id=s.id and i.status in ('queued','running') order by i.created_at desc limit 1)
  ) order by s.name) from campus_sources s where s.campus_id=current_campus_id()),'[]'));
end $$;

create table source_review_operations (
 id uuid primary key, campus_id text not null references campuses(id), actor uuid not null,
 accept boolean, status text not null default 'prepared' check(status in ('prepared','queued','running','completed','failed','cancelled')),
 request jsonb not null, total integer not null default 0, applied integer not null default 0, skipped integer not null default 0, failed integer not null default 0,
 breakdown jsonb not null default '{}', message text, run_token uuid not null default gen_random_uuid(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz
);
create unique index source_review_one_active on source_review_operations(campus_id) where status in ('queued','running');
create index source_review_recent on source_review_operations(campus_id,created_at desc);
create table source_review_items (
 operation_id uuid not null references source_review_operations(id) on delete cascade, change_id text not null, revision bigint not null,
 name text not null, kind text not null, geometry_changed boolean not null, status text not null default 'pending' check(status in ('pending','applied','skipped','failed')), message text,
 primary key(operation_id,change_id)
);
create index source_review_work on source_review_items(operation_id,status,change_id);
alter table source_review_operations enable row level security;
alter table source_review_items enable row level security;
revoke all on source_review_operations,source_review_items from public,anon,authenticated,service_role;

create function source_review_prepare(actor_id uuid,operation_id uuid,selection jsonb) returns jsonb language plpgsql security definer set search_path=public set statement_timeout='10s' as $$
declare op source_review_operations;
begin
 if not workspace_can(actor_id,'edit') then raise sqlstate 'PT403' using message='Editing permission required'; end if;
 perform pg_advisory_xact_lock(hashtext('source-selection:'||operation_id::text));
 select * into op from source_review_operations where id=operation_id;
 if found then
  if op.campus_id<>current_campus_id() or op.actor<>actor_id or op.request<>selection then raise sqlstate 'PT409' using message='Selection identity was already used'; end if;
  return to_jsonb(op)-'run_token'-'request';
 end if;
 if exists(select 1 from map_changes where campus_id=current_campus_id() and status='pending' and review_meta is null) then raise sqlstate 'PT409' using message='Source update index is being prepared. Try again shortly.'; end if;
 if selection->>'mode' not in ('ids','filter') or selection->>'mode' is null then raise exception 'Choose a selection'; end if;
 if selection->>'mode'='ids' and (jsonb_typeof(selection->'items') is distinct from 'array' or jsonb_array_length(selection->'items') not between 1 and 10000) then raise exception 'Choose up to 10,000 rows or all matching results'; end if;
 insert into source_review_operations(id,campus_id,actor,request) values(operation_id,current_campus_id(),actor_id,selection);
 insert into source_review_items(operation_id,change_id,revision,name,kind,geometry_changed)
 select operation_id,m.id,m.review_revision,m.review_meta->>'name',m.kind,(m.review_meta->>'geometryChanged')::boolean from map_changes m
 where m.campus_id=current_campus_id() and m.status='pending' and (
  (selection->>'mode'='filter' and source_review_matches(m.review_meta,m.kind,m.source_id,coalesce(selection->'filters','{}')))
  or (selection->>'mode'='ids' and exists(select 1 from jsonb_array_elements(selection->'items') x where x->>'id'=m.id and (x->>'revision')::bigint=m.review_revision))
 );
 update source_review_operations set total=(select count(*) from source_review_items where source_review_items.operation_id=source_review_prepare.operation_id),
 breakdown=(select jsonb_build_object('add',count(*) filter(where kind='add'),'modify',count(*) filter(where kind='modify'),'remove',count(*) filter(where kind='remove'),'geometry',count(*) filter(where geometry_changed)) from source_review_items where source_review_items.operation_id=source_review_prepare.operation_id)
 where id=operation_id returning * into op;
 if op.total=0 then raise sqlstate 'PT409' using message='No matching pending changes remain. Refresh the inbox.'; end if;
 return to_jsonb(op)-'run_token'-'request';
end $$;

create function source_review_control(actor_id uuid,operation_id uuid,command text,decision boolean default null,acknowledge_removals boolean default false) returns jsonb
language plpgsql security definer set search_path=public set lock_timeout='2s' set statement_timeout='10s' as $$
declare op source_review_operations;
begin
 if not workspace_can(actor_id,'edit') then raise sqlstate 'PT403' using message='Editing permission required'; end if;
 select * into op from source_review_operations where id=operation_id and campus_id=current_campus_id() and actor=actor_id for update;
 if not found then raise sqlstate 'PT404' using message='Selection not found'; end if;
 if command='start' then
  if decision is null then raise exception 'Choose accept or reject'; end if;
  if op.status<>'prepared' then
   if op.accept is distinct from decision then raise sqlstate 'PT409' using message='This selection already has a decision'; end if;
   return to_jsonb(op)-'request';
  end if;
  if op.created_at<now()-interval '24 hours' then raise sqlstate 'PT409' using message='Selection expired. Select the changes again.'; end if;
  if decision and (op.breakdown->>'remove')::integer>0 and not acknowledge_removals then raise exception 'Acknowledge the selected removals'; end if;
  update source_review_operations set accept=decision,status='queued',message='Waiting for review worker',updated_at=now() where id=op.id;
 elsif command='cancel' and op.status in ('queued','running') then
  update source_review_operations set status='cancelled',message='Stopped; completed decisions remain applied',completed_at=now(),updated_at=now(),run_token=gen_random_uuid() where id=op.id;
 elsif command='retry' and op.status in ('failed','cancelled') then
  if not exists(select 1 from source_review_items where source_review_items.operation_id=op.id and status='pending') then raise sqlstate 'PT409' using message='No unfinished items remain; stale or failed proposals need a fresh review'; end if;
  update source_review_operations set status='queued',message='Waiting to resume unfinished decisions',completed_at=null,updated_at=now(),run_token=gen_random_uuid() where id=op.id;
 elsif command not in ('start','cancel','retry') then raise exception 'Invalid review command';
 end if;
 select * into op from source_review_operations where id=operation_id;
 return to_jsonb(op)-'request';
exception when unique_violation then raise sqlstate 'PT409' using message='A bulk review is already running for this campus. Open its progress before starting another.';
end $$;

create function source_review_step(operation_id uuid,token uuid) returns jsonb
language plpgsql security definer set search_path=public set lock_timeout='2s' set statement_timeout='10s' as $$
declare op source_review_operations; item source_review_items; proposal map_changes; applied_n integer:=0; skipped_n integer:=0; failed_n integer:=0;
begin
 if not pg_try_advisory_xact_lock(hashtext('turnright-source-review:'||current_campus_id())) then raise sqlstate '55P03' using message='Another source operation is running'; end if;
 select * into op from source_review_operations where id=operation_id and campus_id=current_campus_id() for update;
 if not found or op.run_token<>token then raise sqlstate 'PT409' using message='Worker cancelled or replaced'; end if;
 if op.status not in ('queued','running') then return to_jsonb(op)-'run_token'-'request'; end if;
 if not workspace_can(op.actor,'edit') then
  update source_review_operations set status='failed',message='The author no longer has editing permission',completed_at=now(),updated_at=now() where id=op.id;
 else
  for item in select * from source_review_items where source_review_items.operation_id=op.id and status='pending' order by change_id limit 25 for update loop
   begin
    select * into proposal from map_changes where campus_id=op.campus_id and id=item.change_id for update;
    if not found or proposal.status<>'pending' or proposal.review_revision<>item.revision or proposal.base_hash is distinct from (select hash from source_features where campus_id=op.campus_id and id=proposal.source_id) then
     update source_review_items set status='skipped',message='Proposal or baseline changed; review the latest version' where source_review_items.operation_id=op.id and change_id=item.change_id;
     skipped_n:=skipped_n+1;
    else
     perform team_review_source(op.actor,item.change_id,op.accept);
     update source_review_items set status='applied',message=case when op.accept then 'Accepted into the source baseline' else 'Rejected; baseline retained' end where source_review_items.operation_id=op.id and change_id=item.change_id;
     applied_n:=applied_n+1;
    end if;
   exception when serialization_failure or deadlock_detected or lock_not_available then raise;
    when others then
     update source_review_items set status='failed',message=left(sqlerrm,500) where source_review_items.operation_id=op.id and change_id=item.change_id;
     failed_n:=failed_n+1;
   end;
  end loop;
  update source_review_operations set applied=applied+applied_n,skipped=skipped+skipped_n,failed=failed+failed_n,status='running',updated_at=now(),message='Applying reviewed changes' where id=op.id;
  if not exists(select 1 from source_review_items where source_review_items.operation_id=op.id and status='pending') then
   update source_review_operations set status='completed',completed_at=now(),message='Review finished. Publication is a separate step.' where id=op.id;
  end if;
 end if;
 select * into op from source_review_operations where id=operation_id;
 return to_jsonb(op)-'run_token'-'request';
end $$;
create function source_review_fail(operation_id uuid,token uuid,reason text) returns void language sql security definer set search_path=public as $$
 update source_review_operations set status='failed',message=left(reason,500),updated_at=now(),completed_at=now()
 where campus_id=current_campus_id() and id=operation_id and run_token=token and status in ('queued','running')
$$;
create function source_review_history(actor uuid,operation_id uuid default null,item_cursor text default '') returns jsonb language plpgsql security definer set search_path=public set statement_timeout='10s' as $$
begin
 if not workspace_can(actor,'read') then raise sqlstate 'PT403' using message='Campus access required'; end if;
 return jsonb_build_object('operations',coalesce((select jsonb_agg(to_jsonb(q)-'run_token'-'request' order by created_at desc) from
  (select * from source_review_operations where campus_id=current_campus_id() and status<>'prepared' and (operation_id is null or id=operation_id) order by created_at desc limit 30) q),'[]'),
  'items',coalesce((select jsonb_agg(to_jsonb(q) order by change_id) from (select i.change_id,i.name,i.kind,i.status,i.message from source_review_items i join source_review_operations o on o.id=i.operation_id where o.campus_id=current_campus_id() and o.id=source_review_history.operation_id and i.change_id>item_cursor order by i.change_id limit 51) q),'[]'));
end $$;
create function cleanup_source_reviews() returns integer language plpgsql security definer set search_path=public set statement_timeout='10s' as $$
declare n integer;
begin
 with expired as (select i.operation_id,i.change_id from source_review_items i join source_review_operations o on o.id=i.operation_id where
  (o.status='prepared' and o.created_at<now()-interval '24 hours') or (o.status in ('completed','cancelled','failed') and o.updated_at<now()-interval '30 days') limit 1000)
 delete from source_review_items i using expired e where i.operation_id=e.operation_id and i.change_id=e.change_id;
 get diagnostics n=row_count;
 -- Explicit selections also carry ID/revision pairs in the idempotency request.
 -- Expire that copy along with item bookkeeping, retaining summary and audit.
 with expired_receipts as (select id from source_review_operations where status in ('completed','cancelled','failed') and updated_at<now()-interval '30 days' and request<>'{}'::jsonb limit 100)
 update source_review_operations o set request='{}'::jsonb from expired_receipts e where o.id=e.id;
 delete from source_review_operations o where status='prepared' and created_at<now()-interval '24 hours' and not exists(select 1 from source_review_items where operation_id=o.id);
 return n;
end $$;

-- Manual checks and daily checks share an atomic per-source claim.
create function queue_source_check(actor uuid,source_identity uuid) returns jsonb language plpgsql security definer set search_path=public set statement_timeout='10s' as $$
declare source campus_sources; job campus_imports;
begin
 -- A null actor is reserved for the service-role scheduler; API calls always
 -- pass the authenticated editor. This RPC is not granted to browser roles.
 if actor is not null and not workspace_can(actor,'edit') then raise sqlstate 'PT403' using message='Editing permission required'; end if;
 select * into source from campus_sources where campus_id=current_campus_id() and id=source_identity for update;
 if not found or source.kind='file' then raise exception 'Upload a replacement file for this source'; end if;
 select * into job from campus_imports where campus_id=current_campus_id() and source_id=source.id and status in ('queued','running') order by created_at desc limit 1;
 if found then return jsonb_build_object('job',to_jsonb(job)-'summary','created',false); end if;
 insert into campus_imports(id,campus_id,source_id,configuration,phase,status,run_token,auto_queue,message)
 values(gen_random_uuid(),source.campus_id,source.id,source.configuration,case when jsonb_array_length(coalesce(source.configuration->'layers','[]'))>0 then 'preview' else 'inspect' end,'queued',gen_random_uuid(),true,'Waiting for source check') returning * into job;
 return jsonb_build_object('job',to_jsonb(job)-'summary','created',true);
end $$;

revoke all on function source_review_metadata(jsonb,jsonb,text),maintain_source_review_metadata(),source_review_matches(jsonb,text,text,jsonb),backfill_source_reviews(),source_review_list(uuid,jsonb,jsonb),source_review_overview(uuid),source_review_prepare(uuid,uuid,jsonb),source_review_control(uuid,uuid,text,boolean,boolean),source_review_step(uuid,uuid),source_review_fail(uuid,uuid,text),source_review_history(uuid,uuid,text),cleanup_source_reviews(),queue_source_check(uuid,uuid) from public,anon,authenticated;
grant execute on function backfill_source_reviews(),source_review_list(uuid,jsonb,jsonb),source_review_overview(uuid),source_review_prepare(uuid,uuid,jsonb),source_review_control(uuid,uuid,text,boolean,boolean),source_review_step(uuid,uuid),source_review_fail(uuid,uuid,text),source_review_history(uuid,uuid,text),cleanup_source_reviews(),queue_source_check(uuid,uuid) to service_role;
notify pgrst,'reload schema';
