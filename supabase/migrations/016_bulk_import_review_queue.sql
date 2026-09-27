-- Queue large validated imports in one statement instead of one insert per record.
-- Keep the existing lock, campus scope, run token and complete-source checks.
create or replace function public.queue_campus_import(import_id uuid, expected_token uuid, proposals jsonb, expected_sources jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare job campus_imports; current_records jsonb; count_added integer := 0;
begin
 perform pg_advisory_xact_lock(hashtext('turnright-source-review:' || current_campus_id()));
 select * into job from campus_imports where campus_id=current_campus_id() and id=import_id for update;
 if not found or job.status <> 'preview' or job.run_token <> expected_token then raise exception 'This import is no longer ready for review'; end if;
 if jsonb_array_length(coalesce(job.summary->'errors','[]')) > 0 then raise exception 'Repair import errors before review'; end if;
 select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]') into current_records from source_features s where s.campus_id=current_campus_id();
 if current_records is distinct from expected_sources then raise exception 'The campus changed. Rebuild the import preview.'; end if;
 update map_changes set status='superseded' where campus_id=current_campus_id() and status='pending' and (after->>'source'='import:' || job.source_id::text or before->>'source'='import:' || job.source_id::text);
 insert into map_changes(id,source_id,kind,before,after,base_hash,summary)
 select proposal->>'id',proposal->>'source_id',proposal->>'kind',nullif(proposal->'before','null'),nullif(proposal->'after','null'),proposal->>'base_hash',proposal->>'summary'
 from jsonb_array_elements(proposals) as incoming(proposal)
 on conflict(campus_id,id) do nothing;
 get diagnostics count_added = row_count;
 update campus_imports set status='reviewed',updated_at=now(),message='Changes queued for review' where campus_id=current_campus_id() and id=job.id;
 update campus_sources set configuration=job.configuration,accepted_import_id=job.id,updated_at=now() where campus_id=current_campus_id() and id=job.source_id;
 return count_added;
end $$;
-- CREATE OR REPLACE retains the service-role-only execution grants.
notify pgrst, 'reload schema';
