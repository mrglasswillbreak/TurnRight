create function gis_hydrate_editor(actor uuid, keys jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not workspace_can(actor,'read') then raise sqlstate 'PT403' using message='Campus access required'; end if;
 if jsonb_typeof(keys)<>'array' or jsonb_array_length(keys)>500 then raise exception 'Load at most 500 selected features'; end if;
 return jsonb_build_object('features',(select coalesce(jsonb_agg(to_jsonb(s)-'private_attributes'-'gis_feature_key'-'gis_managed'),'[]') from source_features s where campus_id=current_campus_id() and keys ? gis_feature_key),
 'edits',(select coalesce(jsonb_agg(to_jsonb(e)-'gis_managed'),'[]') from map_edits e where campus_id=current_campus_id() and keys ? (kind||':'||id)));
end $$;
-- Large imports keep their geometry and topology private until explicitly selected for release.
alter table source_features drop column gis_managed;
alter table source_features add column gis_managed boolean generated always as (coalesce(payload#>>'{properties,gisManaged}',payload->>'gisManaged','false')='true') stored;
create index source_navigation_subset on source_features(campus_id,id) where not gis_managed;
revoke all on function gis_hydrate_editor(uuid,jsonb) from public,anon,authenticated;
grant execute on function gis_hydrate_editor(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
