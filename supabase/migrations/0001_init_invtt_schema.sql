-- invtt portal — isolated schema bootstrap
-- SAFE: this only creates a NEW schema named `invtt` and objects inside it.
-- It never touches `public` or any other portal's schema/tables/data.
-- Re-runnable (idempotent).

create schema if not exists invtt;

-- Let the API roles use the new schema.
grant usage on schema invtt to anon, authenticated, service_role;

-- Starter table: inventory items.
create table if not exists invtt.items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sku         text unique,
  quantity    integer not null default 0,
  created_at  timestamptz not null default now()
);

-- Row Level Security on. Demo policy allows public READ so the welcome page
-- can prove connectivity. Tighten this once auth is added.
alter table invtt.items enable row level security;

drop policy if exists "items_public_read" on invtt.items;
create policy "items_public_read" on invtt.items
  for select using (true);

-- Grants for the API roles.
grant select on all tables in schema invtt to anon, authenticated;
grant all    on all tables in schema invtt to service_role;
alter default privileges in schema invtt
  grant select on tables to anon, authenticated;
alter default privileges in schema invtt
  grant all on tables to service_role;

-- A little seed data so the portal shows something real.
insert into invtt.items (name, sku, quantity) values
  ('Sample Widget', 'SKU-001', 42),
  ('Demo Gadget',   'SKU-002', 7)
on conflict (sku) do nothing;
