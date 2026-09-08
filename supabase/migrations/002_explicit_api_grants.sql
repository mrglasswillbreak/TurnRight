-- New projects can disable automatic Data API grants. Keep access explicit.
begin;
grant usage on schema public to authenticated, service_role;
revoke all on public.admin_users, public.source_features, public.map_changes,
  public.map_edits, public.edit_history, public.reports, public.report_limits,
  public.jobs, public.releases from anon, authenticated;
grant select on public.admin_users, public.source_features, public.map_changes,
  public.map_edits, public.edit_history, public.reports, public.jobs, public.releases
  to authenticated;
grant all on public.admin_users, public.source_features, public.map_changes,
  public.map_edits, public.edit_history, public.reports, public.report_limits,
  public.jobs, public.releases to service_role;
grant usage, select on sequence public.edit_history_id_seq to service_role;
-- RLS still restricts authenticated reads to the singleton allowlisted owner.
commit;
