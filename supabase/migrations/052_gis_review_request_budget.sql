-- Review inspection and decisions hash the same complete snapshot as submission.
-- Give these RPCs the same bounded budget; the default API budget was shorter
-- than the measured 9.2-second LASU inspection even on a healthy database.
-- Permissions, immutable hashes and independent-review checks are unchanged.
create or replace function public.gis_review_details(actor uuid, review_identity uuid) returns jsonb
language plpgsql security definer set search_path=public set statement_timeout='60s' as $$
declare r gis_reviews;
begin
 if not workspace_can(actor,'read') then raise sqlstate 'PT403' using message='Campus access required'; end if;
 select * into r from gis_reviews where campus_id=current_campus_id() and id=review_identity;
 if not found then raise sqlstate 'PT404' using message='Submission not found'; end if;
 -- Build the small metadata object directly instead of serializing and then
 -- discarding the entire source snapshot just to display its review header.
 return jsonb_build_object(
  'campus_id',r.campus_id,'id',r.id,'summary',r.summary,'content_hash',r.content_hash,
  'contributors',r.contributors,'submitted_by',r.submitted_by,'status',r.status,
  'reviewed_by',r.reviewed_by,'reason',r.reason,'created_at',r.created_at,
  'reviewed_at',r.reviewed_at,'restore_release_id',r.restore_release_id,
  'datasets',r.snapshot->'datasets',
  'edits',coalesce((select jsonb_agg(e) from (select value e from jsonb_array_elements(r.snapshot->'edits') limit 500) q),'[]'),
  'editCount',jsonb_array_length(r.snapshot->'edits'),
  'sourceCount',jsonb_array_length(r.snapshot->'features'),
  'current',r.content_hash=gis_content_hash(gis_workspace_snapshot()));
end $$;
alter function public.gis_decide_review(uuid,uuid,boolean,text,boolean) set statement_timeout='60s';
alter function public.gis_assert_release_approval(uuid) set statement_timeout='60s';
notify pgrst,'reload schema';
