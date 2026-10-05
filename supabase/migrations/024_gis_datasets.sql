-- Spatial index is derived from approved sources, correction overlays and private typed attributes.
alter table public.source_features add column private_attributes jsonb not null default '{}';
alter table public.source_features add column gis_feature_key text generated always as
(case when entity='feature' then (payload#>>'{properties,kind}')||':'||(payload#>>'{properties,id}') when entity='place' then 'place:'||(payload->>'id') end) stored;
create index source_gis_identity on public.source_features(campus_id,gis_feature_key);
create table public.gis_datasets (
 campus_id text not null references campuses(id), id text not null, name text not null,
 schema jsonb not null default '{"version":1,"fields":[]}', source_crs text not null default 'EPSG:4326', analysis_crs text not null default 'EPSG:32631',
 provenance jsonb not null default '{}', style jsonb not null default '{"mode":"single","color":"#1764ed"}', included boolean not null default false,
 revision bigint not null default 1, saved_filters jsonb not null default '[]', primary key(campus_id,id)
);
create table public.gis_attributes (campus_id text not null, dataset_id text not null, feature_key text not null, values jsonb not null default '{}', actor uuid not null references auth.users(id), primary key(campus_id,dataset_id,feature_key), foreign key(campus_id,dataset_id) references gis_datasets(campus_id,id));
create table public.gis_feature_index (campus_id text not null, dataset_id text not null, feature_key text not null, geometry extensions.geometry(Geometry,4326), properties jsonb not null, source_hash text, primary key(campus_id,feature_key), foreign key(campus_id,dataset_id) references gis_datasets(campus_id,id));
create index gis_geometry on public.gis_feature_index using gist(geometry);
create index gis_dataset_features on public.gis_feature_index(campus_id,dataset_id,feature_key);
create index gis_feature_properties on public.gis_feature_index using gin(properties jsonb_path_ops);
create table public.gis_operations (campus_id text not null references campuses(id), id uuid not null, actor uuid not null, request jsonb not null, result jsonb not null, primary key(campus_id,id));
create function public.gis_dataset_key(properties jsonb, source text) returns text language sql immutable as $$ select coalesce(properties->>'mapLayerId','dataset:'||md5(jsonb_build_array(source,coalesce(properties->>'importLayer',properties->>'kind','features'))::text)) $$;
create function public.gis_infer_schema(attrs jsonb) returns jsonb language sql immutable as $$
 select jsonb_build_object('version',1,'fields',coalesce(jsonb_agg(jsonb_build_object('name',key,'type',case jsonb_typeof(value) when 'number' then 'number' when 'boolean' then 'boolean' else 'text' end,'public',false) order by key),'[]')) from (select * from jsonb_each(attrs) where key ~ '^[A-Za-z_][A-Za-z0-9_]{0,62}$' and key not in ('__proto__','constructor','prototype') and jsonb_typeof(value) in ('string','number','boolean','null') order by key limit 100) a
$$;
create function public.gis_sync_feature(campus text, feature text) returns void language plpgsql security definer set search_path=public,extensions as $$
declare source source_features; edit map_edits; props jsonb; geom jsonb; dataset text; previous_dataset text; attrs jsonb; bounds jsonb; crs text;
begin
 select * into source from source_features where campus_id=campus and gis_feature_key=feature limit 1;
 select * into edit from map_edits where campus_id=campus and kind=split_part(feature,':',1) and id=substr(feature,strpos(feature,':')+1);
 select dataset_id into previous_dataset from gis_feature_index where campus_id=campus and feature_key=feature;
 if edit.properties->>'revertToSource'='true' then edit:=null; end if;
 if (source.id is null and edit.id is null) or coalesce(edit.deleted,false) then
   delete from gis_feature_index where campus_id=campus and feature_key=feature;
   update gis_datasets set revision=revision+1 where campus_id=campus and id=previous_dataset;
   return;
 end if;
 props:=case when source.entity='place' then source.payload||'{"kind":"place"}'::jsonb else coalesce(source.payload->'properties','{}') end || coalesce(edit.properties,'{}');
 props:=props||jsonb_build_object('id',substr(feature,strpos(feature,':')+1),'kind',split_part(feature,':',1));
 geom:=coalesce(edit.geometry,case when source.entity='place' then jsonb_build_object('type','Point','coordinates',source.payload->'coordinates') else source.payload->'geometry' end);
 if geom is null or geom->>'type'='GeometryCollection' and geom->'geometries'='[]'::jsonb then return; end if;
 dataset:=gis_dataset_key(props,coalesce(source.source,'authored'));
 attrs:=coalesce(source.private_attributes,'{}');
 select c.bounds into bounds from campuses c where c.id=campus;
 crs:='EPSG:'||(case when ((bounds#>>'{0,1}')::numeric+(bounds#>>'{1,1}')::numeric)/2<0 then 32700 else 32600 end+greatest(1,least(60,floor(((((bounds#>>'{0,0}')::numeric+(bounds#>>'{1,0}')::numeric)/2)+180)/6)::int+1)))::text;
 insert into gis_datasets(campus_id,id,name,schema,analysis_crs,provenance) values(campus,dataset,coalesce(props->>'importLayer',props->>'kind','Features'),gis_infer_schema(attrs||jsonb_build_object('name',props->>'name')),crs,jsonb_build_object('source',source.source)) on conflict do nothing;
 select attrs||coalesce(a.values,'{}') into attrs from (select 1) dummy left join gis_attributes a on a.campus_id=campus and a.dataset_id=dataset and a.feature_key=feature;
 insert into gis_feature_index(campus_id,dataset_id,feature_key,geometry,properties,source_hash) values(campus,dataset,feature,ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(geom),4326)),props||attrs,source.hash)
 on conflict(campus_id,feature_key) do update set dataset_id=excluded.dataset_id,geometry=excluded.geometry,properties=excluded.properties,source_hash=excluded.source_hash;
 update gis_datasets set revision=revision+1 where campus_id=campus and id in (dataset,previous_dataset);
end $$;
create function public.gis_source_index_trigger() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op<>'INSERT' and old.gis_feature_key is not null then perform gis_sync_feature(old.campus_id,old.gis_feature_key); end if;
 if tg_op<>'DELETE' and new.gis_feature_key is not null and (tg_op='INSERT' or new.gis_feature_key is distinct from old.gis_feature_key) then perform gis_sync_feature(new.campus_id,new.gis_feature_key); end if;
 return coalesce(new,old);
end $$;
create trigger gis_sources_changed after insert or update or delete on public.source_features for each row execute function public.gis_source_index_trigger();
create function public.gis_edit_index_trigger() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if coalesce(new.kind,old.kind) not in ('layer','closure') then perform gis_sync_feature(coalesce(new.campus_id,old.campus_id),coalesce(new.kind,old.kind)||':'||coalesce(new.id,old.id)); end if;
 return coalesce(new,old);
end $$;
create trigger gis_edits_changed after insert or update or delete on public.map_edits for each row execute function public.gis_edit_index_trigger();
create function public.gis_import_attributes() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='accepted' and old.status is distinct from new.status and new.kind<>'remove' and new.after ? 'private_attributes' then update source_features set private_attributes=new.after->'private_attributes' where campus_id=new.campus_id and id=new.source_id; end if;
 return new;
end $$;
create trigger gis_import_attributes_accepted after update on public.map_changes for each row execute function public.gis_import_attributes();
create function public.gis_rebuild_index(campus text) returns bigint language plpgsql security definer set search_path=public as $$
declare feature text; n bigint:=0;
begin
 perform pg_advisory_xact_lock(hashtext('gis-index:'||campus));
 delete from gis_feature_index where campus_id=campus;
 for feature in select gis_feature_key from source_features where campus_id=campus and gis_feature_key is not null union select kind||':'||id from map_edits where campus_id=campus and kind not in ('layer','closure') loop perform gis_sync_feature(campus,feature); n:=n+1; end loop;
 return n;
end $$;
-- Bounded backfill can also be repeated by the migration verification job.
do $$ declare campus text; begin for campus in select id from campuses loop perform gis_rebuild_index(campus); end loop; end $$;
do $$ declare t text; begin foreach t in array array['gis_datasets','gis_attributes','gis_feature_index','gis_operations'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('grant all on public.%I to service_role',t);
 end loop; end $$;
revoke all on function public.gis_sync_feature(text,text), public.gis_rebuild_index(text) from public,anon,authenticated;
grant execute on function public.gis_rebuild_index(text) to service_role;
notify pgrst,'reload schema';
