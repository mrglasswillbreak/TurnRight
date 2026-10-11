-- Resolve routing links without loading a campus graph or expanding inbox pages.
create index source_review_pending_identity on public.map_changes(campus_id,source_id,created_at desc,id) where status='pending';

create function public.source_preview_node(identity text,side text,cutoff timestamptz) returns jsonb
language plpgsql stable set search_path=public as $$
declare record jsonb;
begin
 if identity is null or side not in ('before','after') then return null; end if;
 select case when side='before' then m.before else m.after end into record
 from map_changes m where m.campus_id=current_campus_id() and m.source_id='node:'||identity
  and m.status='pending' and m.created_at<=cutoff order by m.created_at desc,m.id limit 1;
 -- A proposed addition/removal has no node on the absent side. Do not fall
 -- through to a baseline node and invent a before/after location.
 if not found then
  select jsonb_build_object('payload',s.payload) into record from source_features s
   where s.campus_id=current_campus_id() and s.id='node:'||identity and s.entity='node';
 end if;
 return source_preview_geometry(record)->'geometry';
end $$;

create function public.source_preview_record(record jsonb,side text,cutoff timestamptz) returns jsonb
language plpgsql stable set search_path=public as $$
declare direct jsonb; a jsonb; b jsonb;
begin
 direct:=source_preview_geometry(record);
 if direct is not null then return direct; end if;
 if record->>'entity' is distinct from 'edge' then return null; end if;
 a:=source_preview_node(record#>>'{payload,from}',side,cutoff);
 b:=source_preview_node(record#>>'{payload,to}',side,cutoff);
 if a->>'type'<>'Point' or b->>'type'<>'Point' or a is null or b is null then return null; end if;
 return jsonb_build_object('geometry',jsonb_build_object('type','LineString','coordinates',jsonb_build_array(a->'coordinates',b->'coordinates')),'simplified',false);
end $$;

create or replace function public.source_review_map(actor uuid,filters jsonb default '{}',page_cursor jsonb default null,as_of timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public set statement_timeout='5s' set lock_timeout='1s' as $$
declare result jsonb; cutoff timestamptz:=coalesce(as_of,clock_timestamp()); total integer;
begin
 if not workspace_can(actor,'read') then raise sqlstate 'PT403' using message='Campus access required'; end if;
 select count(*) into total from map_changes m where m.campus_id=current_campus_id() and m.status='pending'
  and m.created_at<=cutoff and m.review_meta is not null and source_review_matches(m.review_meta,m.kind,m.source_id,filters);
 -- Each page still decodes at most 50 proposals. A routing link resolves only
 -- its two endpoints through campus-scoped indexed lookups for each side.
 with selected as materialized (
  select m.id,m.created_at from map_changes m where m.campus_id=current_campus_id() and m.status='pending'
   and m.created_at<=cutoff and m.review_meta is not null and source_review_matches(m.review_meta,m.kind,m.source_id,filters)
   and (page_cursor is null or m.created_at<(page_cursor->>'createdAt')::timestamptz or (m.created_at=(page_cursor->>'createdAt')::timestamptz and m.id>page_cursor->>'id'))
  order by m.created_at desc,m.id limit 51
 ), page as (select * from selected order by created_at desc,id limit 50)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'revision',m.review_revision,'kind',m.kind,
  'name',m.review_meta->>'name','before',source_preview_record(m.before,'before',cutoff),'after',source_preview_record(m.after,'after',cutoff)) order by p.created_at desc,p.id)
  from page p join map_changes m on m.campus_id=current_campus_id() and m.id=p.id),'[]'::jsonb),
  'nextCursor',case when (select count(*) from selected)>50 then (select jsonb_build_object('createdAt',created_at,'id',id) from page order by created_at,id desc limit 1) else null end)
 into result;
 return result||jsonb_build_object('total',total,'asOf',cutoff);
end $$;
revoke all on function public.source_preview_node(text,text,timestamptz),public.source_preview_record(jsonb,text,timestamptz) from public,anon,authenticated;
notify pgrst,'reload schema';
