-- ============================================================================
-- Hamsun Supply — notification read/unread + superadmin user management.
--   • requests.seen_at  : when a keeper first opened the notification (null = unread)
--   • invtt.is_superadmin(): true when the signed-in profile has role 'superadmin'
-- Additive and re-runnable.
-- ============================================================================

-- read/unread marker for notifications -------------------------------------
alter table invtt.requests add column if not exists seen_at timestamptz;

-- role column already exists (0002) — guard in case of a fresh DB ----------
alter table invtt.profiles add column if not exists role text not null default 'warehouse_keeper';

-- superadmin predicate ------------------------------------------------------
create or replace function invtt.is_superadmin() returns boolean
  language sql stable security definer set search_path = invtt, public as $$
  select exists (
    select 1 from invtt.profiles p
    where p.id = auth.uid() and p.role = 'superadmin'
  );
$$;
grant execute on function invtt.is_superadmin() to anon, authenticated;

notify pgrst, 'reload schema';
