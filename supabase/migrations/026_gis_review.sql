create table public.gis_reviews (
 campus_id text not null references campuses(id), id uuid primary key, summary text not null,
 content_hash text not null, snapshot jsonb not null, contributors uuid[] not null,
 submitted_by uuid not null references auth.users(id), status text not null default 'submitted' check(status in ('submitted','approved','changes-requested')),
 reviewed_by uuid references auth.users(id), reason text, created_at timestamptz not null default now(), reviewed_at timestamptz
);
create table public.gis_issues (
 campus_id text not null references campuses(id), id text not null, feature_key text, coordinates jsonb,
 severity text not null check(severity in ('error','warning')), code text not null, message text not null,
 status text not null default 'open' check(status in ('open','resolved','accepted')), assigned_to uuid references auth.users(id),
 comments jsonb not null default '[]', evidence jsonb not null default '[]', revision bigint not null default 1,
 primary key(campus_id,id)
);
alter table public.releases add column review_id uuid references gis_reviews(id);
create function public.gis_workspace_snapshot() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
 'features',(select coalesce(jsonb_agg(to_jsonb(f)-'gis_feature_key' order by id),'[]') from source_features f where campus_id=current_campus_id()),
 'edits',(select coalesce(jsonb_agg(to_jsonb(e) order by kind,id),'[]') from map_edits e where campus_id=current_campus_id()),
 'datasets',(select coalesce(jsonb_agg(to_jsonb(d) order by id),'[]') from gis_datasets d where campus_id=current_campus_id()),
 'attributes',(select coalesce(jsonb_agg(to_jsonb(a) order by dataset_id,feature_key),'[]') from gis_attributes a where campus_id=current_campus_id()))
$$;
create function public.gis_content_hash(snapshot jsonb) returns text language sql immutable as $$ select encode(sha256(convert_to(snapshot::text,'UTF8')),'hex') $$;
create function public.gis_protect_review() returns trigger language plpgsql as $$
begin
 if (to_jsonb(new)-'status'-'reviewed_by'-'reason'-'reviewed_at') is distinct from (to_jsonb(old)-'status'-'reviewed_by'-'reason'-'reviewed_at') then raise exception 'Review snapshots are immutable'; end if;
 return new;
end $$;
create trigger immutable_gis_review before update on public.gis_reviews for each row execute function public.gis_protect_review();
create function public.gis_submit_review(actor uuid, operation_id uuid, summary text) returns jsonb language plpgsql security definer set search_path=public,extensions set statement_timeout='60s' as $$
declare snapshot jsonb; contributors uuid[]; r gis_reviews; last_release timestamptz; f record;
begin
 if not workspace_can(actor,'edit') then raise sqlstate 'PT403' using message='Editor permission required'; end if;
 perform pg_advisory_xact_lock(hashtext('review:'||current_campus_id()));
 select * into r from gis_reviews where id=operation_id;
 if found then if r.campus_id<>current_campus_id() or r.submitted_by<>actor or r.summary<>summary then raise sqlstate 'PT409' using message='Review identity already used'; end if; return to_jsonb(r)-'snapshot'; end if;
 if length(trim(summary)) not between 5 and 500 then raise exception 'Use a review summary of 5–500 characters'; end if;
 -- The snapshot and its validations are read under one transaction snapshot; concurrent changes make it stale.
 if exists(select 1 from gis_issues where campus_id=current_campus_id() and severity='error' and status<>'resolved') then raise exception 'Resolve blocking quality issues before submission'; end if;
 if exists(select 1 from gis_feature_index where campus_id=current_campus_id() and geometry is not null and not ST_IsValid(geometry)) then raise exception 'Repair invalid dataset geometry before submission'; end if;
 for f in select d.schema,i.properties from gis_datasets d join gis_feature_index i on i.campus_id=d.campus_id and i.dataset_id=d.id where d.campus_id=current_campus_id() loop perform gis_validate_values(f.schema,f.properties); end loop;
 snapshot:=gis_workspace_snapshot();
 select max(published_at) into last_release from releases where campus_id=current_campus_id() and status='published';
 select coalesce(array_agg(distinct a),'{}') into contributors from (
 select e.actor a from edit_history e where e.campus_id=current_campus_id() and e.created_at>coalesce(last_release,'epoch')
 union select w.actor from workspace_audit w where w.campus_id=current_campus_id() and w.created_at>coalesce(last_release,'epoch') and w.action in ('dataset-save','attribute-save','job-apply','source-review','csv-import')
 union select actor
 ) authors where a is not null;
 insert into gis_reviews(campus_id,id,summary,content_hash,snapshot,contributors,submitted_by) values(current_campus_id(),operation_id,summary,gis_content_hash(snapshot),snapshot,contributors,actor) returning * into r;
 insert into workspace_audit(campus_id,actor,action,subject,details) values(current_campus_id(),actor,'review-submit',r.id::text,jsonb_build_object('hash',r.content_hash));
 return to_jsonb(r)-'snapshot';
end $$;
create function public.gis_decide_review(actor uuid, review_identity uuid, approve boolean, reason text, owner_override boolean default false) returns jsonb language plpgsql security definer set search_path=public as $$
declare r gis_reviews;
begin
 if not workspace_can(actor,'review') then raise sqlstate 'PT403' using message='Review permission required'; end if;
 select * into r from gis_reviews where campus_id=current_campus_id() and id=review_identity for update;
 if not found or r.status<>'submitted' then raise sqlstate 'PT409' using message='Submission is no longer awaiting review'; end if;
 if length(trim(reason)) not between 5 and 1000 then raise exception 'Record a review reason of 5–1000 characters'; end if;
 if owner_override and not exists(select 1 from admin_users where id=actor) then raise sqlstate 'PT403' using message='Only the original owner can override independent review'; end if;
 if approve and actor=any(r.contributors) and not owner_override then raise sqlstate 'PT403' using message='A contributor cannot approve their own changes'; end if;
 if approve and r.content_hash<>gis_content_hash(gis_workspace_snapshot()) then raise sqlstate 'PT409' using message='Workspace changed. Submit a fresh snapshot.'; end if;
 update gis_reviews set status=case when approve then 'approved' else 'changes-requested' end,reviewed_by=actor,reason=gis_decide_review.reason,reviewed_at=now() where id=r.id returning * into r;
 insert into workspace_audit(campus_id,actor,action,subject,details) values(current_campus_id(),actor,case when owner_override then 'review-owner-override' else 'review-decision' end,r.id::text,jsonb_build_object('approve',approve,'reason',reason,'hash',r.content_hash));
 return to_jsonb(r)-'snapshot';
end $$;
create function public.gis_prepare_release(actor uuid, review_identity uuid, catalogue_hash text, release_summary text) returns uuid language plpgsql security definer set search_path=public set statement_timeout='60s' as $$
declare r gis_reviews; release_identity uuid;
begin
 if not workspace_can(actor,'publish') then raise sqlstate 'PT403' using message='Publisher permission required'; end if;
 perform pg_advisory_xact_lock(hashtext('turnright-release:'||current_campus_id()));
 select * into r from gis_reviews where campus_id=current_campus_id() and id=review_identity and status='approved' for share;
 if not found or r.content_hash<>gis_content_hash(gis_workspace_snapshot()) then raise sqlstate 'PT409' using message='An approval of the current workspace is required'; end if;
 if not workspace_can(r.reviewed_by,'review') then raise sqlstate 'PT403' using message='The approving reviewer no longer has access'; end if;
 if exists(select 1 from releases where campus_id=current_campus_id() and status in ('queued','building')) then raise exception 'A release is already being built'; end if;
 insert into releases(summary,snapshot,catalogue_revision,review_id) values(release_summary,r.snapshot,catalogue_hash,r.id) returning id into release_identity;
 insert into workspace_audit(campus_id,actor,action,subject,details) values(current_campus_id(),actor,'release-prepare',release_identity::text,jsonb_build_object('reviewId',r.id,'hash',r.content_hash));
 return release_identity;
end $$;
create function public.gis_assert_release_approval(release_identity uuid) returns void language plpgsql security definer set search_path=public as $$
declare r releases; review gis_reviews;
begin
 select * into r from releases where campus_id=current_campus_id() and id=release_identity;
 select * into review from gis_reviews where id=r.review_id and campus_id=current_campus_id();
 if review.id is null or review.status<>'approved' or gis_content_hash(r.snapshot)<>review.content_hash or not workspace_can(review.reviewed_by,'review') then raise sqlstate 'PT409' using message='This release requires an approved snapshot'; end if;
 if r.restored_from is null and review.content_hash<>gis_content_hash(gis_workspace_snapshot()) then raise sqlstate 'PT409' using message='The approved snapshot is stale'; end if;
end $$;
-- Every production promotion, including direct workflow dispatch, is checked in the database.
create function public.gis_guard_publication() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='published' and old.status is distinct from new.status then perform gis_assert_release_approval(new.id); end if;
 return new;
end $$;
create trigger gis_publication_approval before update on public.releases for each row execute function public.gis_guard_publication();
do $$ declare t text; begin foreach t in array array['gis_reviews','gis_issues'] loop execute format('alter table public.%I enable row level security',t); execute format('grant all on public.%I to service_role',t); end loop; end $$;
revoke all on function public.gis_workspace_snapshot(),public.gis_submit_review(uuid,uuid,text),public.gis_decide_review(uuid,uuid,boolean,text,boolean),public.gis_prepare_release(uuid,uuid,text,text),public.gis_assert_release_approval(uuid) from public,anon,authenticated;
grant execute on function public.gis_workspace_snapshot(),public.gis_submit_review(uuid,uuid,text),public.gis_decide_review(uuid,uuid,boolean,text,boolean),public.gis_prepare_release(uuid,uuid,text,text),public.gis_assert_release_approval(uuid) to service_role;
notify pgrst,'reload schema';
