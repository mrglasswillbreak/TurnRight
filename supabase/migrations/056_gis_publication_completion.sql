-- PostgREST hoists the called RPC's budget, not a nested trigger's setting.
-- Complete the guarded publication without returning its entire large snapshot.
alter function public.gis_begin_publication(uuid) set statement_timeout='60s';
create function public.gis_complete_publication(
 release_identity uuid, lease_token uuid, deployment_identity text, deployment_origin text
) returns jsonb language plpgsql security definer
set search_path=public set statement_timeout='60s' as $$
declare r releases;
begin
 perform pg_advisory_xact_lock(hashtext('gis-workspace:'||current_campus_id()));
 select * into r from releases where campus_id=current_campus_id() and id=release_identity for update;
 if not found or r.status not in ('preview','published')
    or r.deployment_id is distinct from deployment_identity
    or deployment_origin is null or length(deployment_origin)>500
    or deployment_origin !~ '^https://[a-zA-Z0-9-]+[.]vercel[.]app$'
 then raise sqlstate 'PT409' using message='Verified production deployment required'; end if;
 if not exists(select 1 from gis_publication_leases where campus_id=current_campus_id()
   and release_id=release_identity and token=lease_token and expires_at>now())
 then raise sqlstate 'PT409' using message='Publication lease expired or mismatched'; end if;
 if r.status='published' then
  if r.deployment_url is distinct from deployment_origin then
   raise sqlstate 'PT409' using message='Published deployment differs';
  end if;
 else
  -- gis_guard_publication still verifies the exact approved snapshot, current
  -- workspace, reviewer access and lease and appends the completion audit.
  update releases set status='published',deployment_url=deployment_origin,
    published_at=now(),error=null where campus_id=current_campus_id() and id=release_identity;
 end if;
 return jsonb_build_object('id',r.id,'status','published','version',r.version,
   'deployment_id',deployment_identity,'deployment_url',deployment_origin);
end $$;
revoke all on function public.gis_complete_publication(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.gis_complete_publication(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
