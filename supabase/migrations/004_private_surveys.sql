-- Private evidence: never included by snapshot_release or the campus package builder.
create table public.surveys (
  id uuid primary key, owner uuid not null references auth.users(id),
  head_revision uuid, archived boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.survey_revisions (
  id uuid primary key, survey_id uuid not null references public.surveys(id),
  owner uuid not null references auth.users(id), expected_revision uuid,
  metadata jsonb not null, chunk_count integer not null check(chunk_count between 0 and 2000),
  status text not null default 'pending' check(status in ('pending','complete','conflict')),
  created_at timestamptz not null default now()
);
create table public.survey_chunks (
  revision_id uuid not null references public.survey_revisions(id),
  chunk_index integer not null check(chunk_index >= 0), owner uuid not null references auth.users(id),
  samples jsonb not null check(jsonb_typeof(samples) = 'array' and jsonb_array_length(samples) between 1 and 250),
  primary key(revision_id,chunk_index)
);
alter table public.surveys add constraint surveys_head_fk foreign key(head_revision) references public.survey_revisions(id);
create index survey_revisions_owner on public.survey_revisions(owner,survey_id,created_at desc);
alter table public.surveys enable row level security;
alter table public.survey_revisions enable row level security;
alter table public.survey_chunks enable row level security;
create policy owner_reads_surveys on public.surveys for select to authenticated using(owner = auth.uid());
create policy owner_reads_survey_revisions on public.survey_revisions for select to authenticated using(owner = auth.uid());
create policy owner_reads_survey_chunks on public.survey_chunks for select to authenticated using(owner = auth.uid());
revoke all on public.surveys,public.survey_revisions,public.survey_chunks from anon,authenticated;
grant select on public.surveys,public.survey_revisions,public.survey_chunks to authenticated;
grant all on public.surveys,public.survey_revisions,public.survey_chunks to service_role;

create function public.save_survey_revision(actor_id uuid, command text, payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s surveys; r survey_revisions; old_samples jsonb; idx integer; result_status text;
begin
  if not exists(select 1 from admin_users where id = actor_id) then raise exception 'Editor access required'; end if;
  perform pg_advisory_xact_lock(hashtext('turnright-surveys:' || actor_id::text));
  if command = 'begin' then
    if octet_length(payload->'metadata'::text) > 1000000 then raise exception 'Survey metadata too large'; end if;
    insert into surveys(id,owner) values((payload->>'surveyId')::uuid,actor_id) on conflict(id) do nothing;
    select * into s from surveys where id=(payload->>'surveyId')::uuid;
    if s.owner <> actor_id then raise exception 'Survey owner mismatch'; end if;
    select * into r from survey_revisions where id=(payload->>'revisionId')::uuid;
    if found then
      if r.owner <> actor_id or r.survey_id <> s.id or r.metadata is distinct from payload->'metadata' or r.chunk_count <> (payload->>'chunkCount')::integer or r.expected_revision is distinct from (payload->>'expectedRevision')::uuid then raise exception 'Operation ID reused with different survey'; end if;
    else
      insert into survey_revisions(id,survey_id,owner,expected_revision,metadata,chunk_count)
        values((payload->>'revisionId')::uuid,s.id,actor_id,(payload->>'expectedRevision')::uuid,payload->'metadata',(payload->>'chunkCount')::integer);
    end if;
    return jsonb_build_object('ok',true);
  end if;
  if command = 'archive' then
    select * into s from surveys where id=(payload->>'surveyId')::uuid and owner=actor_id for update;
    if not found then raise exception 'Survey not found'; end if;
    if s.head_revision is distinct from (payload->>'expectedRevision')::uuid then raise sqlstate 'PT409' using message='Survey changed. Refresh before archiving.'; end if;
    update surveys set archived=(payload->>'archived')::boolean,updated_at=clock_timestamp() where id=s.id;
    return jsonb_build_object('ok',true);
  end if;
  select * into r from survey_revisions where id=(payload->>'revisionId')::uuid and owner=actor_id for update;
  if not found then raise exception 'Survey revision not found'; end if;
  if command = 'chunk' then
    idx := (payload->>'index')::integer;
    if idx < 0 or idx >= r.chunk_count or octet_length((payload->'samples')::text) > 200000 then raise exception 'Invalid recording chunk'; end if;
    select samples into old_samples from survey_chunks where revision_id=r.id and chunk_index=idx;
    if found then
      if old_samples is distinct from payload->'samples' then raise exception 'Chunk retry contains different samples'; end if;
    else
      if r.status <> 'pending' then raise exception 'Finalized evidence is immutable'; end if;
      insert into survey_chunks(revision_id,chunk_index,owner,samples) values(r.id,idx,actor_id,payload->'samples');
    end if;
    return jsonb_build_object('ok',true);
  end if;
  if command <> 'finalize' then raise exception 'Invalid survey command'; end if;
  select * into s from surveys where id=r.survey_id for update;
  if r.status = 'pending' then
    if (select count(*) from survey_chunks where revision_id=r.id) <> r.chunk_count then raise exception 'Recording upload is incomplete'; end if;
    result_status := case when s.head_revision is not distinct from r.expected_revision then 'complete' else 'conflict' end;
    update survey_revisions set status=result_status where id=r.id;
    if result_status = 'complete' then update surveys set head_revision=r.id,updated_at=clock_timestamp() where id=s.id; end if;
  else result_status := r.status;
  end if;
  return jsonb_build_object('revisionId',r.id,'status',result_status,'headRevision',(select head_revision from surveys where id=s.id));
end $$;
revoke all on function public.save_survey_revision(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_survey_revision(uuid,text,jsonb) to service_role;
