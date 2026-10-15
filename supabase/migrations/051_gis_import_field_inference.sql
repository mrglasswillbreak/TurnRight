-- Untyped metadata (GeoJSON, GeoParquet and OSM) must retain value inference.
-- Preserve explicit source declarations and schemas already configured by a team.
create or replace function gis_source_metadata() returns trigger language plpgsql security definer set search_path=public as $$
declare dataset text; fields jsonb; current_fields jsonb; inferred jsonb; field jsonb; kind text; name text; definition jsonb; configured boolean;
begin
 if new.gis_feature_key is null then return new; end if;
 select dataset_id into dataset from gis_feature_index where campus_id=new.campus_id and feature_key=new.gis_feature_key;
 select schema->'fields',coalesce((provenance->>'schemaConfigured')::boolean,false) into current_fields,configured from gis_datasets where campus_id=new.campus_id and id=dataset;
 if current_fields is null then return new; end if;
 fields:=current_fields;
 inferred:=gis_infer_schema(new.private_attributes)->'fields';
 for field in select value from jsonb_array_elements(inferred) loop
  if not exists(select 1 from jsonb_array_elements(fields) f where f->>'name'=field->>'name') then fields:=fields||jsonb_build_array(field); end if;
 end loop;
 for field in select value from jsonb_array_elements(coalesce(new.gis_metadata->'fields','[]')) loop
  name:=field->>'name';
  if name !~ '^[A-Za-z_][A-Za-z0-9_]{0,62}$' or name in ('__proto__','constructor','prototype') then continue; end if;
  if configured and exists(select 1 from jsonb_array_elements(current_fields) f where f->>'name'=name) then continue; end if;
  kind:=case
   when lower(field->>'type') ~ '^(u?int[0-9]*(:[0-9]+)?|integer[0-9]*|smallint|bigint|real|double( precision)?|float[0-9]*|decimal.*|numeric.*|number|esrifieldtype(oid|smallinteger|integer|biginteger|single|double))$' then 'number'
   when lower(field->>'type') ~ '(bool)' then 'boolean'
   when lower(field->>'type') ~ '(date|time)' then 'date'
   when lower(field->>'type') ~ '(string|text|char|guid|globalid)' then 'text'
   else coalesce((select f->>'type' from jsonb_array_elements(inferred) f where f->>'name'=name),
                 (select f->>'type' from jsonb_array_elements(fields) f where f->>'name'=name),'text')
  end;
  select coalesce(jsonb_agg(f order by ord),'[]') into fields from jsonb_array_elements(fields) with ordinality x(f,ord) where f->>'name'<>name;
  definition:=jsonb_build_object('name',name,'alias',left(coalesce(field->>'alias',name),160),'type',kind,'public',false);
  fields:=fields||jsonb_build_array(definition);
 end loop;
 if jsonb_array_length(fields)>100 then raise exception 'Dataset exceeds 100 typed fields; choose a smaller field set'; end if;
 update gis_datasets set schema=jsonb_build_object('version',1,'fields',fields),source_crs=coalesce(new.gis_metadata->>'sourceCRS',source_crs),
  provenance=provenance||case when new.gis_metadata<>'{}' then jsonb_build_object('importMetadata',new.gis_metadata) else '{}' end
 where campus_id=new.campus_id and id=dataset and (fields<>current_fields or new.gis_metadata<>'{}');
 return new;
end $$;
notify pgrst,'reload schema';
