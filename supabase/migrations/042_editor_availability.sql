-- Keep frequent editor reads independent of compressed full-map release snapshots.
set lock_timeout='2s';
set statement_timeout='15s';
alter table public.releases add column editor_edits jsonb;
create index releases_latest_published on public.releases(campus_id,published_at desc,id desc)
  where status='published' and published_at is not null;
create function public.capture_release_editor_edits() returns trigger
language plpgsql set search_path=public as $$
begin
  new.editor_edits := coalesce(new.snapshot->'edits','[]'::jsonb);
  if jsonb_typeof(new.editor_edits)<>'array' then raise exception 'Invalid release corrections'; end if;
  return new;
end $$;
create trigger release_editor_summary before insert or update of snapshot on public.releases
for each row execute function public.capture_release_editor_edits();
revoke all on function public.capture_release_editor_edits() from public,anon,authenticated;

-- Run repeatedly until complete before deploying readers. At most one current
-- published release is expanded per call; historical snapshots remain untouched.
create function public.backfill_release_editor_edits() returns jsonb
language plpgsql security definer set search_path=public set lock_timeout='2s' set statement_timeout='15s' as $$
declare selected uuid; remaining boolean;
begin
  perform pg_advisory_xact_lock(hashtext('release-editor-summary-backfill'));
  select latest.id into selected from (
    select distinct on (campus_id) id,editor_edits from releases
    where status='published' and published_at is not null
    order by campus_id,published_at desc,id desc
  ) latest where editor_edits is null order by id limit 1;
  if selected is not null then
    update releases set editor_edits=coalesce(snapshot->'edits','[]'::jsonb)
      where id=selected and editor_edits is null;
  end if;
  select exists(select 1 from (
    select distinct on (campus_id) editor_edits from releases
    where status='published' and published_at is not null
    order by campus_id,published_at desc,id desc
  ) latest where editor_edits is null) into remaining;
  return jsonb_build_object('updated',selected,'complete',not remaining);
end $$;
revoke all on function public.backfill_release_editor_edits() from public,anon,authenticated;
grant execute on function public.backfill_release_editor_edits() to service_role;

-- Old browser tabs must not replace accepted source updates with the public map.
-- Keep callable signatures for a clear refusal without copying arrays, locking
-- source_features or rewriting the workspace. Historical recovery receipts remain.
create or replace function public._reconcile_published_baseline(actor uuid, published_version text, expected_sources jsonb, records jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
begin
  if not workspace_can(actor,'manage') then raise sqlstate 'PT403' using message='Administrator permission required'; end if;
  raise sqlstate 'PT409' using message='Full-map baseline replacement is retired. Accepted source updates already form the working baseline. Submit the workspace for approval, then build a publication preview.';
end $$;
create or replace function public.reconcile_published_baseline(actor uuid, published_version text, expected_sources jsonb, records jsonb)
returns uuid language plpgsql security definer set search_path=public set statement_timeout='5s' set lock_timeout='1s' as $$
begin
  if not workspace_can(actor,'manage') then raise sqlstate 'PT403' using message='Administrator permission required'; end if;
  raise sqlstate 'PT409' using message='Full-map baseline replacement is retired. Accepted source updates already form the working baseline. Submit the workspace for approval, then build a publication preview.';
end $$;
revoke all on function public._reconcile_published_baseline(uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.reconcile_published_baseline(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.reconcile_published_baseline(uuid,text,jsonb,jsonb) to service_role;
reset lock_timeout;
reset statement_timeout;
notify pgrst,'reload schema';
