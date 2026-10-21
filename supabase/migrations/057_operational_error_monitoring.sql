-- Private, bounded operational metadata. No user content, URLs or exception text.
create table public.operational_errors (
 fingerprint text primary key check (fingerprint ~ '^[a-f0-9]{32}$'),
 event text not null check (event in ('admin-request-failed','worker-failed','monitoring-probe')),
 component text not null check (component in ('api','gis','map-import','source-review','source-check')),
 dependency text not null check (dependency in ('unknown','database','authentication','storage','github','worker')),
 status integer not null check (status between 200 and 599),
 revision text not null check (revision='unknown' or revision ~ '^[a-f0-9]{40}$'),
 first_seen timestamptz not null default now(),
 last_seen timestamptz not null default now(),
 occurrences integer not null default 1 check (occurrences between 1 and 1000000),
 window_started timestamptz not null default now(),
 window_count integer not null default 1 check (window_count between 1 and 1000000),
 last_reference uuid,
 resolved_at timestamptz
);
create index operational_errors_last_seen on public.operational_errors(last_seen);
alter table public.operational_errors enable row level security;
revoke all on public.operational_errors from public, anon, authenticated;
grant select,insert,update,delete on public.operational_errors to service_role;

create function public.record_operational_error(p_event jsonb)
returns text language plpgsql security definer set search_path=public set statement_timeout='2s' as $$
declare identity text; kind text; component_name text; dependency_name text;
 code integer; revision_name text; reference_id uuid; observed_at timestamptz;
begin
 if jsonb_typeof(p_event) is distinct from 'object' or octet_length(p_event::text)>1024
   or exists(select 1 from jsonb_object_keys(p_event) k where k not in ('event','component','dependency','status','revision','reference'))
 then raise sqlstate 'PT400' using message='Invalid monitoring envelope'; end if;
 kind:=p_event->>'event'; component_name:=p_event->>'component';
 dependency_name:=coalesce(p_event->>'dependency','unknown');
 revision_name:=coalesce(p_event->>'revision','unknown');
 if kind is null or kind not in ('admin-request-failed','worker-failed','monitoring-probe')
   or component_name is null or component_name not in ('api','gis','map-import','source-review','source-check')
   or dependency_name not in ('unknown','database','authentication','storage','github','worker')
   or (revision_name<>'unknown' and revision_name !~ '^[a-f0-9]{40}$')
   or coalesce(p_event->>'status','') !~ '^[2-5][0-9]{2}$'
 then raise sqlstate 'PT400' using message='Invalid monitoring fields'; end if;
 code:=(p_event->>'status')::integer;
 if (kind<>'monitoring-probe' and code<500) or (kind='monitoring-probe' and code<>200)
 then raise sqlstate 'PT400' using message='Only failures or explicit probes are recorded'; end if;
 if p_event->>'reference' is not null then
   if p_event->>'reference' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
   then raise sqlstate 'PT400' using message='Invalid monitoring reference'; end if;
   reference_id:=(p_event->>'reference')::uuid;
 end if;
 identity:=md5(concat_ws(':',kind,component_name,dependency_name,code::text,revision_name));
 perform pg_advisory_xact_lock(hashtext('turnright-operational-errors'));
 observed_at:=clock_timestamp();
 delete from operational_errors where last_seen < observed_at-interval '30 days';
 if not exists(select 1 from operational_errors where fingerprint=identity)
   and (select count(*) from operational_errors)>=1000 then
   delete from operational_errors where fingerprint=(select fingerprint from operational_errors order by last_seen,fingerprint limit 1);
 end if;
 insert into operational_errors(fingerprint,event,component,dependency,status,revision,last_reference,first_seen,last_seen,window_started)
 values(identity,kind,component_name,dependency_name,code,revision_name,reference_id,observed_at,observed_at,observed_at)
 on conflict(fingerprint) do update set
   -- Strictly advance even for repeated calls in one transaction or clock corrections.
   last_seen=greatest(excluded.last_seen,operational_errors.last_seen+interval '1 microsecond'),
   occurrences=least(operational_errors.occurrences+1,1000000),
   window_started=case when operational_errors.window_started<observed_at-interval '5 minutes' then observed_at else operational_errors.window_started end,
   window_count=case when operational_errors.window_started<observed_at-interval '5 minutes' then 1 else least(operational_errors.window_count+1,1000000) end,
   last_reference=coalesce(excluded.last_reference,operational_errors.last_reference), resolved_at=null;
 return identity;
end $$;

create function public.operational_error_summary()
returns jsonb language sql security definer set search_path=public set statement_timeout='2s' as $$
 select jsonb_build_object('schemaVersion',1,'checkedAt',now(),'retentionDays',30,
 'groups',coalesce((select jsonb_agg(to_jsonb(g)) from (
   select fingerprint,event,component,dependency,status,revision,first_seen,last_seen,occurrences,last_reference,resolved_at,
     case when window_started>=now()-interval '5 minutes' then window_count else 0 end as recent_count
   from operational_errors where last_seen>=now()-interval '30 days'
   order by (resolved_at is null) desc,last_seen desc,fingerprint limit 100
 ) g),'[]'::jsonb));
$$;

create function public.resolve_operational_error(p_fingerprint text,p_last_seen timestamptz)
returns boolean language sql security definer set search_path=public set statement_timeout='2s' as $$
 with changed as (update operational_errors set resolved_at=now()
   where fingerprint=p_fingerprint and last_seen=p_last_seen and resolved_at is null returning 1)
 select exists(select 1 from changed);
$$;

create function public.prune_operational_errors()
returns integer language plpgsql security definer set search_path=public set statement_timeout='2s' as $$
declare removed integer;
begin
 delete from operational_errors where last_seen<now()-interval '30 days';
 get diagnostics removed=row_count;
 return removed;
end $$;
revoke all on function public.record_operational_error(jsonb), public.operational_error_summary(), public.resolve_operational_error(text,timestamptz), public.prune_operational_errors() from public,anon,authenticated;
grant execute on function public.record_operational_error(jsonb), public.operational_error_summary(), public.resolve_operational_error(text,timestamptz), public.prune_operational_errors() to service_role;
notify pgrst,'reload schema';
