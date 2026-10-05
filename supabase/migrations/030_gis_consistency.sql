-- Rebuilds do not change authoritative dataset revisions or invalidate approvals.
create or replace function public.gis_rebuild_index(campus text) returns bigint language plpgsql security definer set search_path=public as $$
declare count bigint; revisions jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('gis-workspace:'||campus));
 select jsonb_object_agg(id,revision) into revisions from gis_datasets where campus_id=campus;
 count:=gis_rebuild_geometry_index(campus);
 insert into gis_feature_index(campus_id,dataset_id,feature_key,properties)
 select r.campus_id,r.dataset_id,r.feature_key,r.values||coalesce(a.values,'{}') from gis_table_rows r left join gis_attributes a using(campus_id,dataset_id,feature_key) where r.campus_id=campus;
 update gis_datasets d set revision=(revisions->>d.id)::bigint where campus_id=campus and revisions ? d.id;
 return (select count(*) from gis_feature_index where campus_id=campus);
end $$;
-- Collect one bounded snapshot using the spatial index, without repeated full counts or JSON concatenation.
create or replace function public.gis_collect_query(actor uuid, request jsonb) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare d gis_datasets; result jsonb; box geometry; geom geometry;
begin
 if not workspace_can(actor,'read') then raise sqlstate 'PT403' using message='Campus access required'; end if;
 select * into d from gis_datasets where campus_id=current_campus_id() and id=request->>'datasetId' for share;
 if not found or (request->>'revision')::bigint is distinct from d.revision then raise sqlstate 'PT409' using message='Input revision changed'; end if;
 if request ? 'bbox' then box:=ST_MakeEnvelope((request#>>'{bbox,0}')::float,(request#>>'{bbox,1}')::float,(request#>>'{bbox,2}')::float,(request#>>'{bbox,3}')::float,4326); end if;
 if request ? 'spatial' then geom:=ST_SetSRID(ST_GeomFromGeoJSON(request#>'{spatial,geometry}'),4326); if not ST_IsValid(geom) then raise exception 'Invalid selection geometry'; end if; end if;
 select coalesce(jsonb_agg(jsonb_build_object('type','Feature','id',feature_key,'geometry',ST_AsGeoJSON(geometry)::jsonb,'properties',coalesce((select jsonb_object_agg(key,value) from jsonb_each(properties) where d.schema->'fields' @> jsonb_build_array(jsonb_build_object('name',key))),'{}')) order by feature_key),'[]') into result
 from (select * from gis_feature_index where campus_id=d.campus_id and dataset_id=d.id and gis_match(properties,request->'filters') and (box is null or geometry && box) and (not(request ? 'keys') or request->'keys' ? feature_key) and (geom is null or case when request#>>'{spatial,predicate}'='within' then ST_Within(geometry,geom) else ST_Intersects(geometry,geom) end) order by feature_key limit 100001) f;
 if jsonb_array_length(result)>100000 or octet_length(result::text)>52428800 then raise exception 'Processing input exceeds 100,000 features or 50 MiB'; end if;
 return jsonb_build_object('type','FeatureCollection','features',result);
end $$;
alter table gis_jobs add column output_count int;
create function public.gis_protect_job() returns trigger language plpgsql as $$
begin
 if new.campus_id<>old.campus_id or new.id<>old.id or new.actor<>old.actor or new.request<>old.request or new.inputs<>old.inputs or new.input_revision<>old.input_revision or new.tool<>old.tool then raise exception 'Processing inputs are immutable; create a new run'; end if;
 return new;
end $$;
create trigger immutable_gis_inputs before update on gis_jobs for each row execute function gis_protect_job();
do $$ declare definition text; begin
 definition:=pg_get_functiondef('gis_start_job(uuid,jsonb)'::regprocedure);
 definition:=replace(definition,$gis$ inputs:=inputs$gis$, $gis$ inputs:=inputs$gis$); -- No input mutation after creation.
 definition:=replace(definition,$gis$perform pg_advisory_xact_lock(hashtext('gis-job:'$gis$, $gis$perform pg_advisory_xact_lock(hashtext('gis-jobs:'||current_campus_id()));
 update gis_jobs set status='failed',completed_at=now(),message='Worker lease expired. Rerun the saved settings.' where campus_id=current_campus_id() and ((status='running' and lease_until<now()) or (status='queued' and created_at<now()-interval '2 hours'));
 perform pg_advisory_xact_lock(hashtext('gis-job:'$gis$);
 definition:=replace(definition,$gis$jsonb_build_object('overlay',gis_collect_query(actor,job_request->'overlay'))$gis$,$gis$jsonb_build_object('overlay',gis_collect_query(actor,job_request->'overlay'),'overlaySchema',(select schema from gis_datasets where campus_id=current_campus_id() and id=job_request#>>'{overlay,datasetId}'))$gis$);
 execute definition;
 definition:=pg_get_functiondef('gis_finish_job(uuid,uuid,jsonb)'::regprocedure);
 definition:=replace(definition,$gis$progress=100,message=$gis$,$gis$progress=100,output_count=(result->>'count')::int,message=$gis$);execute definition;
 definition:=pg_get_functiondef('gis_apply_job(uuid,uuid)'::regprocedure);
 definition:=regexp_replace(definition,E'begin\n',E'begin\n perform pg_advisory_xact_lock(hashtext(''gis-workspace:''||current_campus_id()));\n');
 definition:=replace(definition,$gis$if (select count(*) from gis_job_features where job_id=job.id and run_token=job.run_token) not between 1 and 100000 then raise exception 'Output must contain 1–100,000 features'; end if;$gis$,$gis$if job.output_count is null or job.output_count not between 0 and 100000 or job.output_count<>(select count(*) from gis_job_features where job_id=job.id and run_token=job.run_token) then raise exception 'Staged output is incomplete'; end if;$gis$);
 definition:=replace(definition,$gis$geometry:=ST_SetSRID(ST_GeomFromGeoJSON(row.feature->'geometry'),4326);$gis$,$gis$if row.feature->'geometry'='null'::jsonb then
 perform gis_validate_values(job.output_schema,row.feature->'properties');
 insert into gis_table_rows values(current_campus_id(),dataset,'row:'||feature_id,row.feature->'properties');
 insert into gis_feature_index(campus_id,dataset_id,feature_key,properties) values(current_campus_id(),dataset,'row:'||feature_id,row.feature->'properties');
 continue; end if;
 geometry:=ST_SetSRID(ST_GeomFromGeoJSON(row.feature->'geometry'),4326);$gis$);
 execute definition;
 definition:=pg_get_functiondef('gis_import_table(uuid,uuid,text,jsonb,jsonb)'::regprocedure);
 definition:=replace(definition,$gis$d.provenance->>'hash'<>gis_content_hash(rows)$gis$,$gis$d.provenance->>'hash'<>gis_content_hash(rows) or d.provenance->>'actor'<>actor::text or d.name<>dataset_name or d.schema<>schema_definition$gis$);execute definition;
 definition:=pg_get_functiondef('apply_additive_source_patch(uuid,text,jsonb,jsonb)'::regprocedure);
 definition:=replace(definition,'exists(select 1 from admin_users where id=actor)',$gis$workspace_can(actor,'manage')$gis$);execute definition;
end $$;
-- Preserve private drafts while allowing team membership to replace the singleton owner predicate.
drop policy if exists owner_read on building_media;
drop policy if exists owner_read on surveys;
do $$ declare p record; definition text; begin
 for p in select tablename,policyname,qual from pg_policies where schemaname='public' and tablename in ('building_media','surveys','survey_revisions','survey_chunks') and qual like '%admin_users%' loop
  execute format('drop policy %I on %I',p.policyname,p.tablename);
  execute format('create policy %I on %I for select to authenticated using (owner=auth.uid() and workspace_can(auth.uid(),''read'',campus_id))',p.policyname,p.tablename);
 end loop;
end $$;
notify pgrst,'reload schema';
