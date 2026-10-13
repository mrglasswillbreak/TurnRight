-- Qualify receipt fields so the reader actor cannot shadow the decision actor.
-- CREATE OR REPLACE preserves the existing private function grants.
create or replace function source_decision_history(actor uuid,change_id text default null) returns jsonb
language plpgsql security definer set search_path=public set statement_timeout='10s' as $$
begin
 if not workspace_can(actor,'read') then raise sqlstate 'PT403' using message='Campus access required'; end if;
 return jsonb_build_object('decisions',coalesce((select jsonb_agg(to_jsonb(q)) from (
  select d.id,d.group_id,d.actor,d.outcome,d.reversal_of,d.created_at,jsonb_array_length(d.members) dependency_count,d.evidence
  from source_decision_receipts d where d.campus_id=current_campus_id() and (change_id is null or d.group_id=change_id)
  order by d.created_at desc limit 30
 ) q),'[]'),
 'legacyFindings',coalesce((select jsonb_agg(to_jsonb(q)) from (select id,source_id,status,reviewed_at,'Legacy routing identity changed; retained evidence requires manual review' finding from map_changes where campus_id=current_campus_id() and status='accepted' and before->>'entity'='edge' and (before#>'{payload,parentEdgeIds}') is not null and not exists(select 1 from source_decision_receipts d where d.campus_id=map_changes.campus_id and d.group_id=map_changes.id) order by reviewed_at desc limit 50) q),'[]'));
end $$;
notify pgrst,'reload schema';
