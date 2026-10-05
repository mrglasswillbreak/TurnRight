create table gis_views(campus_id text not null references campuses(id),id uuid not null,name text not null,view jsonb not null,revision bigint not null default 1,primary key(campus_id,id));
alter table gis_views enable row level security;
grant all on gis_views to service_role;
create trigger aaa_gis_workspace_lock before insert or update or delete on gis_views for each row execute function gis_lock_workspace();
alter function gis_workspace_snapshot() rename to gis_data_snapshot;
create function gis_workspace_snapshot() returns jsonb language sql stable security definer set search_path=public as $$
 select gis_data_snapshot()||jsonb_build_object('issues',(select coalesce(jsonb_agg(to_jsonb(q) order by id),'[]') from gis_issues q where campus_id=current_campus_id()),'views',(select coalesce(jsonb_agg(to_jsonb(v) order by id),'[]') from gis_views v where campus_id=current_campus_id()))
$$;
create function gis_save_view(actor uuid, specification jsonb, operation_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare existing gis_views; operation gis_operations; result jsonb;
begin
 if not workspace_can(actor,'edit') then raise sqlstate 'PT403' using message='Editor permission required'; end if;
 perform pg_advisory_xact_lock(hashtext('gis-workspace:'||current_campus_id()));
 select * into operation from gis_operations where campus_id=current_campus_id() and id=operation_id;
 if found then if operation.actor<>actor or operation.request<>specification then raise sqlstate 'PT409' using message='Operation identity already used'; end if; return operation.result; end if;
 select * into existing from gis_views where campus_id=current_campus_id() and id=(specification->>'id')::uuid;
 if coalesce(existing.revision,0)<>(specification->>'revision')::bigint then raise sqlstate 'PT409' using message='Map view changed'; end if;
 insert into gis_views values(current_campus_id(),(specification->>'id')::uuid,specification->>'name',specification,coalesce(existing.revision,0)+1) on conflict(campus_id,id) do update set name=excluded.name,view=excluded.view,revision=excluded.revision returning view||jsonb_build_object('revision',revision) into result;
 insert into gis_operations values(current_campus_id(),operation_id,actor,specification,result);
 insert into workspace_audit(campus_id,actor,action,subject) values(current_campus_id(),actor,'view-save',specification->>'id');
 return result;
end $$;
-- Include view authors in the independent-review contributor set.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('gis_submit_review(uuid,uuid,text)'::regprocedure);
 definition:=replace(definition,$needle$'source-review','csv-import'$needle$,$replacement$'source-review','csv-import','view-save'$replacement$);execute definition;
end $$;
revoke all on function gis_workspace_snapshot(),gis_save_view(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function gis_workspace_snapshot(),gis_save_view(uuid,jsonb,uuid) to service_role;
notify pgrst,'reload schema';
