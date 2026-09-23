-- Unfinished photo descriptions and upload targets remain owner-only.
alter table public.building_media
  add column draft_metadata jsonb not null default '{}'::jsonb,
  add column original_filename text,
  add column original_mime text,
  add column original_bytes integer,
  add column draft_revision integer not null default 0 check (draft_revision >= 0),
  add column authorship_confirmed boolean not null default false,
  add column updated_at timestamptz not null default now();

alter table public.building_media
  add constraint media_draft_object check (jsonb_typeof(draft_metadata) = 'object'),
  add constraint media_filename_size check (length(original_filename) <= 256),
  add constraint media_original_size check (original_bytes > 0 and original_bytes <= 10485760);

-- Existing owner RLS and the approved-record immutability trigger continue to apply.
create index building_media_owner_updated on public.building_media(owner, updated_at desc);
