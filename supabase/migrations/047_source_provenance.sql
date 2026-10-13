-- Provenance recovery can only attach retained observations to exact records
-- already accepted in historical decisions. It never changes map content.
create trigger accepted_observation_revision after insert or update or delete on source_accepted_observations for each row execute function source_state_changed();
create function source_provenance_backfill(actor uuid,check_id uuid,apply_matches boolean default false,page_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=public set statement_timeout='10s' as $$
declare run source_check_runs; observation source_observations; exact boolean; findings jsonb:='[]'; recovered integer:=0;
begin
 if not workspace_can(actor,case when apply_matches then 'manage' else 'read' end) then raise sqlstate 'PT403' using message='Campus permission required'; end if;
 if page_offset<0 or page_offset>100000 then raise exception 'Invalid provenance page'; end if;
 perform pg_advisory_xact_lock(hashtext('turnright-source-review:'||current_campus_id()));
 select * into run from source_check_runs where id=check_id and campus_id=current_campus_id() and status in ('shadow','complete');
 if not found then raise exception 'Completed evidence check required'; end if;
 for observation in select * from source_observations o where o.run_id=run.id order by identity limit 100 offset page_offset loop
  exact:=coalesce((observation.value->>'stable')::boolean,false) and coalesce(observation.value->>'evidenceUnavailable','false')<>'true' and (observation.value->>'recordCount')::integer>0
   and not exists(select 1 from (select value r from source_observation_records where run_id=run.id and identity=observation.identity) q where
    not exists(select 1 from source_features s where s.campus_id=run.campus_id and s.id=r->>'id' and s.hash=r->>'hash' and s.payload=r->'payload')
    or not exists(select 1 from map_changes m where m.campus_id=run.campus_id and m.status='accepted' and m.source_id=r->>'id'
       and m.after->>'hash'=r->>'hash' and m.after->'payload'=r->'payload' and m.reviewed_at>=(run.receipt->>'retrievedAt')::timestamptz));
  findings:=findings||jsonb_build_array(jsonb_build_object('identity',observation.identity,'recoverable',exact,'reason',case when exact then 'Exact accepted identities, content and retained receipt match' else 'Historical upstream evidence is insufficient; accepted data retained' end));
  if apply_matches and exact and not exists(select 1 from source_accepted_observations where campus_id=run.campus_id and source_key=run.source_key and identity=observation.identity) then
   insert into source_accepted_observations(campus_id,source_key,identity,run_id) values(run.campus_id,run.source_key,observation.identity,run.id);
   insert into source_feature_lineage select run.campus_id,run.source_key,observation.identity,record_id from source_observation_records where run_id=run.id and identity=observation.identity;
   insert into workspace_audit(campus_id,actor,action,subject,details) values(run.campus_id,actor,'source-provenance-recovered',observation.identity,jsonb_build_object('checkId',run.id,'mapContentChanged',false));
   recovered:=recovered+1;
  end if;
 end loop;
 return jsonb_build_object('findings',findings,'recovered',recovered,'nextOffset',case when jsonb_array_length(findings)=100 then page_offset+100 else null end);
end $$;
revoke all on function source_provenance_backfill(uuid,uuid,boolean,integer) from public,anon,authenticated;
grant execute on function source_provenance_backfill(uuid,uuid,boolean,integer) to service_role;
notify pgrst,'reload schema';
