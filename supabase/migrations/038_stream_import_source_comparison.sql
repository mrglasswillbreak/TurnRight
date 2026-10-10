-- A whole-campus jsonb_agg duplicated every source payload in one aggregate.
-- Compare the same ordered, complete snapshot through a bounded cursor instead.
-- Keep the RPC signature so existing app and worker deployments remain compatible.
create or replace function public.queue_campus_import(import_id uuid, expected_token uuid, proposals jsonb, expected_sources jsonb)
returns integer language plpgsql security definer
set search_path=public set statement_timeout='60s' set lock_timeout='5s' as $$
declare
 job campus_imports;
 source_row source_features;
 campus text := current_campus_id();
 compared integer := 0;
 expected_count integer;
 count_added integer := 0;
 comparison_deadline timestamptz := clock_timestamp() + interval '45 seconds';
begin
 -- Do not accumulate waiting import requests on a small shared database.
 if not pg_try_advisory_xact_lock(hashtext('turnright-source-review:' || campus)) then
  raise exception 'Another source review is running. Wait for it to finish before retrying.';
 end if;
 select * into job from campus_imports where campus_id=campus and id=import_id for update;
 if not found or job.status <> 'preview' or job.run_token <> expected_token then raise exception 'This import is no longer ready for review'; end if;
 if jsonb_array_length(coalesce(job.summary->'errors','[]')) > 0 then raise exception 'Repair import errors before review'; end if;
 if jsonb_typeof(expected_sources) is distinct from 'array' then
  raise exception 'The campus changed. Rebuild the import preview.';
 end if;
 expected_count := jsonb_array_length(expected_sources);
 if expected_count <> (select count(*) from source_features where campus_id=campus) then
  raise exception 'The campus changed. Rebuild the import preview.';
 end if;
 -- PL/pgSQL's cursor fetches rows in batches. Only one source row is converted
 -- to JSON at a time, including all current columns and nested metadata.
 for source_row in select * from source_features where campus_id=campus order by id loop
  if clock_timestamp() > comparison_deadline then
   raise exception 'Import source validation exceeded its time limit. Try a smaller import.';
  end if;
  if to_jsonb(source_row) is distinct from expected_sources->compared then
   raise exception 'The campus changed. Rebuild the import preview.';
  end if;
  compared := compared + 1;
 end loop;
 if compared <> expected_count then raise exception 'The campus changed. Rebuild the import preview.'; end if;
 update map_changes set status='superseded' where campus_id=campus and status='pending' and (after->>'source'='import:' || job.source_id::text or before->>'source'='import:' || job.source_id::text);
 insert into map_changes(id,source_id,kind,before,after,base_hash,summary)
 select proposal->>'id',proposal->>'source_id',proposal->>'kind',nullif(proposal->'before','null'),nullif(proposal->'after','null'),proposal->>'base_hash',proposal->>'summary'
 from jsonb_array_elements(proposals) as incoming(proposal)
 on conflict(campus_id,id) do nothing;
 get diagnostics count_added = row_count;
 update campus_imports set status='reviewed',updated_at=now(),message='Changes queued for review' where campus_id=campus and id=job.id;
 update campus_sources set configuration=job.configuration,accepted_import_id=job.id,updated_at=now() where campus_id=campus and id=job.source_id;
 return count_added;
end $$;
-- CREATE OR REPLACE retains the existing service-role-only execution grants.
notify pgrst, 'reload schema';
