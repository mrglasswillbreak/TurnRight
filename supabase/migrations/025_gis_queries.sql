create function public.gis_match(properties jsonb, filters jsonb) returns boolean language plpgsql immutable as $$
declare f jsonb; v jsonb; wanted jsonb; op text;
begin
 for f in select value from jsonb_array_elements(coalesce(filters,'[]')) loop
 v:=properties->(f->>'field'); wanted:=f->'value'; op:=f->>'operator';
 if not coalesce(case op when 'null' then v is null or v='null'::jsonb when 'eq' then v=wanted when 'ne' then v is distinct from wanted when 'contains' then position(lower(f->>'value') in lower(properties->>(f->>'field')))>0 when 'gt' then jsonb_typeof(v)=jsonb_typeof(wanted) and v>wanted when 'gte' then jsonb_typeof(v)=jsonb_typeof(wanted) and v>=wanted when 'lt' then jsonb_typeof(v)=jsonb_typeof(wanted) and v<wanted when 'lte' then jsonb_typeof(v)=jsonb_typeof(wanted) and v<=wanted else false end,false) then return false; end if;
 end loop; return true;
end $$;
create function public.gis_query(actor uuid, request jsonb) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare d gis_datasets; c jsonb; fingerprint text; sort_field text; descending boolean; page_limit int; row record; features jsonb:='[]'; total bigint; last_key text; last_value jsonb; next_cursor text; geom geometry; box geometry; used int:=0; item jsonb; more boolean:=false;
begin
 if not workspace_can(actor,'read') then raise sqlstate 'PT403' using message='Campus access required'; end if;
 select * into d from gis_datasets where campus_id=current_campus_id() and id=request->>'datasetId' for share;
 if not found then raise sqlstate 'PT404' using message='Dataset not found'; end if;
 if request ? 'revision' and (request->>'revision')::bigint<>d.revision then raise sqlstate 'PT409' using message='Dataset changed. Refresh the query.'; end if;
 page_limit:=least(500,greatest(1,coalesce((request->>'limit')::int,100)));
 fingerprint:=md5((request-'cursor'-'revision'-'limit')::text); sort_field:=request#>>'{sort,field}'; descending:=coalesce(request#>>'{sort,direction}'='desc',false);
 if request ? 'cursor' then c:=convert_from(decode(request->>'cursor','base64'),'UTF8')::jsonb;
 if c->>'query'<>fingerprint or (c->>'revision')::bigint<>d.revision then raise sqlstate 'PT409' using message='The cursor is stale or belongs to another query'; end if; end if;
 if request ? 'bbox' then box:=ST_MakeEnvelope((request#>>'{bbox,0}')::double precision,(request#>>'{bbox,1}')::double precision,(request#>>'{bbox,2}')::double precision,(request#>>'{bbox,3}')::double precision,4326); end if;
 if request ? 'spatial' then geom:=ST_SetSRID(ST_GeomFromGeoJSON(request#>'{spatial,geometry}'),4326); if not ST_IsValid(geom) then raise exception 'Invalid selection geometry'; end if; end if;
 select count(*) into total from gis_feature_index f where f.campus_id=d.campus_id and f.dataset_id=d.id and gis_match(f.properties,request->'filters') and (box is null or f.geometry && box) and (not(request ? 'keys') or request->'keys' ? f.feature_key) and (geom is null or case when request#>>'{spatial,predicate}'='within' then ST_Within(f.geometry,geom) else ST_Intersects(f.geometry,geom) end);
 for row in select f.*,coalesce(f.properties->sort_field,'null'::jsonb) sort_value from gis_feature_index f where f.campus_id=d.campus_id and f.dataset_id=d.id and gis_match(f.properties,request->'filters') and (box is null or f.geometry && box) and (not(request ? 'keys') or request->'keys' ? f.feature_key) and (geom is null or case when request#>>'{spatial,predicate}'='within' then ST_Within(f.geometry,geom) else ST_Intersects(f.geometry,geom) end) and (c is null or (coalesce(f.properties->sort_field,'null'::jsonb)=c->'value' and f.feature_key>c->>'key') or (case when descending then coalesce(f.properties->sort_field,'null'::jsonb)<c->'value' else coalesce(f.properties->sort_field,'null'::jsonb)>c->'value' end)) order by case when not descending then coalesce(f.properties->sort_field,'null'::jsonb) end asc,case when descending then coalesce(f.properties->sort_field,'null'::jsonb) end desc,f.feature_key limit page_limit+1 loop
 item:=jsonb_build_object('type','Feature','id',row.feature_key,'geometry',case when coalesce((request->>'geometry')::boolean,true) then ST_AsGeoJSON(row.geometry)::jsonb else null end,'properties',coalesce((select jsonb_object_agg(key,value) from jsonb_each(row.properties) where (not(request ? 'fields') or request->'fields' ? key) and (d.schema->'fields' @> jsonb_build_array(jsonb_build_object('name',key)) or key in ('id','kind','name','sourceId'))),'{}'));
 if jsonb_array_length(features)>=page_limit or used+octet_length(item::text)>2000000 then more:=true; exit; end if;
 features:=features||jsonb_build_array(item); used:=used+octet_length(item::text); last_key:=row.feature_key; last_value:=row.sort_value;
 end loop;
 if more and last_key is null then raise exception 'This feature exceeds the interactive response limit. Export it for inspection.'; end if;
 if more then next_cursor:=replace(encode(convert_to(jsonb_build_object('key',last_key,'value',last_value,'revision',d.revision,'query',fingerprint)::text,'UTF8'),'base64'),E'
',''); end if;
 return jsonb_build_object('features',features,'revision',d.revision,'nextCursor',next_cursor,'total',total);
end $$;
create function public.gis_validate_values(schema jsonb, vals jsonb) returns void language plpgsql immutable as $$
declare field jsonb; value jsonb; type text;
begin
 for field in select v from jsonb_array_elements(schema->'fields') v loop
 value:=vals->(field->>'name'); type:=field->>'type';
 if value is null or value='null'::jsonb or value='""'::jsonb then
 if coalesce((field->>'required')::boolean,false) then raise exception 'Required field: %',field->>'name'; end if;
 else
 if (type='number' and jsonb_typeof(value)<>'number') or (type='boolean' and jsonb_typeof(value)<>'boolean') or (type in ('text','date') and jsonb_typeof(value)<>'string') then raise exception 'Invalid type for %',field->>'name'; end if;
 if type='date' then perform (vals->>(field->>'name'))::timestamptz; end if;
 if field ? 'domain' and jsonb_array_length(field->'domain')>0 and not(field->'domain' @> jsonb_build_array(value)) then raise exception 'Value outside coded domain: %',field->>'name'; end if;
 end if;
 end loop;
end $$;
create function public.gis_save_dataset(actor uuid, dataset jsonb, expected_revision bigint, operation_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare d gis_datasets; previous gis_operations; request jsonb; f record;
begin
 if not workspace_can(actor,'edit') then raise sqlstate 'PT403' using message='Editing permission required'; end if;
 request:=jsonb_build_object('dataset',dataset,'revision',expected_revision);
 perform pg_advisory_xact_lock(hashtext('gis-operation:'||current_campus_id()||operation_id::text));
 select * into previous from gis_operations where campus_id=current_campus_id() and id=operation_id;
 if found then if previous.actor<>actor or previous.request<>request then raise sqlstate 'PT409' using message='Operation identity already used'; end if; return previous.result; end if;
 select * into d from gis_datasets where campus_id=current_campus_id() and id=dataset->>'id' for update;
 if not found or d.revision<>expected_revision then raise sqlstate 'PT409' using message='Dataset changed. Reload before saving.'; end if;
 for f in select properties from gis_feature_index where campus_id=d.campus_id and dataset_id=d.id loop perform gis_validate_values(dataset->'schema',f.properties); end loop;
 update gis_datasets set name=dataset->>'name',schema=dataset->'schema',source_crs=dataset->>'source_crs',analysis_crs=dataset->>'analysis_crs',style=dataset->'style',included=(dataset->>'included')::boolean,saved_filters=coalesce(dataset->'saved_filters','[]'),revision=revision+1 where campus_id=d.campus_id and id=d.id returning * into d;
 insert into gis_operations values(d.campus_id,operation_id,actor,request,to_jsonb(d));
 insert into workspace_audit(campus_id,actor,action,subject,details) values(d.campus_id,actor,'dataset-save',d.id,jsonb_build_object('operationId',operation_id,'revision',d.revision));
 return to_jsonb(d);
end $$;
create function public.gis_save_attributes(actor uuid, dataset text, expected_revision bigint, operation_id uuid, items jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare d gis_datasets; item jsonb; current jsonb; previous gis_operations; request jsonb; result jsonb; name text;
begin
 if not workspace_can(actor,'edit') then raise sqlstate 'PT403' using message='Editing permission required'; end if;
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items) not between 1 and 500 then raise exception 'Use an atomic batch of 1–500 features'; end if;
 request:=jsonb_build_object('dataset',dataset,'revision',expected_revision,'items',items);
 perform pg_advisory_xact_lock(hashtext('gis-operation:'||current_campus_id()||operation_id::text));
 select * into previous from gis_operations where campus_id=current_campus_id() and id=operation_id;
 if found then if previous.actor<>actor or previous.request<>request then raise sqlstate 'PT409' using message='Operation identity already used'; end if; return previous.result; end if;
 select * into d from gis_datasets where campus_id=current_campus_id() and id=dataset for update;
 if not found or d.revision<>expected_revision then raise sqlstate 'PT409' using message='Dataset changed. Reload before saving.'; end if;
 for item in select value from jsonb_array_elements(items) loop
 select properties into current from gis_feature_index where campus_id=d.campus_id and dataset_id=d.id and feature_key=item->>'key';
 if not found then raise exception 'Feature not found in this dataset'; end if;
 if jsonb_typeof(item->'values')<>'object' then raise exception 'Invalid values'; end if;
 for name in select jsonb_object_keys(item->'values') loop if not(d.schema->'fields' @> jsonb_build_array(jsonb_build_object('name',name))) then raise exception 'Unknown field: %',name; end if; end loop;
 perform gis_validate_values(d.schema,current||(item->'values'));
 insert into gis_attributes(campus_id,dataset_id,feature_key,values,actor) values(d.campus_id,d.id,item->>'key',item->'values',actor) on conflict(campus_id,dataset_id,feature_key) do update set values=gis_attributes.values||excluded.values,actor=excluded.actor;
 update gis_feature_index set properties=properties||(item->'values') where campus_id=d.campus_id and dataset_id=d.id and feature_key=item->>'key';
 end loop;
 update gis_datasets set revision=revision+1 where campus_id=d.campus_id and id=d.id returning revision into expected_revision;
 result:=jsonb_build_object('revision',expected_revision);
 insert into gis_operations values(d.campus_id,operation_id,actor,request,result);
 insert into workspace_audit(campus_id,actor,action,subject,details) values(d.campus_id,actor,'attribute-save',d.id,jsonb_build_object('operationId',operation_id,'items',items));
 return result;
end $$;
create function public.gis_statistics(actor uuid, request jsonb) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare d gis_datasets; result jsonb;
begin
 if not workspace_can(actor,'read') then raise sqlstate 'PT403' using message='Campus access required'; end if;
 select * into d from gis_datasets where campus_id=current_campus_id() and id=request->>'datasetId' for share;
 if not found or d.revision<>(request->>'revision')::bigint then raise sqlstate 'PT409' using message='Dataset changed'; end if;
 select jsonb_build_object('count',count(*),'nulls',count(*) filter(where properties->(request->>'field') is null or properties->(request->>'field')='null'::jsonb),'min',min(v),'max',max(v),'sum',sum(v),'average',avg(v)) into result from (select properties,case when jsonb_typeof(properties->(request->>'field'))='number' then (properties->>(request->>'field'))::numeric end v from gis_feature_index where campus_id=d.campus_id and dataset_id=d.id and gis_match(properties,request->'filters') and (not(request ? 'keys') or request->'keys' ? feature_key) and (not(request ? 'bbox') or geometry && ST_MakeEnvelope((request#>>'{bbox,0}')::float,(request#>>'{bbox,1}')::float,(request#>>'{bbox,2}')::float,(request#>>'{bbox,3}')::float,4326)) and (not(request ? 'spatial') or case when request#>>'{spatial,predicate}'='within' then ST_Within(geometry,ST_SetSRID(ST_GeomFromGeoJSON(request#>'{spatial,geometry}'),4326)) else ST_Intersects(geometry,ST_SetSRID(ST_GeomFromGeoJSON(request#>'{spatial,geometry}'),4326)) end)) f;
 return result;
end $$;
revoke all on function public.gis_query(uuid,jsonb),public.gis_statistics(uuid,jsonb),public.gis_save_dataset(uuid,jsonb,bigint,uuid),public.gis_save_attributes(uuid,text,bigint,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.gis_query(uuid,jsonb),public.gis_statistics(uuid,jsonb),public.gis_save_dataset(uuid,jsonb,bigint,uuid),public.gis_save_attributes(uuid,text,bigint,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
