create table public.gis_jobs (
 campus_id text not null references campuses(id), id uuid primary key, actor uuid not null references auth.users(id), tool text not null,
 request jsonb not null, input_revision bigint not null, inputs jsonb not null,
 status text not null default 'queued' check(status in ('queued','running','succeeded','failed','cancelled','applied')),
 run_token uuid not null default gen_random_uuid(), progress int not null default 0 check(progress between 0 and 100),
 message text, engine jsonb, artifact jsonb, output_schema jsonb, output_dataset_id text,
 created_at timestamptz not null default now(), completed_at timestamptz, lease_until timestamptz
);
create table public.gis_job_features (
 campus_id text not null references campuses(id), job_id uuid not null references gis_jobs(id), run_token uuid not null,
 id text not null, feature jsonb not null, primary key(job_id,run_token,id)
);
create table public.gis_table_rows (
 campus_id text not null, dataset_id text not null, feature_key text not null, values jsonb not null,
 primary key(campus_id,dataset_id,feature_key), foreign key(campus_id,dataset_id) references gis_datasets(campus_id,id)
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('gis-private','gis-private',false,52428800,array['application/json','application/geo+json','application/geopackage+sqlite3','application/octet-stream','text/csv']) on conflict(id) do nothing;
create function public.gis_collect_query(actor uuid, request jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare page jsonb; result jsonb:='[]'; cursor text; q jsonb;
begin
 q:=(request-'cursor')||'{"limit":500,"geometry":true}'::jsonb;
 loop
 page:=gis_query(actor,q);
 result:=result||(page->'features');
 if jsonb_array_length(result)>100000 or octet_length(result::text)>52428800 then raise exception 'Processing input exceeds 100,000 features or 50 MiB'; end if;
 cursor:=page->>'nextCursor'; exit when cursor is null;
 q:=q||jsonb_build_object('cursor',cursor);
 end loop;
 return jsonb_build_object('type','FeatureCollection','features',result);
end $$;
create function public.gis_start_job(actor uuid, job_request jsonb) returns jsonb language plpgsql security definer set search_path=public set statement_timeout='60s' as $$
declare job gis_jobs; inputs jsonb; d gis_datasets;
begin
 if not workspace_can(actor,'edit') then raise sqlstate 'PT403' using message='Editing permission required'; end if;
 perform pg_advisory_xact_lock(hashtext('gis-job:'||current_campus_id()||(job_request->>'operationId')));
 select * into job from gis_jobs where id=(job_request->>'operationId')::uuid;
 if found then if job.campus_id<>current_campus_id() or job.actor<>actor or job.request<>job_request then raise sqlstate 'PT409' using message='Job identity already used'; end if; return to_jsonb(job)-'inputs'-'run_token'; end if;
 if (select count(*) from gis_jobs where campus_id=current_campus_id() and status in ('queued','running'))>=3 then raise exception 'Three jobs are already active for this campus'; end if;
 select * into d from gis_datasets where campus_id=current_campus_id() and id=job_request#>>'{input,datasetId}' for share;
 if not found then raise exception 'Input dataset not found'; end if;
 inputs:=jsonb_build_object('input',gis_collect_query(actor,job_request->'input'),'schema',d.schema,'crs',d.analysis_crs,'provenance',d.provenance);
 if job_request ? 'overlay' then inputs:=inputs||jsonb_build_object('overlay',gis_collect_query(actor,job_request->'overlay')); end if;
 insert into gis_jobs(campus_id,id,actor,tool,request,input_revision,inputs) values(current_campus_id(),(job_request->>'operationId')::uuid,actor,job_request->>'tool',job_request,d.revision,inputs) returning * into job;
 return to_jsonb(job)-'inputs'-'run_token';
end $$;
create function public.gis_claim_job(job_identity uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare job gis_jobs;
begin
 select * into job from gis_jobs where campus_id=current_campus_id() and id=job_identity for update;
 if not found or job.status<>'queued' then raise sqlstate 'PT409' using message='Job is not queued'; end if;
 if not workspace_can(job.actor,'edit') then raise sqlstate 'PT403' using message='Job author no longer has editing access'; end if;
 update gis_jobs set status='running',lease_until=now()+interval '21 minutes',progress=5 where id=job.id returning * into job;
 return to_jsonb(job);
end $$;
create function public.gis_cancel_job(actor uuid, job_identity uuid) returns boolean language plpgsql security definer set search_path=public as $$
begin
 if not workspace_can(actor,'edit') then raise sqlstate 'PT403' using message='Editing permission required'; end if;
 update gis_jobs set status='cancelled',run_token=gen_random_uuid(),completed_at=now(),message='Cancelled by a campus editor' where campus_id=current_campus_id() and id=job_identity and status in ('queued','running','succeeded');
 return found;
end $$;
create function public.gis_finish_job(job_identity uuid, token uuid, result jsonb) returns boolean language plpgsql security definer set search_path=public as $$
declare job gis_jobs;
begin
 select * into job from gis_jobs where campus_id=current_campus_id() and id=job_identity for update;
 if not found or job.run_token<>token or job.status<>'running' or job.lease_until<now() then return false; end if;
 if not workspace_can(job.actor,'edit') then update gis_jobs set status='cancelled',message='Author access was revoked',completed_at=now() where id=job.id; return false; end if;
 update gis_jobs set status=case when result ? 'error' then 'failed' else 'succeeded' end,progress=100,message=coalesce(result->>'error',result->>'message'),artifact=result->'artifact',engine=result->'engine',output_schema=result->'schema',completed_at=now() where id=job.id;
 return true;
end $$;
create function public.gis_apply_job(actor uuid, job_identity uuid) returns jsonb language plpgsql security definer set search_path=public,extensions set statement_timeout='60s' as $$
declare job gis_jobs; dataset text; row record; feature_id text; geometry geometry;
begin
 if not workspace_can(actor,'edit') then raise sqlstate 'PT403' using message='Editing permission required'; end if;
 select * into job from gis_jobs where campus_id=current_campus_id() and id=job_identity for update;
 if job.status='applied' then return jsonb_build_object('datasetId',job.output_dataset_id); end if;
 if not found or job.status<>'succeeded' or job.tool='export' then raise sqlstate 'PT409' using message='This job has no applicable output'; end if;
 if not exists(select 1 from gis_datasets where campus_id=current_campus_id() and id=job.request#>>'{input,datasetId}' and revision=job.input_revision) or (job.request ? 'overlay' and not exists(select 1 from gis_datasets where campus_id=current_campus_id() and id=job.request#>>'{overlay,datasetId}' and revision=(job.request#>>'{overlay,revision}')::bigint)) then raise sqlstate 'PT409' using message='Input data changed. Rerun this operation before applying.'; end if;
 if (select count(*) from gis_job_features where job_id=job.id and run_token=job.run_token) not between 1 and 100000 then raise exception 'Output must contain 1–100,000 features'; end if;
 dataset:='gis:'||job.id;
 insert into gis_datasets(campus_id,id,name,schema,analysis_crs,provenance) values(current_campus_id(),dataset,job.request->>'name',job.output_schema,job.inputs->>'crs',jsonb_build_object('jobId',job.id,'inputs',job.request,'engine',job.engine,'actor',job.actor));
 for row in select feature,id from gis_job_features where job_id=job.id and run_token=job.run_token order by id loop
 feature_id:=dataset||':'||row.id;
 geometry:=ST_SetSRID(ST_GeomFromGeoJSON(row.feature->'geometry'),4326);
 if geometry is null or ST_IsEmpty(geometry) or not ST_IsValid(geometry) or ST_NPoints(geometry)>20000 or ST_XMin(geometry::box3d)<-180 or ST_XMax(geometry::box3d)>180 or ST_YMin(geometry::box3d)<-90 or ST_YMax(geometry::box3d)>90 then raise exception 'Output geometry requires repair'; end if;
 perform gis_validate_values(job.output_schema,row.feature->'properties');
 insert into source_features(campus_id,id,source,entity,payload,hash,private_attributes) values(current_campus_id(),'feature:'||feature_id,dataset,'feature',jsonb_build_object('type','Feature','geometry',row.feature->'geometry','properties',jsonb_build_object('id',feature_id,'kind','overlay','name',coalesce(row.feature#>>'{properties,name}',job.request->>'name'),'mapLayerId',dataset,'gisManaged',true)),gis_content_hash(row.feature),row.feature->'properties');
 end loop;
 update gis_jobs set status='applied',output_dataset_id=dataset where id=job.id;
 insert into workspace_audit(campus_id,actor,action,subject,details) values(current_campus_id(),actor,'job-apply',job.id::text,jsonb_build_object('datasetId',dataset));
 return jsonb_build_object('datasetId',dataset);
end $$;
create function public.gis_import_table(actor uuid, operation_id uuid, dataset_name text, schema_definition jsonb, rows jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare d gis_datasets; row jsonb; key text; count int:=0;
begin
 if not workspace_can(actor,'edit') then raise sqlstate 'PT403' using message='Editing permission required'; end if;
 perform pg_advisory_xact_lock(hashtext('gis-table:'||operation_id::text));
 select * into d from gis_datasets where campus_id=current_campus_id() and id='table:'||operation_id;
 if found then if d.provenance->>'hash'<>gis_content_hash(rows) then raise sqlstate 'PT409' using message='Operation identity already used'; end if; return to_jsonb(d); end if;
 if jsonb_array_length(rows) not between 1 and 100000 then raise exception 'Import 1–100,000 rows'; end if;
 insert into gis_datasets(campus_id,id,name,schema,provenance) values(current_campus_id(),'table:'||operation_id,dataset_name,schema_definition,jsonb_build_object('kind','table','actor',actor,'hash',gis_content_hash(rows))) returning * into d;
 for row in select value from jsonb_array_elements(rows) loop
 count:=count+1; key:='row:'||operation_id||':'||lpad(count::text,6,'0'); perform gis_validate_values(schema_definition,row);
 insert into gis_table_rows values(d.campus_id,d.id,key,row);
 insert into gis_feature_index(campus_id,dataset_id,feature_key,properties) values(d.campus_id,d.id,key,row);
 end loop;
 insert into workspace_audit(campus_id,actor,action,subject,details) values(current_campus_id(),actor,'csv-import',d.id,jsonb_build_object('rows',count));
 return to_jsonb(d);
end $$;
do $$ declare t text; begin foreach t in array array['gis_jobs','gis_job_features','gis_table_rows'] loop execute format('alter table public.%I enable row level security',t); execute format('grant all on public.%I to service_role',t); end loop; end $$;
revoke all on function public.gis_collect_query(uuid,jsonb),public.gis_start_job(uuid,jsonb),public.gis_claim_job(uuid),public.gis_cancel_job(uuid,uuid),public.gis_finish_job(uuid,uuid,jsonb),public.gis_apply_job(uuid,uuid),public.gis_import_table(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.gis_collect_query(uuid,jsonb),public.gis_start_job(uuid,jsonb),public.gis_claim_job(uuid),public.gis_cancel_job(uuid,uuid),public.gis_finish_job(uuid,uuid,jsonb),public.gis_apply_job(uuid,uuid),public.gis_import_table(uuid,uuid,text,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
