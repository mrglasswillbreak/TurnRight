-- Run once in the Supabase SQL editor. Then add your Auth user UUID to admin_users.
create extension if not exists postgis with schema extensions;
create table public.admin_users (id uuid primary key references auth.users(id));
alter table public.admin_users enable row level security;
create policy own_admin_record on public.admin_users for select to authenticated using (id = auth.uid());
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$ select exists(select 1 from admin_users where id = auth.uid()); $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create table public.source_features (id text primary key, source text not null, entity text not null, payload jsonb not null, hash text not null, updated_at timestamptz not null default now());
create table public.map_changes (id text primary key, source_id text not null, kind text not null check (kind in ('add','modify','remove')), before jsonb, after jsonb, base_hash text, status text not null default 'pending' check (status in ('pending','accepted','rejected','superseded')), summary text not null, created_at timestamptz not null default now(), reviewed_at timestamptz);
create table public.map_edits (id text primary key, kind text not null check (kind in ('place','path','building','entrance','barrier','closure')), geometry jsonb not null, properties jsonb not null default '{}', deleted boolean not null default false, updated_at timestamptz not null default now());
create table public.edit_history (id bigint generated always as identity primary key, edit_id text not null, before jsonb, after jsonb, actor uuid, created_at timestamptz not null default now());
create table public.reports (id uuid primary key default gen_random_uuid(), coordinates jsonb not null, place_id text, category text not null check (category in ('incorrect-place','blocked-path','missing-path','other')), description text not null check (length(description) between 10 and 1000), status text not null default 'pending' check (status in ('pending','resolved','dismissed')), created_at timestamptz not null default now());
create table public.report_limits (key text primary key, window_start timestamptz not null, count integer not null);
create table public.jobs (id uuid primary key default gen_random_uuid(), kind text not null, status text not null check (status in ('queued','running','succeeded','failed')), message text, created_at timestamptz not null default now(), completed_at timestamptz);
create table public.releases (id uuid primary key default gen_random_uuid(), status text not null default 'queued' check (status in ('queued','building','preview','published','failed')), summary text not null, snapshot jsonb not null, preview_url text, deployment_url text, deployment_id text, version text, error text, created_at timestamptz not null default now(), published_at timestamptz);
create index changes_status on public.map_changes(status);
create index reports_status on public.reports(status);
create index history_edit on public.edit_history(edit_id);

do $$ declare t text; begin
 foreach t in array array['source_features','map_changes','map_edits','edit_history','reports','jobs','releases'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('create policy admin_read on public.%I for select to authenticated using (public.is_admin())', t);
 end loop;
end $$;
alter table public.report_limits enable row level security;
-- All writes go through verified server endpoints. No browser service-role key.

create or replace function public.audit_map_edit() returns trigger language plpgsql security definer set search_path = public as $$
begin
 insert into edit_history(edit_id,before,after,actor) values(coalesce(new.id,old.id),to_jsonb(old),to_jsonb(new),auth.uid());
 return coalesce(new,old);
end $$;
create trigger audit_map_edits after insert or update or delete on public.map_edits for each row execute function public.audit_map_edit();

create or replace function public.review_map_change(change_id text, accept_change boolean) returns void language plpgsql security definer set search_path = public as $$
declare change_record map_changes; current_hash text;
begin
 select * into change_record from map_changes where id=change_id and status='pending' for update;
 if not found then raise exception 'Change is no longer pending'; end if;
 select hash into current_hash from source_features where id=change_record.source_id for update;
 if current_hash is distinct from change_record.base_hash then raise exception 'Source changed since this proposal. Refresh the review queue.'; end if;
 if accept_change then
  if change_record.kind='remove' then delete from source_features where id=change_record.source_id;
  else insert into source_features(id,source,entity,payload,hash) values(change_record.after->>'id',change_record.after->>'source',change_record.after->>'entity',change_record.after->'payload',change_record.after->>'hash') on conflict(id) do update set source=excluded.source,entity=excluded.entity,payload=excluded.payload,hash=excluded.hash,updated_at=now(); end if;
 end if;
 update map_changes set status=case when accept_change then 'accepted' else 'rejected' end, reviewed_at=now() where id=change_id;
end $$;
revoke all on function public.review_map_change(text,boolean) from public,anon,authenticated;
grant execute on function public.review_map_change(text,boolean) to service_role;

create or replace function public.consume_report_slot(bucket_key text) returns boolean language plpgsql security definer set search_path=public as $$
declare used integer;
begin
 insert into report_limits(key,window_start,count) values(bucket_key,now(),1)
 on conflict(key) do update set count=case when report_limits.window_start < now()-interval '1 hour' then 1 else report_limits.count+1 end, window_start=case when report_limits.window_start < now()-interval '1 hour' then now() else report_limits.window_start end returning count into used;
 delete from report_limits where window_start < now()-interval '2 days';
 return used <= 5;
end $$;
revoke all on function public.consume_report_slot(text) from public,anon,authenticated;
grant execute on function public.consume_report_slot(text) to service_role;

create or replace function public.snapshot_release(release_summary text) returns uuid language plpgsql security definer set search_path=public as $$
declare release_id uuid;
begin
 if exists(select 1 from releases where status in ('queued','building')) then raise exception 'A release is already being built'; end if;
 insert into releases(summary,snapshot) values(release_summary,jsonb_build_object('features',(select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from source_features s),'edits',(select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) from map_edits e))) returning id into release_id;
 return release_id;
end $$;
revoke all on function public.snapshot_release(text) from public,anon,authenticated;
grant execute on function public.snapshot_release(text) to service_role;
