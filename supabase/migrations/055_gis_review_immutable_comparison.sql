-- Compare protected values directly. Repeatedly copying each complete review
-- into JSONB and removing mutable keys caused excessive work on large campuses.
-- All nine immutable columns remain protected, including the snapshot itself.
create or replace function public.gis_protect_review() returns trigger
language plpgsql as $$
begin
 if row(new.campus_id,new.id,new.summary,new.content_hash,new.snapshot,
        new.contributors,new.submitted_by,new.created_at,new.restore_release_id)
    is distinct from
    row(old.campus_id,old.id,old.summary,old.content_hash,old.snapshot,
        old.contributors,old.submitted_by,old.created_at,old.restore_release_id)
 then raise exception 'Review snapshots are immutable'; end if;
 return new;
end $$;
