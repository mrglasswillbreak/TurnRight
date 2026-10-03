-- Revision timestamps are optimistic concurrency tokens, not just wall-clock
-- metadata. Fast writes (or a backwards clock correction) must not reuse one.
create function public.advance_editor_revision() returns trigger
language plpgsql set search_path=public as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end $$;
revoke all on function public.advance_editor_revision() from public, anon, authenticated;
create trigger advance_editor_revision before update on public.map_edits
for each row execute function public.advance_editor_revision();
notify pgrst, 'reload schema';
