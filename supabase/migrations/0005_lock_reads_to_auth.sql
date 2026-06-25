-- ============================================================================
-- Hamsun Supply — lock the portal to an ALLOW-LIST of keepers.
-- Supabase Auth is shared across all the group's apps, so "logged in" is NOT
-- enough — access is granted only to users listed in invtt.profiles.
--
-- Public (anon) keeps read access only to what the /request page needs:
--   properties, departments, items (names).
-- Stock / movements / suppliers / products / requests are readable only by a
-- user whose id is in invtt.profiles. Writes are gated the same way inside the
-- Edge Functions. Re-runnable.
-- ============================================================================

-- helper predicate inline: auth.uid() is in invtt.profiles
-- (a SQL function keeps the policies short and consistent)
create or replace function invtt.is_keeper() returns boolean
  language sql stable security definer set search_path = invtt, public as $$
  select exists (select 1 from invtt.profiles p where p.id = auth.uid());
$$;
grant execute on function invtt.is_keeper() to anon, authenticated;

-- stock_movements ------------------------------------------------------------
drop policy if exists read_all    on invtt.stock_movements;
drop policy if exists read_auth   on invtt.stock_movements;
drop policy if exists read_keeper on invtt.stock_movements;
create policy read_keeper on invtt.stock_movements for select to authenticated using (invtt.is_keeper());
revoke select on invtt.stock_movements from anon;

-- requests -------------------------------------------------------------------
drop policy if exists read_all    on invtt.requests;
drop policy if exists read_auth   on invtt.requests;
drop policy if exists read_keeper on invtt.requests;
create policy read_keeper on invtt.requests for select to authenticated using (invtt.is_keeper());
revoke select on invtt.requests from anon;

-- suppliers ------------------------------------------------------------------
drop policy if exists read_all    on invtt.suppliers;
drop policy if exists read_auth   on invtt.suppliers;
drop policy if exists read_keeper on invtt.suppliers;
create policy read_keeper on invtt.suppliers for select to authenticated using (invtt.is_keeper());
revoke select on invtt.suppliers from anon;

-- products -------------------------------------------------------------------
drop policy if exists read_all    on invtt.products;
drop policy if exists read_auth   on invtt.products;
drop policy if exists read_keeper on invtt.products;
create policy read_keeper on invtt.products for select to authenticated using (invtt.is_keeper());
revoke select on invtt.products from anon;

-- v_item_stock (derived stock) — keepers only --------------------------------
revoke select on invtt.v_item_stock from anon;
grant  select on invtt.v_item_stock to authenticated;

-- Kept PUBLIC for /request: properties, departments, items (their read_all
-- policies from earlier migrations remain). profiles keeps its read_self policy
-- so the portal can check whether the signed-in user is a keeper.

notify pgrst, 'reload schema';
