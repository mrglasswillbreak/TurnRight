-- Imported cartography and generic overlays share the existing campus-scoped
-- edit history, concurrency checks, recovery and publication workflow.
alter table public.map_edits drop constraint map_edits_kind_check;
alter table public.map_edits add constraint map_edits_kind_check
  check (kind in ('place','path','building','entrance','barrier','closure','land','overlay'));
