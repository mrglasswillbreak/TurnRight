-- Compare individual records instead of sorting and comparing two complete
-- JSONB campus arrays. Keep the same lock, owner guard and rollback snapshot.
create or replace function public.reconcile_published_baseline(actor uuid, published_version text, expected_sources jsonb, records jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare current_sources jsonb; receipt uuid; baseline_matches boolean;
begin
  if not exists(select 1 from admin_users where id=actor) then raise exception 'Administrator required'; end if;
  if jsonb_typeof(records) is distinct from 'array' or jsonb_array_length(records) < 1 or jsonb_array_length(records) > 30000 then raise exception 'Invalid source snapshot'; end if;
  if jsonb_typeof(expected_sources) is distinct from 'array' then raise exception 'Invalid expected source snapshot'; end if;
  if (select count(*) <> count(distinct x.id) from jsonb_to_recordset(records) as x(id text)) then raise exception 'Invalid source snapshot: duplicate key or missing ID'; end if;
  if not exists(select 1 from jsonb_array_elements(records) r where r->>'entity'='meta' and r->'payload'->>'version'=published_version) then raise exception 'Published version mismatch'; end if;
  lock table source_features in share row exclusive mode;
  with expected as materialized (
    select e->>'id' as id, e as record from jsonb_array_elements(expected_sources) e
  )
  select
    (select count(*) = count(distinct id) from expected)
    and (select count(*) from expected) = (select count(*) from source_features)
    and not exists (
      select 1 from expected e left join source_features s on s.id=e.id
      where s.id is null or to_jsonb(s) is distinct from e.record
    ) into baseline_matches;
  if not baseline_matches then raise exception 'Source baseline changed; review it again'; end if;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]'::jsonb) into current_sources from source_features s;
  insert into baseline_reconciliations(actor_id,published_version,before_sources,after_sources)
    values(actor,published_version,current_sources,records) returning id into receipt;
  -- Keep unchanged rows and their timestamps. Rewriting all campus records
  -- needlessly exceeds the API statement budget on small database instances.
  with incoming as materialized (
    select x.id from jsonb_to_recordset(records) as x(id text)
  )
  delete from source_features s
    where s.id in (select e->>'id' from jsonb_array_elements(expected_sources) e)
      and not exists(select 1 from incoming i where i.id=s.id);
  insert into source_features(id,source,entity,payload,hash)
    select x.id,x.source,x.entity,x.payload,x.hash
    from jsonb_to_recordset(records) as x(id text,source text,entity text,payload jsonb,hash text)
    left join source_features s on s.id=x.id
    where s.id is null or (s.source,s.entity,s.payload,s.hash) is distinct from (x.source,x.entity,x.payload,x.hash)
    on conflict(id) do update set source=excluded.source,entity=excluded.entity,payload=excluded.payload,hash=excluded.hash,updated_at=now();
  return receipt;
end; $$;
revoke all on function public.reconcile_published_baseline(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.reconcile_published_baseline(uuid,text,jsonb,jsonb) to service_role;
