-- Match the typed client contract at the transactional boundary as well.
create or replace function gis_validate_values(schema jsonb, vals jsonb) returns void language plpgsql immutable as $$
declare field jsonb; value jsonb; kind text; text_value text;
begin
 for field in select v from jsonb_array_elements(schema->'fields') v loop
  value:=vals->(field->>'name'); kind:=field->>'type'; text_value:=vals->>(field->>'name');
  if value is null or value='null'::jsonb or (kind='text' and value='""'::jsonb) then
   if coalesce((field->>'required')::boolean,false) then raise exception 'Required field: %',field->>'name'; end if;
  else
   if (kind='number' and jsonb_typeof(value)<>'number') or (kind='boolean' and jsonb_typeof(value)<>'boolean') or (kind in ('text','date') and jsonb_typeof(value)<>'string') then raise exception 'Invalid type for %',field->>'name'; end if;
   if kind='text' and length(text_value)>10000 then raise exception 'Text exceeds 10,000 characters: %',field->>'name'; end if;
   if kind='date' then
    if text_value !~ '^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z)?$' or not pg_input_is_valid(text_value,'timestamp with time zone') then raise exception 'Use an ISO calendar date or UTC timestamp: %',field->>'name'; end if;
    if to_char(text_value::timestamptz at time zone 'UTC','YYYY-MM-DD')<>left(text_value,10) then raise exception 'Invalid calendar date: %',field->>'name'; end if;
   end if;
   if field ? 'domain' and jsonb_array_length(field->'domain')>0 and not(field->'domain' @> jsonb_build_array(value)) then raise exception 'Value outside coded domain: %',field->>'name'; end if;
  end if;
 end loop;
end $$;

-- Partial source acceptance changes the draft and contributes to its submission.
-- Keep its existing conflict checks and record attribution in the same transaction.
alter function review_map_fields(text,jsonb,jsonb,jsonb,jsonb,uuid) rename to _review_map_fields;
create function review_map_fields(change_id text, expected_before jsonb, expected_after jsonb, reviewed_record jsonb, selected_fields jsonb, actor_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform _review_map_fields(change_id,expected_before,expected_after,reviewed_record,selected_fields,actor_id);
 insert into workspace_audit(campus_id,actor,action,subject,details) values(current_campus_id(),actor_id,'source-review',change_id,jsonb_build_object('fields',selected_fields));
end $$;
revoke all on function review_map_fields(text,jsonb,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function review_map_fields(text,jsonb,jsonb,jsonb,jsonb,uuid) to service_role;

-- Verified model assets retained by an immutable submission can also be reused.
create or replace function protect_editable_model_draft() returns trigger language plpgsql set search_path=public as $$
begin
 if new.properties ? 'modelDocument' then raise exception 'Store editable model documents as immutable private assets'; end if;
 if (new.properties ? 'modelDocumentAsset' or (tg_op='UPDATE' and old.properties ? 'modelDocumentAsset')) and coalesce(current_setting('turnright.model_document_version',true),'') <> '1' then raise sqlstate 'PT409' using message='Update the editor before changing this authored model. Local changes are retained.'; end if;
 if new.properties ? 'modelDocumentAsset' and not exists(select 1 from model_assets a where a.campus_id=new.campus_id and a.id::text=new.properties#>>'{modelDocumentAsset,id}' and a.status='ready' and a.version=1 and a.sha256=new.properties#>>'{modelDocumentAsset,sha256}' and a.bytes=(new.properties#>>'{modelDocumentAsset,bytes}')::integer and (a.owner=new.edited_by or workspace_can(new.edited_by,'edit',new.campus_id) and gis_asset_attached(a.id::text,'model'))) then raise exception 'The editable model asset is not verified for this campus'; end if;
 return new;
end $$;
notify pgrst,'reload schema';
