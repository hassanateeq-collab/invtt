-- ============================================================================
-- Hamsun Supply — supply-chain & inventory data model
-- Schema: invtt   (isolated from the hotel group's other portals: portal, hr)
--
-- GOLDEN RULES enforced by this design:
--   1. Current stock is NEVER stored. It is always derived by summing
--      stock_movements rows (see v_item_stock). There is no quantity_on_hand.
--   2. The browser can only READ. RLS exposes SELECT to anon/authenticated and
--      grants NO insert/update/delete. All writes go through Edge Functions
--      running with the service role (which bypasses RLS).
--   3. History is append-only. Corrections are new 'adjustment' rows; nothing
--      is ever updated or deleted in stock_movements.
-- ============================================================================

create schema if not exists invtt;
grant usage on schema invtt to anon, authenticated, service_role;

-- Remove the throwaway demo table from the welcome-page phase. It carried a
-- `quantity` column, which violates Golden Rule #1, and is replaced below.
drop view  if exists invtt.v_item_stock cascade;
drop table if exists invtt.items cascade;

-- ---------------------------------------------------------------------------
-- profiles — staff records, linked to Supabase Auth.
-- Unused while auth is off (MVP), present now so adding auth later is no-rework.
-- ---------------------------------------------------------------------------
create table if not exists invtt.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text not null default 'warehouse_keeper',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- properties — the four hotel branches.
-- ---------------------------------------------------------------------------
create table if not exists invtt.properties (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,             -- FSL, EXT, CLF, DHA
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- suppliers — outside vendors.
-- ---------------------------------------------------------------------------
create table if not exists invtt.suppliers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  contact        text,
  lead_time_days integer not null default 0,    -- days to deliver
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- items — master list of everything the hotel stocks.
-- ---------------------------------------------------------------------------
create table if not exists invtt.items (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references invtt.properties(id) on delete cascade,
  supplier_id   uuid references invtt.suppliers(id) on delete set null,
  name          text not null,
  unit          text not null,                  -- kg, litre, piece...
  type          text not null check (type in ('fresh','store')),
  par_level     numeric not null default 0 check (par_level >= 0),
  reorder_point numeric not null default 0 check (reorder_point >= 0),
  created_at    timestamptz not null default now()
);
create index if not exists items_property_idx on invtt.items(property_id);

-- ---------------------------------------------------------------------------
-- stock_movements — the immutable diary. Heart of the system.
--   in/out      : quantity is always positive
--   adjustment  : quantity is signed (+/-) to correct a count
--   expiry_date : only meaningful on 'in' rows for fresh items (batch use-by)
-- ---------------------------------------------------------------------------
create table if not exists invtt.stock_movements (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references invtt.items(id) on delete cascade,
  type        text not null check (type in ('in','out','adjustment')),
  quantity    numeric not null,
  reason      text,
  expiry_date date,
  staff_id    uuid references invtt.profiles(id),   -- nullable until auth is on
  created_at  timestamptz not null default now(),
  constraint movement_qty_rule check (
    (type in ('in','out') and quantity > 0) or
    (type = 'adjustment' and quantity <> 0)
  )
);
create index if not exists movements_item_idx on invtt.stock_movements(item_id);
create index if not exists movements_created_idx on invtt.stock_movements(created_at desc);

-- ---------------------------------------------------------------------------
-- requests — department requests (from Slack or the portal).
-- ---------------------------------------------------------------------------
create table if not exists invtt.requests (
  id                    uuid primary key default gen_random_uuid(),
  property_id           uuid not null references invtt.properties(id) on delete cascade,
  item_id               uuid not null references invtt.items(id) on delete cascade,
  quantity              numeric not null check (quantity > 0),
  department            text not null,
  status                text not null default 'pending'
                          check (status in ('pending','done','cancelled')),
  source                text not null default 'portal'
                          check (source in ('slack','portal')),
  fulfilled_movement_id uuid references invtt.stock_movements(id),
  created_at            timestamptz not null default now()
);
create index if not exists requests_property_status_idx
  on invtt.requests(property_id, status);

-- ============================================================================
-- v_item_stock — single source for the item list.
-- Returns each item with derived: current_stock, status, used_7d, buy_qty,
-- nearest_expiry. security_invoker so RLS of the querying role applies.
-- ============================================================================
create view invtt.v_item_stock with (security_invoker = true) as
with mv as (
  select
    item_id,
    sum(case when type = 'in'  then quantity
             when type = 'out' then -quantity
             else quantity end)                          as current_stock,
    sum(case when type = 'out'
              and created_at >= now() - interval '7 days'
             then quantity else 0 end)                   as used_7d,
    min(case when type = 'in' then expiry_date end)      as nearest_expiry
  from invtt.stock_movements
  group by item_id
)
select
  i.id,
  i.property_id,
  i.supplier_id,
  i.name,
  i.unit,
  i.type,
  i.par_level,
  i.reorder_point,
  i.created_at,
  coalesce(mv.current_stock, 0)                          as current_stock,
  case
    when coalesce(mv.current_stock, 0) <= 0               then 'out'
    when coalesce(mv.current_stock, 0) <= i.reorder_point then 'low'
    else 'ok'
  end                                                    as status,
  coalesce(mv.used_7d, 0)                                as used_7d,
  greatest(i.par_level - coalesce(mv.current_stock, 0), 0) as buy_qty,
  case when i.type = 'fresh' then mv.nearest_expiry end  as nearest_expiry
from invtt.items i
left join mv on mv.item_id = i.id;

-- ============================================================================
-- Row Level Security — client may READ ONLY. No write policies exist, so the
-- anon/authenticated roles cannot insert/update/delete. Service role (Edge
-- Functions) bypasses RLS entirely.
-- ============================================================================
alter table invtt.profiles        enable row level security;
alter table invtt.properties      enable row level security;
alter table invtt.suppliers       enable row level security;
alter table invtt.items           enable row level security;
alter table invtt.stock_movements enable row level security;
alter table invtt.requests        enable row level security;

drop policy if exists read_all on invtt.properties;
drop policy if exists read_all on invtt.suppliers;
drop policy if exists read_all on invtt.items;
drop policy if exists read_all on invtt.stock_movements;
drop policy if exists read_all on invtt.requests;
drop policy if exists read_self on invtt.profiles;

-- Public reference + operational data: readable by the client.
create policy read_all on invtt.properties      for select to anon, authenticated using (true);
create policy read_all on invtt.suppliers       for select to anon, authenticated using (true);
create policy read_all on invtt.items           for select to anon, authenticated using (true);
create policy read_all on invtt.stock_movements for select to anon, authenticated using (true);
create policy read_all on invtt.requests        for select to anon, authenticated using (true);
-- Profiles: once auth is on, a user can read their own row. (No rows yet.)
create policy read_self on invtt.profiles       for select to authenticated using (auth.uid() = id);

-- Read grants (RLS still gates rows; grants gate table access).
grant select on invtt.properties      to anon, authenticated;
grant select on invtt.suppliers       to anon, authenticated;
grant select on invtt.items           to anon, authenticated;
grant select on invtt.stock_movements to anon, authenticated;
grant select on invtt.requests        to anon, authenticated;
grant select on invtt.v_item_stock    to anon, authenticated;

-- Service role: full write access (Edge Functions are the only writers).
grant all on all tables in schema invtt to service_role;
alter default privileges in schema invtt grant all on tables to service_role;

notify pgrst, 'reload schema';
