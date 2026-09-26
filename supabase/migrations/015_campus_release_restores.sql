alter table public.releases add column restored_from uuid references public.releases(id);
alter table public.releases add column published_catalogue_revision text;
create function public.restore_campus_release(previous_id uuid, catalogue_hash text) returns uuid
language plpgsql security definer set search_path=public as $$
declare previous releases; receipt uuid;
begin
 perform pg_advisory_xact_lock(hashtext('turnright-release'));
 select * into previous from releases where campus_id=current_campus_id() and id=previous_id and status='published';
 if not found then raise exception 'Choose a published release from this campus'; end if;
 if exists(select 1 from releases where campus_id=current_campus_id() and status in ('queued','building')) then raise exception 'A release is already being built'; end if;
 insert into releases(summary,snapshot,catalogue_revision,restored_from)
 values('Restore campus release ' || previous.version,previous.snapshot,catalogue_hash,previous.id) returning id into receipt;
 return receipt;
end $$;
revoke all on function public.restore_campus_release(uuid,text) from public,anon,authenticated;
grant execute on function public.restore_campus_release(uuid,text) to service_role;
create or replace function public.protect_release_snapshot() returns trigger language plpgsql as $$
begin
 if new.campus_id is distinct from old.campus_id or new.catalogue_revision is distinct from old.catalogue_revision
 or new.restored_from is distinct from old.restored_from or new.snapshot is distinct from old.snapshot
 or new.summary is distinct from old.summary then raise exception 'Release snapshots are immutable; create a new release'; end if;
 return new;
end $$;
notify pgrst, 'reload schema';
