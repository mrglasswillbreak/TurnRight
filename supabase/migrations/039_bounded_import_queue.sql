-- Large JSON RPC arguments are materialized before PL/pgSQL starts. Stage small
-- requests on disk; validate the entire baseline and enqueue atomically at finish.
alter table public.campus_imports drop constraint campus_imports_phase_check;
alter table public.campus_imports add constraint campus_imports_phase_check check (phase in ('inspect','preview','queue'));

create table public.campus_import_queue_sessions (
 import_id uuid primary key references public.campus_imports(id) on delete cascade,
 campus_id text not null references public.campuses(id),
 run_token uuid not null,
 source_count integer not null check(source_count between 0 and 300000),
 proposal_count integer not null check(proposal_count between 0 and 100000),
 queued_count integer,
 created_at timestamptz not null default now()
);
create table public.campus_import_queue_records (
 import_id uuid not null references public.campus_import_queue_sessions(import_id) on delete cascade,
 kind text not null check(kind in ('source','proposal')),
 ordinal integer not null check(ordinal >= 0),
 record jsonb not null check(jsonb_typeof(record)='object' and length(record->>'id') between 1 and 1000),
 primary key(import_id,kind,ordinal)
);
create unique index campus_import_queue_record_id on public.campus_import_queue_records(import_id,kind,(record->>'id'));
alter table public.campus_import_queue_sessions enable row level security;
alter table public.campus_import_queue_records enable row level security;
revoke all on public.campus_import_queue_sessions, public.campus_import_queue_records from public, anon, authenticated, service_role;

create function public.begin_campus_import_queue(import_id uuid, expected_token uuid, source_count integer, proposal_count integer)
returns void language plpgsql security definer
set search_path=public set lock_timeout='5s' set statement_timeout='30s' as $$
declare job campus_imports; session campus_import_queue_sessions; campus text := current_campus_id();
begin
 select * into job from campus_imports where campus_id=campus and id=import_id for update;
 if not found or job.run_token is distinct from expected_token or job.status not in ('preview','running') then
  raise exception 'This import is no longer ready for review';
 end if;
 if jsonb_array_length(coalesce(job.summary->'errors','[]')) > 0 then raise exception 'Repair import errors before review'; end if;
 select * into session from campus_import_queue_sessions q where q.import_id=job.id;
 if found and session.run_token=expected_token then
  if session.source_count is distinct from source_count or session.proposal_count is distinct from proposal_count then
   raise exception 'Import queue counts changed';
  end if;
  return;
 end if;
 if job.status='running' and job.phase<>'queue' then raise exception 'Prepare a complete import preview first'; end if;
 -- Discard abandoned staging, including cancelled/failed jobs from earlier runs.
 delete from campus_import_queue_sessions q where q.import_id=job.id or
  (q.campus_id=campus and q.created_at < now()-interval '1 day' and q.queued_count is null and
   not exists(select 1 from campus_imports i where i.id=q.import_id and i.run_token=q.run_token and i.status='running'));
 insert into campus_import_queue_sessions(import_id,campus_id,run_token,source_count,proposal_count)
 values(job.id,campus,expected_token,source_count,proposal_count);
 update campus_imports set status='running',message='Preparing changes for review',updated_at=now() where id=job.id;
end $$;

create function public.stage_campus_import_queue(import_id uuid, expected_token uuid, part_kind text, start_offset integer, records jsonb)
returns integer language plpgsql security definer
set search_path=public set lock_timeout='5s' set statement_timeout='30s' as $$
declare job campus_imports; session campus_import_queue_sessions; n integer; limit_count integer;
begin
 if part_kind not in ('source','proposal') or part_kind is null or start_offset is null or start_offset<0
  or jsonb_typeof(records) is distinct from 'array' then raise exception 'Invalid import batch'; end if;
 n := jsonb_array_length(records);
 if n<1 or n>100 or octet_length(records::text)>524288 then raise exception 'Import batch exceeds its limit'; end if;
 select * into job from campus_imports where campus_id=current_campus_id() and id=import_id for update;
 if not found or job.run_token is distinct from expected_token or job.status<>'running' then raise exception 'Import cancelled or replaced by another run'; end if;
 select * into session from campus_import_queue_sessions q where q.import_id=job.id and q.run_token=expected_token;
 if not found then raise exception 'Start the import queue first'; end if;
 limit_count := case when part_kind='source' then session.source_count else session.proposal_count end;
 if start_offset::bigint+n > limit_count then raise exception 'Import batch exceeds declared record count'; end if;
 if exists(select 1 from jsonb_array_elements(records) r where jsonb_typeof(r)<>'object' or r->>'id' is null) then raise exception 'Invalid import record'; end if;
 insert into campus_import_queue_records(import_id,kind,ordinal,record)
 select job.id,part_kind,start_offset+ord::integer-1,r from jsonb_array_elements(records) with ordinality as incoming(r,ord)
 on conflict on constraint campus_import_queue_records_pkey do nothing;
 -- Retrying a lost response is safe, but changed/reordered payloads must fail.
 if exists(select 1 from jsonb_array_elements(records) with ordinality as incoming(r,ord)
  join campus_import_queue_records q on q.import_id=job.id and q.kind=part_kind and q.ordinal=start_offset+ord-1
  where q.record is distinct from r) then raise exception 'Import batch differs from the staged records'; end if;
 return n;
end $$;

create function public.finish_campus_import_queue(import_id uuid, expected_token uuid)
returns integer language plpgsql security definer
set search_path=public set lock_timeout='5s' set statement_timeout='60s' set work_mem='4MB' as $$
declare job campus_imports; session campus_import_queue_sessions;
 campus text := current_campus_id(); count_added integer;
 deadline timestamptz := clock_timestamp()+interval '45 seconds';
begin
 if not pg_try_advisory_xact_lock(hashtext('turnright-source-review:' || campus)) then raise exception 'Another source review is running. Wait for it to finish before retrying.'; end if;
 select * into job from campus_imports where campus_id=campus and id=import_id for update;
 if not found or job.run_token is distinct from expected_token then raise exception 'Import cancelled or replaced by another run'; end if;
 select * into session from campus_import_queue_sessions q where q.import_id=job.id and q.run_token=expected_token;
 if not found then raise exception 'Start the import queue first'; end if;
 if job.status='reviewed' and session.queued_count is not null then return session.queued_count; end if;
 if job.status<>'running' then raise exception 'Import cancelled or replaced by another run'; end if;
 if jsonb_array_length(coalesce(job.summary->'errors','[]')) > 0 then raise exception 'Repair import errors before review'; end if;
 if session.source_count<>(select count(*) from campus_import_queue_records q where q.import_id=job.id and q.kind='source')
  or session.proposal_count<>(select count(*) from campus_import_queue_records q where q.import_id=job.id and q.kind='proposal') then raise exception 'Import batches are incomplete'; end if;
 -- Keep the baseline stable until the atomic review transaction commits. Readers
 -- (including Auth) remain unblocked; a busy editor causes a bounded lock failure.
 lock table source_features in share mode;
 if session.source_count<>(select count(*) from source_features where campus_id=campus) then raise exception 'The campus changed. Rebuild the import preview.'; end if;
 -- Newly staged tables need current statistics: otherwise repeated point
 -- lookups can choose scans based on the previously empty table's estimates.
 analyze campus_import_queue_records;
 if exists(select 1 from source_features s left join campus_import_queue_records q
  on q.import_id=job.id and q.kind='source' and q.record->>'id'=s.id
  where s.campus_id=campus and to_jsonb(s) is distinct from q.record) then
  raise exception 'The campus changed. Rebuild the import preview.';
 end if;
 if clock_timestamp()>deadline then raise exception 'Import source validation exceeded its time limit'; end if;
 update map_changes m set status='superseded' where m.campus_id=campus and m.status='pending'
  and (m.after->>'source'='import:' || job.source_id::text or m.before->>'source'='import:' || job.source_id::text)
  and not exists(select 1 from campus_import_queue_records q where q.import_id=job.id and q.kind='proposal' and q.record->>'id'=m.id);
 insert into map_changes(id,source_id,kind,before,after,base_hash,summary)
 select record->>'id',record->>'source_id',record->>'kind',nullif(record->'before','null'),nullif(record->'after','null'),record->>'base_hash',record->>'summary'
 from campus_import_queue_records q where q.import_id=job.id and q.kind='proposal'
 on conflict(campus_id,id) do nothing;
 get diagnostics count_added = row_count;
 update campus_imports set status='reviewed',updated_at=now(),message='Changes queued for review' where id=job.id;
 update campus_sources set configuration=job.configuration,accepted_import_id=job.id,updated_at=now() where campus_id=campus and id=job.source_id;
 update campus_import_queue_sessions q set queued_count=count_added where q.import_id=job.id;
 delete from campus_import_queue_records q where q.import_id=job.id;
 return count_added;
end $$;

revoke all on function public.begin_campus_import_queue(uuid,uuid,integer,integer), public.stage_campus_import_queue(uuid,uuid,text,integer,jsonb), public.finish_campus_import_queue(uuid,uuid) from public, anon, authenticated;
grant execute on function public.begin_campus_import_queue(uuid,uuid,integer,integer), public.stage_campus_import_queue(uuid,uuid,text,integer,jsonb), public.finish_campus_import_queue(uuid,uuid) to service_role;
-- Retire the unbounded endpoint so an outdated worker cannot repeat the outage.
drop function public.queue_campus_import(uuid,uuid,jsonb,jsonb);
notify pgrst, 'reload schema';
