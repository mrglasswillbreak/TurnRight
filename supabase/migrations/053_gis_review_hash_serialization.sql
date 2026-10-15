-- Serialize each ordered row once when checking whether a review is current.
-- The resulting bytes are identical to gis_workspace_snapshot()::text, including
-- JSONB's key ordering and separators. Existing approved hashes remain valid.
-- Keep this serializer and the equivalence tests in sync with snapshot fields.
create function public.gis_workspace_content_hash() returns text language sql stable
security definer set search_path=public as $$
 select encode(sha256(convert_to('{'||string_agg(to_jsonb(k)::text||': '||v,', ' order by octet_length(k),k collate "C")||'}','UTF8')),'hex')
 from (values
  ('features',(select '['||coalesce(string_agg((to_jsonb(f)-'gis_feature_key')::text,', ' order by id),'')||']' from source_features f where campus_id=current_campus_id())),
  ('edits',(select '['||coalesce(string_agg(to_jsonb(e)::text,', ' order by kind,id),'')||']' from map_edits e where campus_id=current_campus_id())),
  ('datasets',(select '['||coalesce(string_agg(to_jsonb(d)::text,', ' order by id),'')||']' from gis_datasets d where campus_id=current_campus_id())),
  ('attributes',(select '['||coalesce(string_agg(to_jsonb(a)::text,', ' order by dataset_id,feature_key),'')||']' from gis_attributes a where campus_id=current_campus_id())),
  ('tables',(select '['||coalesce(string_agg(to_jsonb(t)::text,', ' order by dataset_id,feature_key),'')||']' from gis_table_rows t where campus_id=current_campus_id())),
  ('issues',(select '['||coalesce(string_agg(to_jsonb(q)::text,', ' order by id),'')||']' from gis_issues q where campus_id=current_campus_id())),
  ('views',(select '['||coalesce(string_agg(to_jsonb(v)::text,', ' order by id),'')||']' from gis_views v where campus_id=current_campus_id()))
 ) parts(k,v)
$$;
revoke all on function public.gis_workspace_content_hash() from public,anon,authenticated;
grant execute on function public.gis_workspace_content_hash() to service_role;
do $$ declare signature text; definition text;
begin
 foreach signature in array array[
  'gis_review_details(uuid,uuid)',
  'gis_decide_review(uuid,uuid,boolean,text,boolean)',
  'gis_prepare_release(uuid,uuid,text,text)',
  'gis_assert_release_approval(uuid)'
 ] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('gis_content_hash(gis_workspace_snapshot())' in definition)=0 then
   raise exception 'Expected snapshot hash guard missing in %',signature;
  end if;
  execute replace(definition,'gis_content_hash(gis_workspace_snapshot())','gis_workspace_content_hash()');
 end loop;
end $$;
notify pgrst,'reload schema';
