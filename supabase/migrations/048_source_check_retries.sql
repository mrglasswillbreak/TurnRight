-- Evidence is frozen per run so a lost response or resumed worker repeats the
-- exact staged comparison. A fresh verification always gets a new run identity.
create function source_check_evidence(run_id uuid,run_token uuid,records jsonb) returns void
language plpgsql security definer set search_path=public set statement_timeout='10s' as $$
declare r source_check_runs;
begin
 select * into r from source_check_runs where id=run_id and campus_id=current_campus_id() and token=run_token and status='staging' for update;
 if not found then raise exception 'Check cancelled or replaced'; end if;
 if r.import_id is not null and not exists(select 1 from campus_imports i where i.id=r.import_id and i.run_token=r.token and i.status in ('running','preview') and (i.requested_by is null or workspace_can(i.requested_by,'edit'))) then raise exception 'Import cancelled, replaced, or permission revoked'; end if;
 if jsonb_array_length(records) not between 1 and 100 or octet_length(records::text)>524288 then raise exception 'Verification evidence exceeds its limit'; end if;
 insert into source_verification_evidence select r.id,v->>'identity',v->'value' from jsonb_array_elements(records) v on conflict do nothing;
 if exists(select 1 from jsonb_array_elements(records) v join source_verification_evidence e on e.run_id=r.id and e.identity=v->>'identity' where e.value<>v->'value') then raise exception 'Verification evidence changed on retry'; end if;
 update source_check_runs set updated_at=now() where id=r.id;
end $$;
create function source_check_interrupted(run_id uuid,run_token uuid,reason text) returns void
language plpgsql security definer set search_path=public set statement_timeout='10s' as $$
begin
 update source_check_runs set status='failed',diagnostics=jsonb_build_array(jsonb_build_object('classification','interrupted','message',left(reason,1000),'retryable',true)),updated_at=now()
 where id=run_id and campus_id=current_campus_id() and token=run_token and status='staging';
end $$;
-- A refreshed verification invalidates previously frozen selections even if
-- the visible before/after source content has not changed.
create function source_group_revision_changed() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if (new.eligible,new.verification,new.blocking_reasons) is distinct from (old.eligible,old.verification,old.blocking_reasons) then
  update map_changes set review_revision=review_revision+1 where campus_id=new.campus_id and id=new.id and status='pending';
 end if;
 return new;
end $$;
create trigger source_group_revision after update on source_proposal_groups for each row execute function source_group_revision_changed();
-- Preserve the initiating user's identity on connected checks. Scheduled checks
-- are service-owned; all interactive checks revalidate current campus permission.
alter function queue_source_check(uuid,uuid) rename to _queue_source_check;
revoke all on function _queue_source_check(uuid,uuid) from public,anon,authenticated,service_role;
create function queue_source_check(actor uuid,source_identity uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 result:=_queue_source_check(actor,source_identity);
 if (result->>'created')::boolean then update campus_imports set requested_by=actor where id=(result#>>'{job,id}')::uuid and campus_id=current_campus_id(); end if;
 return result;
end $$;
revoke all on function source_check_evidence(uuid,uuid,jsonb),source_check_interrupted(uuid,uuid,text),queue_source_check(uuid,uuid) from public,anon,authenticated;
grant execute on function source_check_evidence(uuid,uuid,jsonb),source_check_interrupted(uuid,uuid,text),queue_source_check(uuid,uuid) to service_role;
create function source_group_detail(actor uuid,group_identity text,page_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=public set statement_timeout='10s' as $$
declare g source_proposal_groups; result jsonb;
begin
 if not workspace_can(actor,'read') then raise sqlstate 'PT403' using message='Campus access required'; end if;
 if page_offset<0 or page_offset>300000 then raise exception 'Invalid dependency page'; end if;
 select * into g from source_proposal_groups where campus_id=current_campus_id() and id=group_identity;
 if not found then raise exception 'Source group not found'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.record_id,'entity',coalesce(m.after_record,m.before_record)->>'entity','kind',case when m.before_record is null then 'add' when m.after_record is null then 'remove' else 'modify' end,'beforeHash',m.before_record->>'hash','afterHash',m.after_record->>'hash','editorOverride',exists(select 1 from map_edits e where e.campus_id=g.campus_id and (e.id=m.record_id or e.id=regexp_replace(m.record_id,'^[^:]+:',''))))),'[]') into result from (select * from source_group_members where campus_id=g.campus_id and group_id=g.id order by record_id limit 50 offset page_offset) m;
 return jsonb_build_object('members',result,'total',g.member_count,'nextOffset',case when page_offset+50<g.member_count then page_offset+50 else null end,'evidence',g.features,'checkId',g.run_id);
end $$;
revoke all on function source_group_detail(uuid,text,integer) from public,anon,authenticated;
grant execute on function source_group_detail(uuid,text,integer) to service_role;
-- Old workers used direct REST superseding. They cannot retire new groups or
-- rewrite their reviewed revisions outside the guarded finalizer/decision RPCs.
create function source_proposal_write_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare grouped boolean; finalizing boolean;
begin
 finalizing:=exists(select 1 from source_check_runs where id::text=current_setting('turnright.source_finalization',true) and campus_id=old.campus_id and status='staging');
 grouped:=exists(select 1 from source_proposal_groups where campus_id=old.campus_id and id=old.id);
 if tg_op='DELETE' then
  if grouped then raise exception 'Source group history must be retained'; end if;
  return old;
 end if;
 if new.status='superseded' and new.status is distinct from old.status and not finalizing then raise exception 'Only a verified source finalizer can supersede proposals'; end if;
 if grouped and (new.before,new.after,new.base_hash,new.kind,new.status) is distinct from (old.before,old.after,old.base_hash,old.kind,old.status)
  and not finalizing and current_setting('turnright.source_decision',true) is distinct from old.id then raise exception 'Source groups require a guarded decision'; end if;
 return new;
end $$;
create trigger source_proposal_guard before update or delete on map_changes for each row execute function source_proposal_write_guard();
-- New single-item and descriptive-field clients must freeze the revision they
-- actually displayed. Old endpoints cannot silently accept refreshed groups.
create function team_review_source(actor uuid,change_identity text,accept boolean,expected_revision bigint) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not workspace_can(actor,'edit') then raise sqlstate 'PT403' using message='Editing permission required'; end if;
 perform pg_advisory_xact_lock(hashtext('turnright-source-review:'||current_campus_id()));
 if expected_revision is null or not exists(select 1 from map_changes where campus_id=current_campus_id() and id=change_identity and review_revision=expected_revision and status='pending') then raise sqlstate 'PT409' using message='Source review revision changed; reopen the comparison'; end if;
 perform set_config('turnright.reviewed_revision',jsonb_build_array(change_identity,expected_revision)::text,true);
 perform team_review_source(actor,change_identity,accept);
end $$;
create function review_map_fields(change_id text,expected_before jsonb,expected_after jsonb,reviewed_record jsonb,selected_fields jsonb,actor_id uuid,expected_revision bigint) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not workspace_can(actor_id,'edit') then raise sqlstate 'PT403' using message='Editing permission required'; end if;
 perform pg_advisory_xact_lock(hashtext('turnright-source-review:'||current_campus_id()));
 if expected_revision is null or not exists(select 1 from map_changes where campus_id=current_campus_id() and id=change_id and review_revision=expected_revision and status='pending') then raise sqlstate 'PT409' using message='Source review revision changed; reopen the comparison'; end if;
 perform set_config('turnright.reviewed_revision',jsonb_build_array(change_id,expected_revision)::text,true);
 perform review_map_fields(change_id,expected_before,expected_after,reviewed_record,selected_fields,actor_id);
end $$;
-- The bulk worker already stores an immutable selected revision for every item.
do $$ begin execute replace(pg_get_functiondef('source_review_step(uuid,uuid)'::regprocedure),'team_review_source(op.actor,item.change_id,op.accept)','team_review_source(op.actor,item.change_id,op.accept,item.revision)'); end $$;
revoke all on function team_review_source(uuid,text,boolean,bigint),review_map_fields(text,jsonb,jsonb,jsonb,jsonb,uuid,bigint) from public,anon,authenticated;
grant execute on function team_review_source(uuid,text,boolean,bigint),review_map_fields(text,jsonb,jsonb,jsonb,jsonb,uuid,bigint) to service_role;
notify pgrst,'reload schema';
