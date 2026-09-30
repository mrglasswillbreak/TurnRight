-- Layer/group definitions use the same campus-scoped atomic batches, revisions,
-- undo receipts and immutable release snapshots as feature corrections.
alter table public.map_edits drop constraint map_edits_kind_check;
alter table public.map_edits add constraint map_edits_kind_check
  check(kind in ('place','path','building','entrance','barrier','closure','land','overlay','layer'));
create or replace function public.protect_layer_record() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.kind='layer' then
    if coalesce(current_setting('turnright.layer_version',true),'') <> '1' then
      raise sqlstate 'PT409' using message='Update the editor before saving layer configuration';
    end if;
    if (new.deleted and coalesce(new.properties->>'revertToSource','false') <> 'true') or new.geometry <> '{"type":"GeometryCollection","geometries":[]}'::jsonb
       or new.properties->'layerDefinition'->>'id' is distinct from new.id then
      raise exception 'Invalid layer record; archive instead of deleting';
    end if;
  elsif tg_op='UPDATE' and coalesce(current_setting('turnright.layer_version',true),'') <> '1' then
    -- Older writers may edit a feature but cannot erase its newer layer metadata.
    new.properties := new.properties || (select coalesce(jsonb_object_agg(key,value),'{}'::jsonb)
      from jsonb_each(old.properties) where key in ('mapLayerId','mapLayerSource','layerStyle','derivedSurface','geometryLineage'));
  end if;
  return new;
end $$;
create trigger protect_layer_record before insert or update on public.map_edits
for each row execute function public.protect_layer_record();
create function public.save_editor_layer_batch(operation_id uuid,actor_id uuid,items jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  perform set_config('turnright.layer_version','1',true);
  result := public.save_editor_model_batch(operation_id,actor_id,items);
  if (select count(*) from map_edits where campus_id=current_campus_id() and kind='layer') > 500 then raise exception 'Layer limit exceeded'; end if;
  if exists(select member from map_edits e, jsonb_array_elements_text(e.properties->'layerDefinition'->'members') member
    where e.campus_id=current_campus_id() and e.kind='layer' and not e.deleted group by member having count(*)>1) then raise exception 'Feature belongs to multiple layers'; end if;
  if exists(select 1 from map_edits e where e.campus_id=current_campus_id() and e.kind='layer' and not e.deleted
    and e.properties->'layerDefinition'->>'parentId' is not null and not exists(select 1 from map_edits p where p.campus_id=e.campus_id and p.kind='layer' and not p.deleted and p.id=e.properties->'layerDefinition'->>'parentId' and p.properties->'layerDefinition'->>'role'='group')) then raise exception 'Layer parent must be an existing folder'; end if;
  if exists(with recursive tree as (
    select id,properties->'layerDefinition'->>'parentId' parent,array[id] chain,false cycle from map_edits where campus_id=current_campus_id() and kind='layer' and not deleted
    union all select t.id,e.properties->'layerDefinition'->>'parentId',t.chain||e.id,e.id=any(t.chain) from tree t join map_edits e on e.id=t.parent and e.campus_id=current_campus_id() and e.kind='layer' and not e.deleted where not t.cycle
  ) select 1 from tree where cycle) then raise exception 'Layer folders cannot contain cycles'; end if;
  return result;
end $$;
revoke all on function public.save_editor_layer_batch(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_editor_layer_batch(uuid,uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
