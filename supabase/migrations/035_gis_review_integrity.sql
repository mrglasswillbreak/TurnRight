-- Restoring a release must not hide the authors of work still present in the shared draft.
-- Use the last published ordinary submission as the contribution boundary; restore
-- submissions leave the draft untouched and are deliberately excluded.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('gis_submit_review(uuid,uuid,text)'::regprocedure);
 definition:=replace(definition,
  'select max(published_at) into last_release from releases where campus_id=current_campus_id() and status=''published'';',
  'select max(v.created_at) into last_release from releases release_row join gis_reviews v on v.id=release_row.review_id where release_row.campus_id=current_campus_id() and release_row.status=''published'' and v.restore_release_id is null;');
 execute definition;
end $$;

-- Freeze historical effective geometry, including deletions, authored features,
-- correction overlays, private attribute values, and non-spatial tables.
create or replace function gis_capture_review_features() returns trigger language plpgsql security definer set search_path=public,extensions as $$
begin
 if new.restore_release_id is null then
  insert into gis_review_features select new.campus_id,new.id,dataset_id,feature_key,geometry,properties from gis_feature_index where campus_id=new.campus_id;
 else
  insert into gis_review_features(campus_id,review_id,dataset_id,feature_key,geometry,properties)
  with sources as (
   select case when f->>'entity'='place' then 'place:'||(f#>>'{payload,id}') else (f#>>'{payload,properties,kind}')||':'||(f#>>'{payload,properties,id}') end key,
    f->>'source' source,coalesce(f->'private_attributes','{}') attrs,
    case when f->>'entity'='place' then (f->'payload')||'{"kind":"place"}'::jsonb else f#>'{payload,properties}' end props,
    case when f->>'entity'='place' then jsonb_build_object('type','Point','coordinates',f#>'{payload,coordinates}') else f#>'{payload,geometry}' end geom
   from jsonb_array_elements(new.snapshot->'features') f where f->>'entity' in ('feature','place')
  ), edits as (
   select (e->>'kind')||':'||(e->>'id') key,e from jsonb_array_elements(new.snapshot->'edits') e where e->>'kind' not in ('layer','closure')
  ), effective as (
   select coalesce(s.key,e.key) key,coalesce(s.source,'authored') source,coalesce(s.attrs,'{}') attrs,
    case when e.e#>>'{properties,revertToSource}'='true' then s.props else coalesce(s.props,'{}')||coalesce(e.e->'properties','{}')||jsonb_build_object('kind',split_part(coalesce(s.key,e.key),':',1)) end props,
    case when e.e#>>'{properties,revertToSource}'='true' then s.geom else coalesce(nullif(e.e->'geometry','null'),s.geom) end geom
   from sources s full join edits e using(key) where coalesce((e.e->>'deleted')::boolean,false)=false or e.e#>>'{properties,revertToSource}'='true'
  ), datasets as (
   select *,case when jsonb_array_length(coalesce(new.snapshot->'datasets','[]'))=0 then 'historical' else gis_dataset_key(props,source) end dataset from effective
  )
  select new.campus_id,new.id,d.dataset,d.key,case when d.geom is not null then ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(d.geom),4326)) end,
   d.props||d.attrs||coalesce((select a->'values' from jsonb_array_elements(coalesce(new.snapshot->'attributes','[]')) a where a->>'dataset_id'=d.dataset and a->>'feature_key'=d.key),'{}')
  from datasets d where d.key is not null;
  insert into gis_review_features(campus_id,review_id,dataset_id,feature_key,properties)
   select new.campus_id,new.id,t->>'dataset_id',t->>'feature_key',(t->'values')||coalesce((select a->'values' from jsonb_array_elements(coalesce(new.snapshot->'attributes','[]')) a where a->>'dataset_id'=t->>'dataset_id' and a->>'feature_key'=t->>'feature_key'),'{}')
   from jsonb_array_elements(coalesce(new.snapshot->'tables','[]')) t;
 end if;
 return new;
end $$;

-- Source-attached verified models are reusable on the same terms as edited ones.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('protect_editable_model_draft()'::regprocedure);
 definition:=replace(definition,
  'exists(select 1 from map_edits e where e.campus_id=new.campus_id and not e.deleted and e.properties#>>''{modelDocumentAsset,id}''=a.id::text)',
  '(exists(select 1 from map_edits e where e.campus_id=new.campus_id and not e.deleted and e.properties#>>''{modelDocumentAsset,id}''=a.id::text) or exists(select 1 from source_features s where s.campus_id=new.campus_id and s.payload#>>''{properties,modelDocumentAsset,id}''=a.id::text))');
 execute definition;
end $$;

-- Only verified photographs attached to campus work enter the shared library.
-- Immutable submissions and releases retain attachment rights after a draft
-- removes a feature, so an independent reviewer can still inspect restorations.
alter function gis_asset_attached(text,text) rename to gis_draft_asset_attached;
create function gis_asset_attached(asset text, kind text) returns boolean language sql stable security definer set search_path=public as $$
 select gis_draft_asset_attached(asset,kind) or exists (
  select 1 from (
   select snapshot from gis_reviews where campus_id=current_campus_id()
   union all select snapshot from releases where campus_id=current_campus_id() and status='published'
  ) retained where
  case when kind='model' then
   snapshot @> jsonb_build_object('edits',jsonb_build_array(jsonb_build_object('properties',jsonb_build_object('modelDocumentAsset',jsonb_build_object('id',asset)))))
   or snapshot @> jsonb_build_object('features',jsonb_build_array(jsonb_build_object('payload',jsonb_build_object('properties',jsonb_build_object('modelDocumentAsset',jsonb_build_object('id',asset))))))
  else
   snapshot @> jsonb_build_object('edits',jsonb_build_array(jsonb_build_object('properties',jsonb_build_object('photos',jsonb_build_array(jsonb_build_object('id','owner:'||asset))))))
   or snapshot @> jsonb_build_object('features',jsonb_build_array(jsonb_build_object('payload',jsonb_build_object('properties',jsonb_build_object('photos',jsonb_build_array(jsonb_build_object('id','owner:'||asset)))))))
   or snapshot @> jsonb_build_object('features',jsonb_build_array(jsonb_build_object('entity','meta','payload',jsonb_build_object('photos',jsonb_build_array(jsonb_build_object('id','owner:'||asset))))))
  end
 )
$$;
revoke all on function gis_asset_attached(text,text) from public,anon,authenticated;
grant execute on function gis_asset_attached(text,text) to service_role;
-- Unfinished uploads and original upload metadata remain personal.
create function gis_media_library(actor uuid, search text, page_offset integer) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not workspace_can(actor,'read') then raise sqlstate 'PT403' using message='Campus access required'; end if;
 if page_offset<0 or page_offset>100000 or length(search)>100 then raise exception 'Invalid library page'; end if;
 return (select coalesce(jsonb_agg(item),'[]') from (
  select jsonb_build_object('id',m.id,'owner',m.owner,'status',m.status,'derivative_path',m.derivative_path,'public_metadata',m.public_metadata,
   'original_filename',case when m.owner=actor then m.original_filename end,
   'draft_metadata',case when m.owner=actor then m.draft_metadata end,
   'draft_revision',case when m.owner=actor then m.draft_revision end,
   'authorship_confirmed',case when m.owner=actor then m.authorship_confirmed end) item
  from building_media m where m.campus_id=current_campus_id()
   and (m.owner=actor or m.status='approved' and gis_asset_attached(m.id::text,'photo'))
   and (search='' or m.public_metadata->>'caption' ilike '%'||search||'%' or m.owner=actor and (m.original_filename ilike '%'||search||'%' or m.draft_metadata->>'caption' ilike '%'||search||'%'))
  order by m.created_at desc,m.id desc limit 21 offset page_offset
 ) page);
end $$;
revoke all on function gis_media_library(uuid,text,integer) from public,anon,authenticated;
grant execute on function gis_media_library(uuid,text,integer) to service_role;
notify pgrst,'reload schema';
