-- Read-only, bounded map previews. Full proposal records stay in the detail API.
create function public.source_preview_geometry(record jsonb) returns jsonb
language plpgsql immutable set search_path=public,extensions as $$
declare p jsonb:=record->'payload'; shape geometry; simplified boolean:=false;
begin
 if p->'geometry' is not null and p->'geometry'<>'null'::jsonb then
  shape:=st_geomfromgeojson(p->'geometry');
 elsif jsonb_typeof(p->'coordinates')='array' and jsonb_array_length(p->'coordinates')>=2 then
  shape:=st_setsrid(st_makepoint((p#>>'{coordinates,0}')::double precision,(p#>>'{coordinates,1}')::double precision),4326);
 else return null;
 end if;
 if st_isempty(shape) then return null; end if;
 if st_npoints(shape)>80 then
  shape:=st_simplifypreservetopology(shape,0.00001); simplified:=true;
 end if;
 if st_npoints(shape)>80 then shape:=st_envelope(shape); end if;
 return jsonb_build_object('geometry',st_asgeojson(shape,7)::jsonb,'simplified',simplified);
exception when others then return null; -- Bad source geometry must not hide other proposals.
end $$;

create function public.source_review_map(actor uuid,filters jsonb default '{}',page_cursor jsonb default null,as_of timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public set statement_timeout='5s' set lock_timeout='1s' as $$
declare result jsonb; cutoff timestamptz:=coalesce(as_of,clock_timestamp()); total integer;
begin
 if not workspace_can(actor,'read') then raise sqlstate 'PT403' using message='Campus access required'; end if;
 select count(*) into total from map_changes m where m.campus_id=current_campus_id() and m.status='pending'
  and m.created_at<=cutoff and m.review_meta is not null and source_review_matches(m.review_meta,m.kind,m.source_id,filters);
 -- Materialize IDs first: at most 50 proposals are decoded, with at most 80
 -- vertices per before/after shape. Complex shapes fall back to their bounds.
 with selected as materialized (
  select m.id,m.created_at from map_changes m where m.campus_id=current_campus_id() and m.status='pending'
   and m.created_at<=cutoff and m.review_meta is not null and source_review_matches(m.review_meta,m.kind,m.source_id,filters)
   and (page_cursor is null or m.created_at<(page_cursor->>'createdAt')::timestamptz or (m.created_at=(page_cursor->>'createdAt')::timestamptz and m.id>page_cursor->>'id'))
  order by m.created_at desc,m.id limit 51
 ), page as (select * from selected order by created_at desc,id limit 50)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'revision',m.review_revision,'kind',m.kind,
  'name',m.review_meta->>'name','before',source_preview_geometry(m.before),'after',source_preview_geometry(m.after)) order by p.created_at desc,p.id)
  from page p join map_changes m on m.campus_id=current_campus_id() and m.id=p.id),'[]'::jsonb),
  'nextCursor',case when (select count(*) from selected)>50 then (select jsonb_build_object('createdAt',created_at,'id',id) from page order by created_at,id desc limit 1) else null end)
 into result;
 return result||jsonb_build_object('total',total,'asOf',cutoff);
end $$;
revoke all on function public.source_preview_geometry(jsonb),public.source_review_map(uuid,jsonb,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.source_review_map(uuid,jsonb,jsonb,timestamptz) to service_role;
notify pgrst,'reload schema';
