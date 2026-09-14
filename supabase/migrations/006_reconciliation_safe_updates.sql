-- Keep Supabase's safe-update guard enabled and replace only the reviewed source IDs.
create or replace function public.reconcile_published_baseline(actor uuid, published_version text, expected_sources jsonb, records jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare current_sources jsonb; receipt uuid;
begin
  if not exists(select 1 from admin_users where id=actor) then raise exception 'Administrator required'; end if;
  if jsonb_typeof(records) <> 'array' or jsonb_array_length(records) < 1 or jsonb_array_length(records) > 30000 then raise exception 'Invalid source snapshot'; end if;
  if not exists(select 1 from jsonb_array_elements(records) r where r->>'entity'='meta' and r->'payload'->>'version'=published_version) then raise exception 'Published version mismatch'; end if;
  lock table source_features in share row exclusive mode;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]'::jsonb) into current_sources from source_features s;
  if current_sources is distinct from (select coalesce(jsonb_agg(e order by e->>'id'),'[]'::jsonb) from jsonb_array_elements(expected_sources) e) then raise exception 'Source baseline changed; review it again'; end if;
  insert into baseline_reconciliations(actor_id,published_version,before_sources,after_sources)
    values(actor,published_version,current_sources,records) returning id into receipt;
  delete from source_features
    where id in (select e->>'id' from jsonb_array_elements(expected_sources) e);
  insert into source_features(id,source,entity,payload,hash)
    select x.id,x.source,x.entity,x.payload,x.hash from jsonb_to_recordset(records) as x(id text,source text,entity text,payload jsonb,hash text);
  return receipt;
end; $$;
revoke all on function public.reconcile_published_baseline(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.reconcile_published_baseline(uuid,text,jsonb,jsonb) to service_role;
