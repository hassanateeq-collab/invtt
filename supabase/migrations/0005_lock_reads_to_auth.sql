-- ============================================================================
-- Hamsun Supply — lock sensitive reads to signed-in users (keeper login).
-- Public (anon) keeps read access only to what the public /request page needs:
--   properties, departments, items (names).
-- Everything else (stock, movements, suppliers, products, requests) becomes
-- login-only. Writes are additionally gated inside the Edge Functions.
-- Re-runnable.
-- ============================================================================

-- stock_movements ------------------------------------------------------------
drop policy if exists read_all  on invtt.stock_movements;
drop policy if exists read_auth on invtt.stock_movements;
create policy read_auth on invtt.stock_movements for select to authenticated using (true);
revoke select on invtt.stock_movements from anon;

-- requests -------------------------------------------------------------------
drop policy if exists read_all  on invtt.requests;
drop policy if exists read_auth on invtt.requests;
create policy read_auth on invtt.requests for select to authenticated using (true);
revoke select on invtt.requests from anon;

-- suppliers ------------------------------------------------------------------
drop policy if exists read_all  on invtt.suppliers;
drop policy if exists read_auth on invtt.suppliers;
create policy read_auth on invtt.suppliers for select to authenticated using (true);
revoke select on invtt.suppliers from anon;

-- products -------------------------------------------------------------------
drop policy if exists read_all  on invtt.products;
drop policy if exists read_auth on invtt.products;
create policy read_auth on invtt.products for select to authenticated using (true);
revoke select on invtt.products from anon;

-- v_item_stock (derived stock) — login only ----------------------------------
revoke select on invtt.v_item_stock from anon;
grant  select on invtt.v_item_stock to authenticated;

-- Kept PUBLIC for the /request page: properties, departments, items.
-- (their read_all policies from earlier migrations remain in place)

notify pgrst, 'reload schema';
