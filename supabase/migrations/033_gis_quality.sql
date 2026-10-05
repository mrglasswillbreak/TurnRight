create function gis_quality(actor uuid) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare result jsonb:='[]'; row record; message text; field jsonb; v jsonb;
begin
 if not workspace_can(actor,'read') then raise sqlstate 'PT403' using message='Campus access required'; end if;
 for row in select i.feature_key,i.geometry,i.properties,d.schema from gis_feature_index i join gis_datasets d on d.campus_id=i.campus_id and d.id=i.dataset_id where i.campus_id=current_campus_id() order by i.feature_key loop
 message:=null;
 if row.geometry is not null and not ST_IsValid(row.geometry) then message:=ST_IsValidReason(row.geometry); end if;
 if message is null then
  for field in select value from jsonb_array_elements(row.schema->'fields') loop
   v:=row.properties->(field->>'name');
   if coalesce((field->>'required')::boolean,false) and (v is null or v in ('null'::jsonb,'""'::jsonb)) then message:='Required field: '||(field->>'name'); exit; end if;
   if v is not null and v<>'null'::jsonb and (
    (field->>'type'='number' and jsonb_typeof(v)<>'number') or (field->>'type'='boolean' and jsonb_typeof(v)<>'boolean') or (field->>'type' in ('text','date') and jsonb_typeof(v)<>'string') or
    (field->>'type'='date' and not pg_input_is_valid(row.properties->>(field->>'name'),'timestamptz')) or
    (field ? 'domain' and jsonb_array_length(field->'domain')>0 and not(field->'domain' @> jsonb_build_array(v)))
   ) then message:='Invalid value for '||(field->>'name'); exit; end if;
  end loop;
 end if;
 if message is not null then result:=result||jsonb_build_array(jsonb_build_object('id','validation:'||row.feature_key,'feature_key',row.feature_key,'coordinates',case when row.geometry is not null then ST_AsGeoJSON(ST_PointOnSurface(row.geometry))::jsonb->'coordinates' else null end,'severity','error','code','dataset-validation','message',message,'status','open','comments','[]'::jsonb,'evidence','[]'::jsonb,'revision',0)); end if;
 exit when jsonb_array_length(result)>=500;
 end loop;
 for row in select c.id,c.summary,s.gis_feature_key from map_changes c left join source_features s on s.campus_id=c.campus_id and s.id=c.source_id where c.campus_id=current_campus_id() and c.status='pending' and c.base_hash is distinct from s.hash order by c.created_at limit 100 loop
  result:=result||jsonb_build_array(jsonb_build_object('id','source-conflict:'||row.id,'feature_key',row.gis_feature_key,'severity','warning','code','source-conflict','message',row.summary||': source baseline changed; inspect the source review queue','status','open','comments','[]'::jsonb,'evidence','[]'::jsonb,'revision',0));
 end loop;
 return result;
end $$;
revoke all on function gis_quality(uuid) from public,anon,authenticated;
grant execute on function gis_quality(uuid) to service_role;
notify pgrst,'reload schema';
