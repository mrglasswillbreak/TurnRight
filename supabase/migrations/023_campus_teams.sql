-- Additive team authorization. Browser writes remain denied; API identities are verified with Auth.
create table public.campus_memberships (
 campus_id text not null references public.campuses(id), user_id uuid not null references auth.users(id),
 roles text[] not null check(cardinality(roles)>0 and roles <@ array['administrator','editor','reviewer','publisher']::text[]),
 primary key(campus_id,user_id)
);
create table public.workspace_audit (
 id bigint generated always as identity primary key, campus_id text not null references public.campuses(id), actor uuid,
 action text not null, subject text, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create function public.workspace_can(actor uuid, capability text, campus text default public.current_campus_id()) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from campus_memberships where campus_id=campus and user_id=actor and
 ('administrator'=any(roles) or capability='read' or capability='edit' and 'editor'=any(roles) or capability='review' and 'reviewer'=any(roles) or capability='publish' and 'publisher'=any(roles)))
$$;
revoke all on function public.workspace_can(uuid,text,text) from public,anon;
grant execute on function public.workspace_can(uuid,text,text) to authenticated,service_role;
insert into public.campus_memberships select c.id,a.id,array['administrator'] from campuses c cross join admin_users a;
create function public.bootstrap_campus_memberships() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_table_name='campuses' then insert into campus_memberships select new.id,id,array['administrator'] from admin_users on conflict do nothing;
 else insert into campus_memberships select id,new.id,array['administrator'] from campuses on conflict do nothing; end if;
 return new;
end $$;
create trigger campus_membership_bootstrap after insert on public.campuses for each row execute function public.bootstrap_campus_memberships();
create trigger owner_membership_bootstrap after insert on public.admin_users for each row execute function public.bootstrap_campus_memberships();
create function public.protect_workspace_audit() returns trigger language plpgsql as $$ begin raise exception 'Audit records are append-only'; end $$;
create trigger workspace_audit_immutable before update or delete on public.workspace_audit for each row execute function public.protect_workspace_audit();
create function public.save_campus_member(actor uuid, member uuid, member_roles text[], operation_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not workspace_can(actor,'manage') then raise sqlstate 'PT403' using message='Campus administrator required'; end if;
 perform pg_advisory_xact_lock(hashtext('members:'||current_campus_id()));
 if operation_id is null or member is null or member_roles is null or not(member_roles <@ array['administrator','editor','reviewer','publisher']::text[]) then raise exception 'Invalid membership'; end if;
 if exists(select 1 from workspace_audit where campus_id=current_campus_id() and action='membership' and subject=operation_id::text) then
   if not exists(select 1 from workspace_audit where campus_id=current_campus_id() and action='membership' and subject=operation_id::text and workspace_audit.actor=save_campus_member.actor and details=jsonb_build_object('userId',member,'roles',member_roles)) then raise sqlstate 'PT409' using message='Operation identity already used'; end if;
 else
   if exists(select 1 from campus_memberships where campus_id=current_campus_id() and user_id=member and 'administrator'=any(roles)) and not('administrator'=any(member_roles)) and (select count(*) from campus_memberships where campus_id=current_campus_id() and 'administrator'=any(roles))<=1 then raise exception 'Keep at least one campus administrator'; end if;
   if cardinality(member_roles)=0 then delete from campus_memberships where campus_id=current_campus_id() and user_id=member;
   else insert into campus_memberships values(current_campus_id(),member,member_roles) on conflict(campus_id,user_id) do update set roles=excluded.roles; end if;
   insert into workspace_audit(campus_id,actor,action,subject,details) values(current_campus_id(),actor,'membership',operation_id::text,jsonb_build_object('userId',member,'roles',member_roles));
 end if;
 return (select coalesce(jsonb_agg(to_jsonb(m)),'[]') from campus_memberships m where campus_id=current_campus_id());
end $$;
revoke all on function public.save_campus_member(uuid,uuid,text[],uuid) from public,anon,authenticated;
grant execute on function public.save_campus_member(uuid,uuid,text[],uuid) to service_role;
-- Replace the singleton checks inside existing transactional functions, preserving their full bodies.
do $$ declare f record; definition text; replacement text; actor_name text; capability text;
begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('save_editor_batch','save_survey_revision','review_map_fields','_reconcile_published_baseline','create_reviewed_release_snapshot') loop
  definition:=pg_get_functiondef(f.oid);
  actor_name:=case when f.proname in ('_reconcile_published_baseline','create_reviewed_release_snapshot') then 'actor' else 'actor_id' end;
  capability:=case when f.proname='review_map_fields' then 'edit' when f.proname='create_reviewed_release_snapshot' then 'publish' when f.proname='_reconcile_published_baseline' then 'manage' else 'edit' end;
  replacement:=regexp_replace(definition,'exists\(select 1 from admin_users where id\s*=\s*'||actor_name||'\)',format('public.workspace_can(%s,%L)',actor_name,capability),'gi');
  if replacement=definition then raise exception 'Team migration did not find authorization in %',f.proname; end if;
  execute replacement;
 end loop;
end $$;
-- Team members can reuse a verified model already attached to this campus, while pending assets stay personal.
create or replace function public.protect_editable_model_draft() returns trigger language plpgsql set search_path=public as $$
begin
 if new.properties ? 'modelDocument' then raise exception 'Store editable model documents as immutable private assets'; end if;
 if (new.properties ? 'modelDocumentAsset' or (tg_op='UPDATE' and old.properties ? 'modelDocumentAsset')) and coalesce(current_setting('turnright.model_document_version',true),'') <> '1' then raise sqlstate 'PT409' using message='Update the editor before changing this authored model. Local changes are retained.'; end if;
 if new.properties ? 'modelDocumentAsset' and not exists(select 1 from model_assets a where a.campus_id=new.campus_id and a.id::text=new.properties#>>'{modelDocumentAsset,id}' and a.status='ready' and a.version=1 and a.sha256=new.properties#>>'{modelDocumentAsset,sha256}' and a.bytes=(new.properties#>>'{modelDocumentAsset,bytes}')::integer and (a.owner=new.edited_by or workspace_can(new.edited_by,'edit',new.campus_id) and exists(select 1 from map_edits e where e.campus_id=new.campus_id and not e.deleted and e.properties#>>'{modelDocumentAsset,id}'=a.id::text))) then raise exception 'The editable model asset is not verified for this campus'; end if;
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['source_features','map_edits','map_changes','edit_history','reports','jobs','releases','campus_memberships','workspace_audit'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('drop policy if exists admin_read on public.%I',t);
 execute format('create policy campus_member_read on public.%I for select to authenticated using (public.workspace_can(auth.uid(),''read'',campus_id))',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant usage,select on sequence public.workspace_audit_id_seq to service_role;
notify pgrst,'reload schema';
