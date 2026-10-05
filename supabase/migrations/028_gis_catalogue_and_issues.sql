create function public.gis_dataset_catalogue(actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not workspace_can(actor,'read') then raise sqlstate 'PT403' using message='Campus access required'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('count',coalesce(n.count,0)) order by d.name,d.id),'[]') from gis_datasets d left join (select dataset_id,count(*) from gis_feature_index where campus_id=current_campus_id() group by dataset_id) n on n.dataset_id=d.id where d.campus_id=current_campus_id());
end $$;
create function public.gis_save_issue(actor uuid, issue jsonb, expected_revision bigint) returns jsonb language plpgsql security definer set search_path=public as $$
declare old gis_issues; saved gis_issues; comments jsonb;
begin
 if not workspace_can(actor,'review') then raise sqlstate 'PT403' using message='Reviewer permission required'; end if;
 if issue->>'severity'='error' and issue->>'status'='accepted' then raise exception 'Blocking errors must be resolved'; end if;
 if issue->>'assigned_to' is not null and not workspace_can((issue->>'assigned_to')::uuid,'read') then raise exception 'Assignee must belong to this campus'; end if;
 perform pg_advisory_xact_lock(hashtext('issue:'||current_campus_id()||(issue->>'id')));
 select * into old from gis_issues where campus_id=current_campus_id() and id=issue->>'id' for update;
 if (old.id is null and expected_revision<>0) or (old.id is not null and expected_revision<>old.revision) then raise sqlstate 'PT409' using message='Issue changed. Refresh before saving.'; end if;
 comments:=coalesce(old.comments,'[]');
 if jsonb_array_length(issue->'comments')>jsonb_array_length(comments) then
 comments:=comments||jsonb_build_array(jsonb_build_object('actor',actor,'text',(issue->'comments')->-1->>'text','createdAt',now()));
 end if;
 insert into gis_issues(campus_id,id,feature_key,coordinates,severity,code,message,status,assigned_to,comments,evidence,revision)
 values(current_campus_id(),issue->>'id',issue->>'feature_key',issue->'coordinates',issue->>'severity',issue->>'code',issue->>'message',issue->>'status',(issue->>'assigned_to')::uuid,comments,coalesce(issue->'evidence','[]'),coalesce(old.revision,0)+1)
 on conflict(campus_id,id) do update set status=excluded.status,assigned_to=excluded.assigned_to,comments=excluded.comments,evidence=excluded.evidence,revision=excluded.revision returning * into saved;
 insert into workspace_audit(campus_id,actor,action,subject,details) values(current_campus_id(),actor,'issue-update',saved.id,to_jsonb(saved));
 return to_jsonb(saved);
end $$;
-- CSV tables are authoritative private inputs and must survive index rebuilds and approval hashing.
alter function public.gis_rebuild_index(text) rename to gis_rebuild_geometry_index;
create function public.gis_rebuild_index(campus text) returns bigint language plpgsql security definer set search_path=public as $$
declare n bigint;
begin
 n:=gis_rebuild_geometry_index(campus);
 insert into gis_feature_index(campus_id,dataset_id,feature_key,properties) select r.campus_id,r.dataset_id,r.feature_key,r.values||coalesce(a.values,'{}') from gis_table_rows r left join gis_attributes a using(campus_id,dataset_id,feature_key) where r.campus_id=campus;
 return n+(select count(*) from gis_table_rows where campus_id=campus);
end $$;
create or replace function public.gis_workspace_snapshot() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
 'features',(select coalesce(jsonb_agg(to_jsonb(f)-'gis_feature_key' order by id),'[]') from source_features f where campus_id=current_campus_id()),
 'edits',(select coalesce(jsonb_agg(to_jsonb(e) order by kind,id),'[]') from map_edits e where campus_id=current_campus_id()),
 'datasets',(select coalesce(jsonb_agg(to_jsonb(d) order by id),'[]') from gis_datasets d where campus_id=current_campus_id()),
 'attributes',(select coalesce(jsonb_agg(to_jsonb(a) order by dataset_id,feature_key),'[]') from gis_attributes a where campus_id=current_campus_id()),
 'tables',(select coalesce(jsonb_agg(to_jsonb(t) order by dataset_id,feature_key),'[]') from gis_table_rows t where campus_id=current_campus_id()))
$$;
revoke all on function public.gis_dataset_catalogue(uuid),public.gis_save_issue(uuid,jsonb,bigint),public.gis_rebuild_index(text) from public,anon,authenticated;
grant execute on function public.gis_dataset_catalogue(uuid),public.gis_save_issue(uuid,jsonb,bigint),public.gis_rebuild_index(text) to service_role;
notify pgrst,'reload schema';
