-- Apply before deploying the 2D/3D editor. All mutations remain service-role only.
create table public.editor_operations (
  id uuid primary key,
  actor uuid not null references auth.users(id),
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.editor_operations enable row level security;
revoke all on public.editor_operations from anon, authenticated;
grant all on public.editor_operations to service_role;

create or replace function public.save_editor_batch(operation_id uuid, actor_id uuid, items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare item jsonb; edit jsonb; previous map_edits; saved map_edits;
  receipt editor_operations; results jsonb := '[]'::jsonb;
begin
  if not exists(select 1 from admin_users where id = actor_id) then raise exception 'Editor access required'; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) < 1 or jsonb_array_length(items) > 500 then raise exception 'Invalid edit batch'; end if;
  -- The editor has one owner. A common lock also covers concurrent inserts and retries.
  perform pg_advisory_xact_lock(hashtext('turnright-editor'));
  select * into receipt from editor_operations where id = operation_id;
  if found then
    if receipt.actor <> actor_id or receipt.request is distinct from items then raise exception 'Operation ID reused with different edits'; end if;
    return receipt.result;
  end if;
  if (select count(*) from jsonb_array_elements(items)) <> (select count(distinct (x->'edit'->>'kind',x->'edit'->>'id')) from jsonb_array_elements(items) x) then raise exception 'Duplicate edit in batch'; end if;
  for item in select * from jsonb_array_elements(items) loop
    edit := item->'edit';
    select * into previous from map_edits where id=edit->>'id' and kind=edit->>'kind' for update;
    if previous.updated_at is distinct from (item->>'expectedUpdatedAt')::timestamptz then
      raise sqlstate 'PT409' using message = 'This draft changed in another session. Your local work is preserved; review the conflict before retrying.';
    end if;
    insert into map_edits(id,kind,geometry,properties,deleted,edited_by,updated_at)
      values(edit->>'id',edit->>'kind',edit->'geometry',edit->'properties',coalesce((edit->>'deleted')::boolean,false),actor_id,clock_timestamp())
      on conflict(id,kind) do update set geometry=excluded.geometry,properties=excluded.properties,deleted=excluded.deleted,edited_by=excluded.edited_by,updated_at=excluded.updated_at
      returning * into saved;
    results := results || jsonb_build_array(to_jsonb(saved));
  end loop;
  insert into editor_operations(id,actor,request,result) values(operation_id,actor_id,items,results);
  return results;
end $$;
revoke all on function public.save_editor_batch(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_editor_batch(uuid,uuid,jsonb) to service_role;
