-- Keep all draft mutations and review snapshots consistent within a campus.
create function public.gis_lock_workspace() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtext('gis-workspace:'||coalesce(new.campus_id,old.campus_id)));
 return coalesce(new,old);
end $$;
do $$ declare t text; begin foreach t in array array['source_features','map_edits','gis_datasets','gis_attributes','gis_table_rows','gis_issues','campus_memberships'] loop
 execute format('create trigger aaa_gis_workspace_lock before insert or update or delete on public.%I for each row execute function public.gis_lock_workspace()',t);
end loop; end $$;
-- GIS overlays are fetched through bounded feature queries, separately from navigation.
alter table source_features add column gis_managed boolean generated always as (coalesce(payload#>>'{properties,gisManaged}'='true',false)) stored;
alter table map_edits add column gis_managed boolean generated always as (coalesce(properties->>'gisManaged'='true',false)) stored;
create index source_navigation_subset on source_features(campus_id,id) where not gis_managed;
create index edits_navigation_subset on map_edits(campus_id,id,kind) where not gis_managed;
create function public.workspace_campuses(actor uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(c) order by c.name),'[]') from campuses c where workspace_can(actor,'read',c.id)
$$;
create function public.create_team_campus(actor uuid, identity jsonb, records jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
 if not workspace_can(actor,'manage') then raise sqlstate 'PT403' using message='Administrator permission required'; end if;
 perform create_campus(identity,records);
 insert into campus_memberships values(identity->>'id',actor,array['administrator']) on conflict do nothing;
 insert into workspace_audit(campus_id,actor,action,subject) values(identity->>'id',actor,'campus-create',identity->>'id');
end $$;
create function public.gis_read_feature(actor uuid, dataset text, feature text, expected_revision bigint) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; d gis_datasets;
begin
 if not workspace_can(actor,'read') then raise sqlstate 'PT403' using message='Campus access required'; end if;
 select * into d from gis_datasets where campus_id=current_campus_id() and id=dataset for share;
 if not found or d.revision<>expected_revision then raise sqlstate 'PT409' using message='Dataset changed. Refresh before editing.'; end if;
 if not exists(select 1 from gis_feature_index where campus_id=current_campus_id() and dataset_id=dataset and feature_key=feature and geometry is not null) then raise sqlstate 'PT404' using message='Spatial feature not found'; end if;
 return jsonb_build_object('source',(select to_jsonb(s)-'private_attributes'-'gis_feature_key'-'gis_managed' from source_features s where campus_id=current_campus_id() and gis_feature_key=feature limit 1),'edit',(select to_jsonb(e)-'gis_managed' from map_edits e where campus_id=current_campus_id() and kind=split_part(feature,':',1) and id=substr(feature,strpos(feature,':')+1)));
end $$;
create function public.gis_asset_attached(asset text, kind text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from map_edits e where e.campus_id=current_campus_id() and not e.deleted and
  case when kind='model' then e.properties#>>'{modelDocumentAsset,id}'=asset
  else e.properties->'photos' @> jsonb_build_array(jsonb_build_object('id','owner:'||asset)) end)
 or exists(select 1 from source_features s where s.campus_id=current_campus_id() and
  case when kind='model' then s.payload#>>'{properties,modelDocumentAsset,id}'=asset
  else s.payload#>'{properties,photos}' @> jsonb_build_array(jsonb_build_object('id','owner:'||asset)) or s.entity='meta' and s.payload->'photos' @> jsonb_build_array(jsonb_build_object('id','owner:'||asset)) end)
$$;
-- Reviewers inspect the exact saved submission, even if the shared draft has moved on.
create function public.gis_review_details(actor uuid, review_identity uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare r gis_reviews; previous jsonb;
begin
 if not workspace_can(actor,'read') then raise sqlstate 'PT403' using message='Campus access required'; end if;
 select * into r from gis_reviews where campus_id=current_campus_id() and id=review_identity;
 if not found then raise sqlstate 'PT404' using message='Submission not found'; end if;
 return (to_jsonb(r)-'snapshot')||jsonb_build_object('datasets',r.snapshot->'datasets','edits',coalesce((select jsonb_agg(e) from (select value e from jsonb_array_elements(r.snapshot->'edits') limit 500) q),'[]'),
 'editCount',jsonb_array_length(r.snapshot->'edits'),'sourceCount',jsonb_array_length(r.snapshot->'features'),'current',r.content_hash=gis_content_hash(gis_workspace_snapshot()));
end $$;
-- Source acceptance must be attributed for independent review.
create function public.team_review_source(actor uuid, change_identity text, accept boolean) returns void language plpgsql security definer set search_path=public as $$
begin
 if not workspace_can(actor,'edit') then raise sqlstate 'PT403' using message='Editing permission required'; end if;
 perform review_map_change(change_identity,accept);
 insert into workspace_audit(campus_id,actor,action,subject,details) values(current_campus_id(),actor,'source-review',change_identity,jsonb_build_object('accepted',accept));
end $$;
-- Historical restores also pass through independent review, without replacing the current draft.
alter table gis_reviews add column restore_release_id uuid references releases(id);
create function public.gis_submit_restore(actor uuid, operation_id uuid, release_identity uuid, summary text) returns jsonb language plpgsql security definer set search_path=public as $$
declare r gis_reviews; old releases;
begin
 if not workspace_can(actor,'publish') then raise sqlstate 'PT403' using message='Publisher permission required'; end if;
 select * into r from gis_reviews where id=operation_id;
 if found then if r.campus_id<>current_campus_id() or r.submitted_by<>actor or r.restore_release_id is distinct from release_identity then raise sqlstate 'PT409' using message='Operation identity already used'; end if; return to_jsonb(r)-'snapshot'; end if;
 select * into old from releases where campus_id=current_campus_id() and id=release_identity and status='published';
 if not found then raise exception 'Choose a published release from this campus'; end if;
 insert into gis_reviews(campus_id,id,summary,content_hash,snapshot,contributors,submitted_by,restore_release_id) values(current_campus_id(),operation_id,summary,gis_content_hash(old.snapshot),old.snapshot,array[actor],actor,old.id) returning * into r;
 insert into workspace_audit(campus_id,actor,action,subject,details) values(current_campus_id(),actor,'restore-submit',r.id::text,jsonb_build_object('releaseId',old.id,'hash',r.content_hash));
 return to_jsonb(r)-'snapshot';
end $$;
do $$ declare definition text; begin
 definition:=pg_get_functiondef('gis_decide_review(uuid,uuid,boolean,text,boolean)'::regprocedure);
 definition:=replace(definition,'if approve and r.content_hash<>','if approve and r.restore_release_id is null and r.content_hash<>');
 execute definition;
 definition:=pg_get_functiondef('gis_prepare_release(uuid,uuid,text,text)'::regprocedure);
 definition:=replace(definition,'if not found or r.content_hash<>gis_content_hash(gis_workspace_snapshot())','if not found or (r.restore_release_id is null and r.content_hash<>gis_content_hash(gis_workspace_snapshot()))');
 definition:=replace(definition,'insert into releases(summary,snapshot,catalogue_revision,review_id) values(release_summary,r.snapshot,catalogue_hash,r.id)','insert into releases(summary,snapshot,catalogue_revision,review_id,restored_from) values(release_summary,r.snapshot,catalogue_hash,r.id,r.restore_release_id)');
 execute definition;
end $$;
-- Independent content edits cannot race snapshot capture or approval.
do $$ declare f record; definition text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('gis_submit_review','gis_decide_review','gis_prepare_release') loop
 definition:=pg_get_functiondef(f.oid);
 definition:=regexp_replace(definition,E'begin\n',E'begin\n perform pg_advisory_xact_lock(hashtext(''gis-workspace:''||current_campus_id()));\n');
 execute definition;
 end loop;
end $$;
revoke all on function workspace_campuses(uuid),create_team_campus(uuid,jsonb,jsonb),gis_read_feature(uuid,text,text,bigint),gis_asset_attached(text,text),gis_review_details(uuid,uuid),team_review_source(uuid,text,boolean),gis_submit_restore(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function workspace_campuses(uuid),create_team_campus(uuid,jsonb,jsonb),gis_read_feature(uuid,text,text,bigint),gis_asset_attached(text,text),gis_review_details(uuid,uuid),team_review_source(uuid,text,boolean),gis_submit_restore(uuid,uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
