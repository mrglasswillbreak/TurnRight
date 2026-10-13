-- Recovery is an audited private-workspace reversal, never a release operation.
create function source_undo_preview(actor uuid,decision_id uuid) returns jsonb language plpgsql security definer set search_path=public set statement_timeout='10s' as $$
declare d source_decision_receipts; reasons jsonb:='[]'; m jsonb; affected jsonb;
begin
 if not workspace_can(actor,'edit') then raise sqlstate 'PT403' using message='Editing permission required'; end if;
 select * into d from source_decision_receipts where campus_id=current_campus_id() and id=decision_id;
 if not found then raise sqlstate 'PT404' using message='No recoverable decision receipt; legacy decisions cannot be automatically reversed'; end if;
 if d.outcome<>'accepted' then reasons:=reasons||'"Only accepted source decisions can be reversed."'::jsonb; end if;
 if exists(select 1 from source_decision_receipts where campus_id=d.campus_id and reversal_of=d.id) then reasons:=reasons||'"This decision already has an audited reversal."'::jsonb; end if;
 if jsonb_array_length(d.members)>1000 then reasons:=reasons||'"This group exceeds the atomic recovery limit."'::jsonb; end if;
 for m in select * from jsonb_array_elements(d.members) loop
  if not source_record_current(m->'after',m->>'id') then reasons:=reasons||jsonb_build_array('Later accepted changes affect '||(m->>'id')); end if;
  if nullif(m->'before','null') is null and exists(select 1 from map_edits e where e.campus_id=d.campus_id and (e.id=m->>'id' or e.id=regexp_replace(m->>'id','^[^:]+:','') or strpos(e.properties::text,to_jsonb(regexp_replace(m->>'id','^[^:]+:',''))::text)>0)) then reasons:=reasons||jsonb_build_array('Later editor corrections depend on '||(m->>'id')); end if;
  if nullif(m->'before','null') is null and exists(select 1 from source_features s where s.campus_id=d.campus_id and s.entity in ('meta','place') and s.id<>m->>'id' and strpos(s.payload::text,to_jsonb(regexp_replace(m->>'id','^[^:]+:',''))::text)>0 and not exists(select 1 from jsonb_array_elements(d.members) x where x->>'id'=s.id and nullif(x->'before','null') is null)) then reasons:=reasons||jsonb_build_array('A closure or entrance depends on '||(m->>'id')); end if;
  if nullif(m->'before','null') is null and m#>>'{after,entity}'='node' and exists(select 1 from source_features e where e.campus_id=d.campus_id and e.entity='edge' and (e.payload->>'from'=m#>>'{after,payload,id}' or e.payload->>'to'=m#>>'{after,payload,id}') and not exists(select 1 from jsonb_array_elements(d.members) x where x->>'id'=e.id and nullif(x->'before','null') is null)) then reasons:=reasons||jsonb_build_array('Later routes share '||(m->>'id')); end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(d.observations_after) a where not exists(select 1 from source_accepted_observations s where s.campus_id=d.campus_id and to_jsonb(s)=a)) then reasons:=reasons||'"Accepted source observations changed after this decision."'::jsonb; end if;
 -- Deletion decisions have no after-observation; prevent overwriting a revival.
 if exists(select 1 from jsonb_array_elements(d.observations_before) b join source_accepted_observations a on a.campus_id=d.campus_id and a.source_key=b->>'source_key' and a.identity=b->>'identity' where not exists(select 1 from jsonb_array_elements(d.observations_after) x where x->>'identity'=a.identity)) then reasons:=reasons||'"A removed source identity has been accepted again."'::jsonb; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',q.item->>'id','kind',case when nullif(q.item->'before','null') is null then 'remove' when nullif(q.item->'after','null') is null then 'restore' else 'restore previous source values' end)),'[]') into affected from (select value item from jsonb_array_elements(d.members) limit 50) q;
 return jsonb_build_object('decisionId',d.id,'groupId',d.group_id,'eligible',jsonb_array_length(reasons)=0,'blockingReasons',reasons,'affected',affected,'dependencyCount',jsonb_array_length(d.members),'createdAt',d.created_at,'actor',d.actor,'publicationRequired',true);
end $$;
create function source_undo_confirm(actor uuid,decision_id uuid,reversal_id uuid) returns jsonb language plpgsql security definer set search_path=public set statement_timeout='10s' as $$
declare d source_decision_receipts; m jsonb; preview jsonb; existing source_decision_receipts;
begin
 if not workspace_can(actor,'edit') then raise sqlstate 'PT403' using message='Editing permission required'; end if;
 perform pg_advisory_xact_lock(hashtext('turnright-source-review:'||current_campus_id()));
 select * into existing from source_decision_receipts where id=reversal_id;
 if found then
  if existing.campus_id is distinct from current_campus_id() or existing.actor is distinct from actor or existing.reversal_of is distinct from decision_id then raise exception 'Reversal identity already used'; end if;
  return jsonb_build_object('id',existing.id,'status','reversed');
 end if;
 preview:=source_undo_preview(actor,decision_id);
 if not (preview->>'eligible')::boolean then raise sqlstate 'PT409' using message='Reversal blocked: '||(preview->'blockingReasons')::text; end if;
 select * into d from source_decision_receipts where campus_id=current_campus_id() and id=decision_id for update;
 for m in select * from jsonb_array_elements(d.members) loop
  if nullif(m->'before','null') is null then delete from source_features where campus_id=d.campus_id and id=m->>'id';
  else insert into source_features(campus_id,id,entity,source,payload,hash,private_attributes,gis_metadata)
   values(d.campus_id,m->>'id',m#>>'{before,entity}',m#>>'{before,source}',m#>'{before,payload}',m#>>'{before,hash}',coalesce(m#>'{before,private_attributes}','{}'),coalesce(m#>'{before,gis_metadata}','{}'))
   on conflict(campus_id,id) do update set entity=excluded.entity,source=excluded.source,payload=excluded.payload,hash=excluded.hash,private_attributes=excluded.private_attributes,gis_metadata=excluded.gis_metadata,updated_at=now(); end if;
 end loop;
 if exists(select 1 from source_features e where e.campus_id=d.campus_id and e.entity='edge'
  and exists(select 1 from jsonb_array_elements(d.members) affected where affected->>'id' in (e.id,'node:'||(e.payload->>'from'),'node:'||(e.payload->>'to')))
  and (not exists(select 1 from source_features n where n.campus_id=e.campus_id and n.id='node:'||(e.payload->>'from')) or not exists(select 1 from source_features n where n.campus_id=e.campus_id and n.id='node:'||(e.payload->>'to')))) then raise exception 'Reversal would break routing references; no records were changed'; end if;
 if exists(select 1 from jsonb_array_elements(d.members) restored(value) where restored.value#>>'{before,entity}'='place' and restored.value#>>'{before,payload,graphNode}' is not null
  and not exists(select 1 from source_features n where n.campus_id=d.campus_id and n.id='node:'||(restored.value#>>'{before,payload,graphNode}'))) then raise exception 'Reversal would break an arrival connection; no records were changed'; end if;
 delete from source_accepted_observations where campus_id=d.campus_id and (source_key,identity) in (select x->>'source_key',x->>'identity' from jsonb_array_elements(d.observations_after||d.observations_before) x);
 insert into source_accepted_observations select d.campus_id,x->>'source_key',x->>'identity',(x->>'run_id')::uuid,coalesce(x->'record_overrides','{}') from jsonb_array_elements(d.observations_before) x;
 delete from source_feature_lineage where campus_id=d.campus_id and (source_key,identity) in (select x->>'source_key',x->>'identity' from jsonb_array_elements(d.observations_after||d.observations_before) x);
 insert into source_feature_lineage select d.campus_id,x->>'source_key',x->>'identity',r.record_id from jsonb_array_elements(d.observations_before) x join source_observation_records r on r.run_id=(x->>'run_id')::uuid and r.identity=x->>'identity';
 insert into source_decision_receipts(id,campus_id,group_id,actor,outcome,reversal_of,members,observations_before,observations_after,evidence)
 select reversal_id,d.campus_id,d.group_id,actor,'reversed',d.id,jsonb_agg(jsonb_build_object('id',v->>'id','before',v->'after','after',v->'before')),d.observations_after,d.observations_before,d.evidence from jsonb_array_elements(d.members) v;
 insert into workspace_audit(campus_id,actor,action,subject,details) values(d.campus_id,actor,'source-undo',d.id::text,jsonb_build_object('reversalId',reversal_id,'publicationRequired',true));
 return jsonb_build_object('id',reversal_id,'status','reversed');
end $$;

alter function source_review_list(uuid,jsonb,jsonb) rename to _source_review_list;
create function source_review_list(actor uuid,filters jsonb default '{}',page_cursor jsonb default null) returns jsonb language plpgsql security definer set search_path=public set statement_timeout='10s' as $$
declare result jsonb; rows jsonb; eligible_count integer;
begin
 result:=_source_review_list(actor,filters,page_cursor);
 select coalesce(jsonb_agg(r||jsonb_build_object('reliability',source_group_eligibility(r->>'id'))),'[]') into rows from jsonb_array_elements(result->'rows') r;
 -- Legacy rows have no dependency group. Count them in one scan instead of
 -- loading their geometry and looking up a missing group once per proposal.
 select count(*) into eligible_count from map_changes m left join source_proposal_groups g on g.campus_id=m.campus_id and g.id=m.id
 where m.campus_id=current_campus_id() and m.status='pending' and source_review_matches(m.review_meta,m.kind,m.source_id,filters)
 and case when g.id is null then m.kind<>'remove' and coalesce(coalesce(m.after,m.before)->>'entity','') not in ('node','edge')
 else (source_group_eligibility(m.id)->>'eligible')::boolean end;
 return result||jsonb_build_object('rows',rows,'eligibleTotal',eligible_count,'excludedTotal',(result->>'total')::integer-eligible_count);
end $$;
-- Freeze only eligible acceptances. Rejections may still dismiss blocked proposals.
alter function source_review_prepare(uuid,uuid,jsonb) rename to _source_review_prepare;
-- PL/pgSQL's implicit parameter label follows the function name on recompile.
do $$ begin execute replace(pg_get_functiondef('_source_review_prepare(uuid,uuid,jsonb)'::regprocedure),'source_review_prepare.operation_id','_source_review_prepare.operation_id'); end $$;
create function source_review_prepare(actor_id uuid,operation_id uuid,selection jsonb) returns jsonb language plpgsql security definer set search_path=public set statement_timeout='10s' as $$
declare result jsonb; excluded integer;
begin
 if selection->>'mode'='filter' and (select count(*) from map_changes where campus_id=current_campus_id() and status='pending' and source_review_matches(review_meta,kind,source_id,coalesce(selection->'filters','{}')))>10000 then raise exception 'Select at most 10,000 groups; narrow the source or layer filter'; end if;
 result:=_source_review_prepare(actor_id,operation_id,selection);
 if selection->>'accept'='true' and result->>'status'='prepared' then
  delete from source_review_items i where i.operation_id=source_review_prepare.operation_id and not (source_group_eligibility(i.change_id)->>'eligible')::boolean;
  get diagnostics excluded=row_count;
  update source_review_operations o set total=(select count(*) from source_review_items i where i.operation_id=o.id),
   breakdown=(select jsonb_build_object('add',count(*) filter(where kind='add'),'modify',count(*) filter(where kind='modify'),'remove',count(*) filter(where kind='remove'),'geometry',count(*) filter(where geometry_changed),'excluded',excluded) from source_review_items i where i.operation_id=o.id)
   where o.id=operation_id returning to_jsonb(o)-'request'-'run_token' into result;
 end if;
 return result;
end $$;
create function source_check_detail(actor uuid,check_id uuid default null) returns jsonb language plpgsql security definer set search_path=public set statement_timeout='10s' as $$
begin
 if not workspace_can(actor,'read') then raise sqlstate 'PT403' using message='Campus access required'; end if;
 return jsonb_build_object('checks',coalesce((select jsonb_agg(to_jsonb(q)-'token' order by created_at desc) from (select * from source_check_runs where campus_id=current_campus_id() and (check_id is null or id=check_id) order by created_at desc limit 30) q),'[]'));
end $$;
create function source_decision_history(actor uuid,change_id text default null) returns jsonb language plpgsql security definer set search_path=public set statement_timeout='10s' as $$
begin
 if not workspace_can(actor,'read') then raise sqlstate 'PT403' using message='Campus access required'; end if;
 return jsonb_build_object('decisions',coalesce((select jsonb_agg(to_jsonb(q)) from (select id,group_id,actor,outcome,reversal_of,created_at,jsonb_array_length(members) dependency_count,evidence from source_decision_receipts where campus_id=current_campus_id() and (change_id is null or group_id=change_id) order by created_at desc limit 30) q),'[]'),
 'legacyFindings',coalesce((select jsonb_agg(to_jsonb(q)) from (select id,source_id,status,reviewed_at,'Legacy routing identity changed; retained evidence requires manual review' finding from map_changes where campus_id=current_campus_id() and status='accepted' and before->>'entity'='edge' and (before#>'{payload,parentEdgeIds}') is not null and not exists(select 1 from source_decision_receipts d where d.campus_id=map_changes.campus_id and d.group_id=map_changes.id) order by reviewed_at desc limit 50) q),'[]'));
end $$;
-- Retain original files while any check references them, including shadow checks.
alter function import_artifact_retention_eligible(uuid) rename to _import_artifact_retention_eligible;
create function import_artifact_retention_eligible(target_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select not exists(select 1 from source_check_runs where campus_id=current_campus_id() and import_id=target_id) and _import_artifact_retention_eligible(target_id)
$$;
do $$ declare f record; begin
 for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname in ('source_undo_preview','source_undo_confirm','source_review_list','source_review_prepare','source_check_detail','source_decision_history','import_artifact_retention_eligible') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);
  execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
notify pgrst,'reload schema';
