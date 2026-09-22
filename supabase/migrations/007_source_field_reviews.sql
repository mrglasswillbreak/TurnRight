-- Descriptive fields can be accepted while disputed geometry stays pending.
create table public.source_field_reviews (
 id bigint generated always as identity primary key,
 change_id text not null,
 source_id text not null,
 selected_fields jsonb not null,
 before_record jsonb not null,
 after_record jsonb not null,
 actor_id uuid not null,
 reviewed_at timestamptz not null default now()
);
alter table public.source_field_reviews enable row level security;
revoke all on public.source_field_reviews from anon, authenticated;
grant all on public.source_field_reviews to service_role;
grant usage, select on sequence public.source_field_reviews_id_seq to service_role;

create function public.review_map_fields(change_id text, expected_before jsonb, expected_after jsonb, reviewed_record jsonb, selected_fields jsonb, actor_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare proposal map_changes; current_hash text;
begin
 if not exists(select 1 from admin_users where id=actor_id) then raise exception 'Editor access required'; end if;
 perform pg_advisory_xact_lock(hashtext('turnright-source-review'));
 select * into proposal from map_changes where id=change_id and status='pending' for update;
 if not found or proposal.kind <> 'modify' then raise exception 'Change is no longer pending'; end if;
 if proposal.before is distinct from expected_before or proposal.after is distinct from expected_after then raise exception 'Proposal changed. Refresh review.'; end if;
 select hash into current_hash from source_features where id=proposal.source_id for update;
 if current_hash is distinct from proposal.base_hash then raise exception 'Source changed. Refresh review.'; end if;
 if reviewed_record->>'id' <> proposal.source_id or reviewed_record->>'entity' <> proposal.before->>'entity' or jsonb_array_length(selected_fields)=0 then raise exception 'Invalid reviewed record'; end if;
 update source_features set payload=reviewed_record->'payload', hash=reviewed_record->>'hash', updated_at=now() where id=proposal.source_id;
 insert into source_field_reviews(change_id,source_id,selected_fields,before_record,after_record,actor_id)
 values(proposal.id,proposal.source_id,selected_fields,proposal.before,reviewed_record,actor_id);
 update map_changes set before=reviewed_record, base_hash=reviewed_record->>'hash',
 status=case when reviewed_record->'payload'=proposal.after->'payload' then 'accepted' else 'pending' end,
 reviewed_at=case when reviewed_record->'payload'=proposal.after->'payload' then now() else null end
 where id=proposal.id;
end $$;
revoke all on function public.review_map_fields(text,jsonb,jsonb,jsonb,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.review_map_fields(text,jsonb,jsonb,jsonb,jsonb,uuid) to service_role;
