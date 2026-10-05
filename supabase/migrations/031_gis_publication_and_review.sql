create table gis_publication_leases(campus_id text primary key references campuses(id),release_id uuid not null references releases(id),token uuid not null,expires_at timestamptz not null);
alter table gis_publication_leases enable row level security;
grant all on gis_publication_leases to service_role;
create or replace function gis_lock_workspace() returns trigger language plpgsql security definer set search_path=public as $$
declare campus text:=coalesce(new.campus_id,old.campus_id);
begin
 perform pg_advisory_xact_lock(hashtext('gis-workspace:'||campus));
 if exists(select 1 from gis_publication_leases where campus_id=campus and expires_at>now()) then raise sqlstate 'PT409' using message='An approved release is being promoted. Retry this edit when publication finishes; your local changes are retained.'; end if;
 return coalesce(new,old);
end $$;
create function gis_begin_publication(release_identity uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare publisher uuid; token uuid:=gen_random_uuid();
begin
 perform pg_advisory_xact_lock(hashtext('gis-workspace:'||current_campus_id()));
 perform gis_assert_release_approval(release_identity);
 select actor into publisher from workspace_audit where campus_id=current_campus_id() and subject=release_identity::text and action='release-prepare' order by id desc limit 1;
 if not workspace_can(publisher,'publish') then raise sqlstate 'PT403' using message='The preparing publisher no longer has permission'; end if;
 if exists(select 1 from gis_publication_leases where campus_id=current_campus_id() and expires_at>now()) then raise sqlstate 'PT409' using message='Another promotion is active'; end if;
 insert into gis_publication_leases values(current_campus_id(),release_identity,token,now()+interval '25 minutes') on conflict(campus_id) do update set release_id=excluded.release_id,token=excluded.token,expires_at=excluded.expires_at;
 insert into workspace_audit(campus_id,actor,action,subject) values(current_campus_id(),publisher,'publication-start',release_identity::text);
 return token;
end $$;
create function gis_end_publication(release_identity uuid, lease_token uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 delete from gis_publication_leases where campus_id=current_campus_id() and release_id=release_identity and token=lease_token;
end $$;
create or replace function gis_guard_publication() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='published' and old.status is distinct from new.status then
  perform gis_assert_release_approval(new.id);
  if not exists(select 1 from gis_publication_leases where campus_id=new.campus_id and release_id=new.id and expires_at>now()) then raise sqlstate 'PT409' using message='Publication lease expired'; end if;
  insert into workspace_audit(campus_id,actor,action,subject,details) select new.campus_id,actor,'publication-complete',new.id::text,jsonb_build_object('reviewId',new.review_id,'version',new.version) from workspace_audit where campus_id=new.campus_id and subject=new.id::text and action='release-prepare' order by id desc limit 1;
 end if;
 return new;
end $$;
-- Snapshot queries let reviewers inspect every feature without downloading the entire submission.
create table gis_review_features(
 campus_id text not null references campuses(id),review_id uuid not null references gis_reviews(id),dataset_id text not null,feature_key text not null,
 geometry extensions.geometry(Geometry,4326),properties jsonb not null,primary key(review_id,feature_key)
);
create index gis_review_dataset on gis_review_features(review_id,dataset_id,feature_key);
alter table gis_review_features enable row level security;
grant all on gis_review_features to service_role;
create function gis_capture_review_features() returns trigger language plpgsql security definer set search_path=public,extensions as $$
begin
 if new.restore_release_id is null then
 insert into gis_review_features select new.campus_id,new.id,dataset_id,feature_key,geometry,properties from gis_feature_index where campus_id=new.campus_id;
 else
 insert into gis_review_features(campus_id,review_id,dataset_id,feature_key,geometry,properties)
 select new.campus_id,new.id,'historical',f#>>'{payload,properties,kind}'||':'||(f#>>'{payload,properties,id}'),ST_SetSRID(ST_GeomFromGeoJSON(f#>'{payload,geometry}'),4326),f#>'{payload,properties}' from jsonb_array_elements(new.snapshot->'features') f where f->>'entity'='feature' and f#>'{payload,geometry}' is not null and f#>>'{payload,properties,id}' is not null;
 end if;
 return new;
end $$;
create trigger capture_review_features after insert on gis_reviews for each row execute function gis_capture_review_features();
create function gis_review_query(actor uuid, review_identity uuid, dataset text, after_key text default '') returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare features jsonb; last_key text; total bigint;
begin
 if not workspace_can(actor,'read') then raise sqlstate 'PT403' using message='Campus access required'; end if;
 if not exists(select 1 from gis_reviews where campus_id=current_campus_id() and id=review_identity) then raise sqlstate 'PT404' using message='Submission not found'; end if;
 select count(*) into total from gis_review_features where review_id=review_identity and dataset_id=dataset;
 select coalesce(jsonb_agg(jsonb_build_object('type','Feature','id',feature_key,'geometry',ST_AsGeoJSON(geometry)::jsonb,'properties',properties) order by feature_key),'[]'),max(feature_key) into features,last_key from (select * from gis_review_features where review_id=review_identity and dataset_id=dataset and feature_key>after_key order by feature_key limit 100) f;
 if octet_length(features::text)>2000000 then raise exception 'Review page exceeds 2 MB; inspect a smaller output dataset'; end if;
 return jsonb_build_object('features',features,'total',total,'nextKey',case when exists(select 1 from gis_review_features where review_id=review_identity and dataset_id=dataset and feature_key>last_key) then last_key else null end);
end $$;
create function gis_survey_attached(revision_identity uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from map_edits where campus_id=current_campus_id() and not deleted and properties#>>'{surveyEvidence,revisionId}'=revision_identity::text)
 or exists(select 1 from source_features where campus_id=current_campus_id() and payload#>>'{properties,surveyEvidence,revisionId}'=revision_identity::text)
$$;
revoke all on function gis_begin_publication(uuid),gis_end_publication(uuid,uuid),gis_review_query(uuid,uuid,text,text),gis_survey_attached(uuid) from public,anon,authenticated;
grant execute on function gis_begin_publication(uuid),gis_end_publication(uuid,uuid),gis_review_query(uuid,uuid,text,text),gis_survey_attached(uuid) to service_role;
notify pgrst,'reload schema';
