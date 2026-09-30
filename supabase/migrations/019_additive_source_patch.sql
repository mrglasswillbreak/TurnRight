-- Large campus enrichment sends only changed fields, rather than two full maps
-- through the HTTP gateway. Exact row revisions guard the entire scoped source.
create function public.apply_additive_source_patch(actor uuid, published_version text, expected_sources jsonb, patches jsonb)
returns uuid language plpgsql security definer set search_path=public set statement_timeout='60s' as $$
declare receipt uuid; before_snapshot jsonb; after_snapshot jsonb;
begin
 if not exists(select 1 from admin_users where id=actor) then raise exception 'Administrator required'; end if;
 if jsonb_typeof(expected_sources) is distinct from 'array' or jsonb_typeof(patches) is distinct from 'array'
   or jsonb_array_length(patches) < 1 or jsonb_array_length(patches) > 100000 then raise exception 'Invalid additive patch'; end if;
 if (select count(*) <> count(distinct x.id) from jsonb_to_recordset(patches) x(id text))
   or (select count(*) <> count(distinct x.id) from jsonb_to_recordset(expected_sources) x(id text)) then raise exception 'Duplicate or missing source identity'; end if;
 lock table source_features in share row exclusive mode;
 if exists(
   with expected as materialized (select * from jsonb_to_recordset(expected_sources) x(id text,hash text,updated_at timestamptz,source text,entity text)),
   actual as materialized (select * from source_features where campus_id=current_campus_id())
   select 1 from expected e full join actual s using(id)
   where e.id is null or s.id is null or (e.hash,e.updated_at,e.source,e.entity) is distinct from (s.hash,s.updated_at,s.source,s.entity)
 ) then raise exception 'Source baseline changed; review it again'; end if;
 if exists(
   select 1 from jsonb_to_recordset(patches) x(id text,entity text,source text,hash text,payload jsonb,payload_patch jsonb,properties_patch jsonb)
   left join source_features s on s.campus_id=current_campus_id() and s.id=x.id
   where x.entity is null or x.source is null or x.hash is null
     or (s.id is null and jsonb_typeof(x.payload) is distinct from 'object')
     or (s.id is not null and (x.payload is not null or x.entity is distinct from s.entity))
     or (x.payload_patch is not null and jsonb_typeof(x.payload_patch)<>'object')
     or (x.properties_patch is not null and (x.entity<>'feature' or jsonb_typeof(x.properties_patch)<>'object'))
 ) then raise exception 'Invalid additive record'; end if;
 select jsonb_agg(to_jsonb(s) order by s.id) into before_snapshot from source_features s where s.campus_id=current_campus_id();
 update source_features s set source=x.source,hash=x.hash,
   payload=(s.payload || coalesce(x.payload_patch,'{}'::jsonb)) || case when x.properties_patch is null then '{}'::jsonb else jsonb_build_object('properties',coalesce(s.payload->'properties','{}'::jsonb)||x.properties_patch) end,
   updated_at=clock_timestamp()
 from jsonb_to_recordset(patches) x(id text,source text,hash text,payload_patch jsonb,properties_patch jsonb)
 where s.campus_id=current_campus_id() and s.id=x.id;
 insert into source_features(id,source,entity,payload,hash)
 select x.id,x.source,x.entity,x.payload,x.hash from jsonb_to_recordset(patches) x(id text,source text,entity text,payload jsonb,hash text)
 where not exists(select 1 from source_features s where s.campus_id=current_campus_id() and s.id=x.id);
 if not exists(select 1 from source_features where campus_id=current_campus_id() and entity='meta' and payload->>'version'=published_version) then raise exception 'Published version mismatch'; end if;
 select jsonb_agg(to_jsonb(s) order by s.id) into after_snapshot from source_features s where s.campus_id=current_campus_id();
 insert into baseline_reconciliations(actor_id,published_version,before_sources,after_sources)
 values(actor,published_version,before_snapshot,after_snapshot) returning id into receipt;
 return receipt;
end $$;
revoke all on function public.apply_additive_source_patch(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.apply_additive_source_patch(uuid,text,jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';
