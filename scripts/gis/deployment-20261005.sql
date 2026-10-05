-- One-time, exact-bundle transport. Install through the authenticated SQL editor.
-- This is not an application migration; remove the function after its receipt is verified.
create function public.turnright_apply_gis_20261005(p_bundle jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_catalog
set statement_timeout='180s' set lock_timeout='5s' as $deploy$
declare actual text; item jsonb; t text; differences bigint; n bigint; receipt jsonb; counts jsonb:='{}';
begin
 if jsonb_typeof(p_bundle)<>'array' or jsonb_array_length(p_bundle)<>15 then raise exception 'Invalid migration bundle'; end if;
 select encode(sha256(convert_to(string_agg(value->>'sql',E'\n' order by value->>'name'),'UTF8')),'hex') into actual from jsonb_array_elements(p_bundle);
 if actual<>'2e6bd6b35c0b2631f74c4be80ff692b139e06e929521d78dfcd9f21e3b2a69d7' then raise exception 'Migration bundle hash mismatch'; end if;
 if to_regclass('public.gis_datasets') is not null or to_regnamespace('turnright_gis_20261005') is not null then raise exception 'Inspect existing migration state before retrying'; end if;
 lock table public.source_features,public.map_edits,public.campus_sources,public.releases,public.campuses,public.admin_users in access exclusive mode;
 if exists(select 1 from campus_imports where status in ('queued','inspecting','previewing')) or exists(select 1 from releases where status in ('queued','building','publishing')) then raise exception 'Pause active import/release jobs before migrating'; end if;
 create schema turnright_gis_20261005;
 revoke all on schema turnright_gis_20261005 from public,anon,authenticated,service_role;
 foreach t in array array['source_features','map_edits','campus_sources','releases','campuses','admin_users'] loop
  execute format('create table turnright_gis_20261005.%I as table public.%I',t,t);
  execute format('select count(*) from turnright_gis_20261005.%I',t) into n;
  counts:=counts||jsonb_build_object(t,n);
 end loop;
 create table turnright_gis_20261005.functions as select p.oid::regprocedure::text identity,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.proname<>'turnright_apply_gis_20261005' and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e');
 for item in select value from jsonb_array_elements(p_bundle) order by value->>'name' loop execute item->>'sql'; end loop;
 foreach t in array array['source_features','map_edits','campus_sources','releases','campuses','admin_users'] loop
  execute format('select count(*) from ((select to_jsonb(x)-array[''gis_managed'',''gis_feature_key'',''private_attributes'',''gis_metadata'',''review_id''] from public.%I x except select to_jsonb(x) from turnright_gis_20261005.%I x) union all (select to_jsonb(x) from turnright_gis_20261005.%I x except select to_jsonb(x)-array[''gis_managed'',''gis_feature_key'',''private_attributes'',''gis_metadata'',''review_id''] from public.%I x)) delta',t,t,t,t) into differences;
  if differences<>0 then raise exception 'Original records changed in %',t; end if;
 end loop;
 receipt:=jsonb_build_object('appliedAt',now(),'bundleSha256',actual,'migrations',(select jsonb_agg(value->>'name' order by value->>'name') from jsonb_array_elements(p_bundle)),'preservedOriginalRows',counts,'originalContentDifferences',0,'memberships',(select count(*) from campus_memberships),'datasets',(select count(*) from gis_datasets),'indexedFeatures',(select count(*) from gis_feature_index),'backupSchema','turnright_gis_20261005');
 create table turnright_gis_20261005.receipt(data jsonb not null);
 insert into turnright_gis_20261005.receipt values(receipt);
 revoke all on all tables in schema turnright_gis_20261005 from public,anon,authenticated,service_role;
 revoke all on function public.turnright_apply_gis_20261005(jsonb) from service_role;
 return receipt;
end $deploy$;
revoke all on function public.turnright_apply_gis_20261005(jsonb) from public,anon,authenticated;
grant execute on function public.turnright_apply_gis_20261005(jsonb) to service_role;
notify pgrst,'reload schema';
