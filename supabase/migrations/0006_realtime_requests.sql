-- ============================================================================
-- Hamsun Supply — enable live updates for the request bell.
-- Adds invtt.requests to the Realtime publication so the keeper's portal is
-- notified the instant a department submits a request. Re-runnable.
-- (Realtime still respects RLS: only a keeper receives the events.)
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'invtt' and tablename = 'requests'
  ) then
    alter publication supabase_realtime add table invtt.requests;
  end if;
end $$;
