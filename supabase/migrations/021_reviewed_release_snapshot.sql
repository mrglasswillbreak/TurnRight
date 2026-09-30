-- Bound large reviewed snapshots without increasing the timeout of ordinary APIs.
create function public.create_reviewed_release_snapshot(
  actor uuid, release_identity uuid, release_summary text,
  release_snapshot jsonb, catalogue_hash text
) returns uuid language plpgsql security definer
set search_path=public set statement_timeout='60s' as $$
declare existing public.releases;
begin
  if not exists(select 1 from admin_users where id=actor) then
    raise exception 'Administrator required';
  end if;
  if release_identity is null or release_summary is null or length(release_summary)>10000
    or catalogue_hash is null or catalogue_hash=''
    or jsonb_typeof(release_snapshot->'features') is distinct from 'array'
    or jsonb_typeof(release_snapshot->'edits') is distinct from 'array'
    or coalesce(release_snapshot->>'workspaceHash','') !~ '^[a-f0-9]{64}$'
    or release_snapshot#>>'{selection,mode}' is distinct from 'reviewed-layer-upgrade' then
    raise exception 'Invalid reviewed release snapshot';
  end if;
  if jsonb_array_length(release_snapshot->'features') not between 1 and 300000 then
    raise exception 'Invalid reviewed feature count';
  end if;
  lock table releases in share row exclusive mode;
  select * into existing from releases where id=release_identity;
  if found then
    if existing.campus_id=current_campus_id() and existing.snapshot=release_snapshot
      and existing.summary=release_summary and existing.catalogue_revision=catalogue_hash then
      return existing.id;
    end if;
    raise exception 'Release identity already belongs to a different snapshot';
  end if;
  if exists(select 1 from releases where campus_id=current_campus_id()
    and status in ('queued','building')) then
    raise exception 'A release is already being built';
  end if;
  insert into releases(id,summary,snapshot,catalogue_revision)
    values(release_identity,release_summary,release_snapshot,catalogue_hash);
  return release_identity;
end $$;
revoke all on function public.create_reviewed_release_snapshot(uuid,uuid,text,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.create_reviewed_release_snapshot(uuid,uuid,text,jsonb,text)
  to service_role;
notify pgrst, 'reload schema';
