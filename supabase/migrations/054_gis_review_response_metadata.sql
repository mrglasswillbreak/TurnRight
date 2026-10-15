-- Return review metadata without materializing the full immutable snapshot.
-- Constructing to_jsonb(review)-'snapshot' needlessly copies large GIS payloads
-- after the current-workspace hash check, increasing peak memory during approval.
-- Keep all authorization, stale-hash and audit guards in the existing functions.
do $$ declare signature text; definition text; metadata text := $meta$jsonb_build_object(
 'campus_id',r.campus_id,'id',r.id,'summary',r.summary,'content_hash',r.content_hash,
 'contributors',r.contributors,'submitted_by',r.submitted_by,'status',r.status,
 'reviewed_by',r.reviewed_by,'reason',r.reason,'created_at',r.created_at,
 'reviewed_at',r.reviewed_at,'restore_release_id',r.restore_release_id)$meta$;
begin
 foreach signature in array array[
  'gis_submit_review(uuid,uuid,text)',
  'gis_submit_restore(uuid,uuid,uuid,text)',
  'gis_decide_review(uuid,uuid,boolean,text,boolean)'
 ] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('to_jsonb(r)-''snapshot''' in definition)=0 then
   raise exception 'Expected review response missing in %',signature;
  end if;
  execute replace(definition,'to_jsonb(r)-''snapshot''',metadata);
 end loop;
end $$;
notify pgrst,'reload schema';
